import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../server/db', () => ({
  db: {},
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

const sendIntakeStepTransitionEmailMock = vi.fn();

vi.mock('../server/services/email', () => ({
  sendIntakeStepTransitionEmail: sendIntakeStepTransitionEmailMock,
}));

const storageMock = {
  getProjectIntake: vi.fn(),
  updateProjectIntake: vi.fn(),
  getOrganizationMembers: vi.fn(),
  getUser: vi.fn(),
  getOrganization: vi.fn(),
  getIntakeWorkflowSteps: vi.fn(),
  upsertIntakeWorkflowSteps: vi.fn(),
  ensureDefaultIntakeWorkflow: vi.fn(),
};

vi.mock('../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../server/routes/helpers', () => ({
  classifyError: (err: unknown) => ({
    status: 500,
    message: err instanceof Error ? err.message : String(err),
  }),
  getUserIdFromRequest: (req: any) => req.headers?.['x-test-user-id'] as string | undefined,
  hasAdminAccess: (user: any) => user?.role === 'super_admin',
  userHasOrgAccess: async (userId: string | undefined, _orgId: number) => !!userId,
  getUserOrgIds: async (userId: string | undefined) => (userId ? [TEST_ORG_ID] : []),
  requireEmailVerified: async (userId: string | undefined) =>
    userId ? { verified: true } : { verified: false, error: 'Authentication required' },
}));

const TEST_ORG_ID = 42;
const ADMIN_USER_ID = 'admin-user';
const ACTOR_NAME = 'Ada Admin';

async function buildApp() {
  const app = express();
  app.use(express.json());
  const { registerIntakeRoutes } = await import('../server/routes/intakeRoutes');
  registerIntakeRoutes(app);
  return app;
}

async function waitForCondition(
  predicate: () => boolean,
  {
    timeoutMs = 1000,
    intervalMs = 5,
    description = 'condition',
  }: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!predicate()) {
    throw new Error(`waitForCondition timed out after ${timeoutMs}ms waiting for ${description}`);
  }
}

async function settleAsync(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  sendIntakeStepTransitionEmailMock.mockReset();
  sendIntakeStepTransitionEmailMock.mockResolvedValue(true);

  storageMock.getOrganizationMembers.mockResolvedValue([
    { userId: ADMIN_USER_ID, organizationId: TEST_ORG_ID, role: 'org_admin' },
  ]);
  storageMock.getUser.mockResolvedValue({
    id: ADMIN_USER_ID,
    role: 'org_admin',
    firstName: 'Ada',
    lastName: 'Admin',
    email: 'ada@example.com',
  });
  storageMock.getOrganization.mockResolvedValue({ id: TEST_ORG_ID, name: 'Test Org' });
  storageMock.upsertIntakeWorkflowSteps.mockImplementation(async (_orgId, steps) => steps);
  storageMock.ensureDefaultIntakeWorkflow.mockResolvedValue({ id: 7, organizationId: TEST_ORG_ID });
  storageMock.getIntakeWorkflowSteps.mockResolvedValue([]);
});

describe('PUT /api/organizations/:orgId/intake-workflow — email recipient validation', () => {
  it('saves valid recipient lists with dedupe + lowercase normalization', async () => {
    const app = await buildApp();

    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG_ID}/intake-workflow?workflowId=7`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({
        steps: [
          {
            stepKey: 'triage',
            label: 'Triage',
            position: 0,
            notifyOnEntry: ['Alice@Example.com', 'alice@example.com', '  BOB@example.com  '],
            notifyOnExit: ['carol@example.com'],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(storageMock.upsertIntakeWorkflowSteps).toHaveBeenCalledTimes(1);
    const [, savedSteps] = storageMock.upsertIntakeWorkflowSteps.mock.calls[0];
    expect(savedSteps[0].notifyOnEntry).toEqual(['alice@example.com', 'bob@example.com']);
    expect(savedSteps[0].notifyOnExit).toEqual(['carol@example.com']);
  });

  it('treats null recipient lists as empty arrays', async () => {
    const app = await buildApp();

    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG_ID}/intake-workflow?workflowId=7`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({
        steps: [
          {
            stepKey: 'triage',
            label: 'Triage',
            position: 0,
            notifyOnEntry: null,
            notifyOnExit: null,
          },
        ],
      });

    expect(res.status).toBe(200);
    const [, savedSteps] = storageMock.upsertIntakeWorkflowSteps.mock.calls[0];
    expect(savedSteps[0].notifyOnEntry).toEqual([]);
    expect(savedSteps[0].notifyOnExit).toEqual([]);
  });

  it('returns 400 when an invalid email address is provided', async () => {
    const app = await buildApp();

    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG_ID}/intake-workflow?workflowId=7`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({
        steps: [
          {
            stepKey: 'triage',
            label: 'Triage',
            position: 0,
            notifyOnEntry: ['valid@example.com', 'not-an-email'],
            notifyOnExit: [],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid email address/i);
    expect(storageMock.upsertIntakeWorkflowSteps).not.toHaveBeenCalled();
  });

  it('returns 400 when notifyOnExit contains an invalid email address', async () => {
    const app = await buildApp();

    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG_ID}/intake-workflow?workflowId=7`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({
        steps: [
          {
            stepKey: 'triage',
            label: 'Triage',
            position: 0,
            notifyOnEntry: [],
            notifyOnExit: ['ok@example.com', '@bad'],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid email address/i);
    expect(storageMock.upsertIntakeWorkflowSteps).not.toHaveBeenCalled();
  });

  it('returns 400 when notifyOnEntry is not an array', async () => {
    const app = await buildApp();

    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG_ID}/intake-workflow?workflowId=7`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({
        steps: [
          {
            stepKey: 'triage',
            label: 'Triage',
            position: 0,
            notifyOnEntry: 'not-an-array@example.com',
            notifyOnExit: [],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(storageMock.upsertIntakeWorkflowSteps).not.toHaveBeenCalled();
  });
});

describe('PUT /api/project-intakes/:id — step transition email triggering', () => {
  const intakeId = 123;
  const workflowId = 7;

  function setupIntake(currentStep: string, wfId: number = workflowId, nextStep?: string, nextWfId?: number) {
    const baseRow = {
      id: intakeId,
      organizationId: TEST_ORG_ID,
      workflowId: wfId,
      currentStep,
      submitterId: ADMIN_USER_ID,
      intakeNumber: 'INT-001',
      projectName: 'Test Project',
    };
    // The PUT /api/project-intakes/:id route calls getProjectIntake twice:
    // once to load the pre-update row (for auth + previousStep) and once
    // after updateProjectIntake to enrich the response with audit fields.
    // First call returns the pre-update row; subsequent calls return the
    // post-update row when one was provided, otherwise the same row.
    storageMock.getProjectIntake.mockReset();
    storageMock.getProjectIntake.mockResolvedValueOnce(baseRow);
    if (nextStep !== undefined) {
      storageMock.getProjectIntake.mockResolvedValue({
        ...baseRow,
        currentStep: nextStep,
        workflowId: nextWfId ?? wfId,
      });
    } else {
      storageMock.getProjectIntake.mockResolvedValue(baseRow);
    }
  }

  function setupWorkflowSteps() {
    storageMock.getIntakeWorkflowSteps.mockResolvedValue([
      {
        stepKey: 'triage',
        label: 'Triage',
        position: 0,
        notifyOnExit: ['exit@example.com'],
        notifyOnEntry: [],
      },
      {
        stepKey: 'business_case',
        label: 'Business Case',
        position: 1,
        notifyOnExit: [],
        notifyOnEntry: ['entry1@example.com', 'entry2@example.com'],
      },
    ]);
  }

  it('sends exit and entry emails when currentStep changes', async () => {
    setupIntake('triage', workflowId, 'business_case');
    setupWorkflowSteps();
    storageMock.updateProjectIntake.mockResolvedValue({
      id: intakeId,
      organizationId: TEST_ORG_ID,
      workflowId,
      currentStep: 'business_case',
      intakeNumber: 'INT-001',
      projectName: 'Test Project',
    });

    const app = await buildApp();
    const res = await request(app)
      .put(`/api/project-intakes/${intakeId}`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ currentStep: 'business_case' });

    expect(res.status).toBe(200);
    await waitForCondition(() => sendIntakeStepTransitionEmailMock.mock.calls.length >= 3, {
      description: '3 transition emails to be dispatched',
    });

    const recipients = sendIntakeStepTransitionEmailMock.mock.calls.map((c) => c[0]);
    expect(recipients).toEqual(
      expect.arrayContaining(['exit@example.com', 'entry1@example.com', 'entry2@example.com']),
    );
    expect(sendIntakeStepTransitionEmailMock).toHaveBeenCalledTimes(3);

    const exitCall = sendIntakeStepTransitionEmailMock.mock.calls.find(
      (c) => c[0] === 'exit@example.com',
    );
    expect(exitCall?.[1]).toMatchObject({
      transition: 'exit',
      stepLabel: 'Triage',
      toStepLabel: 'Business Case',
      intakeId,
      projectName: 'Test Project',
      organizationName: 'Test Org',
      actorName: ACTOR_NAME,
    });

    const entryCall = sendIntakeStepTransitionEmailMock.mock.calls.find(
      (c) => c[0] === 'entry1@example.com',
    );
    expect(entryCall?.[1]).toMatchObject({
      transition: 'entry',
      stepLabel: 'Business Case',
      fromStepLabel: 'Triage',
      intakeId,
      organizationName: 'Test Org',
      actorName: ACTOR_NAME,
    });
  });

  it('does not send any emails when currentStep and workflowId are unchanged', async () => {
    setupIntake('triage', workflowId, 'triage');
    setupWorkflowSteps();
    storageMock.updateProjectIntake.mockResolvedValue({
      id: intakeId,
      organizationId: TEST_ORG_ID,
      workflowId,
      currentStep: 'triage',
      intakeNumber: 'INT-001',
      projectName: 'Test Project',
    });

    const app = await buildApp();
    const res = await request(app)
      .put(`/api/project-intakes/${intakeId}`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ projectName: 'Renamed Project' });

    expect(res.status).toBe(200);
    await settleAsync();

    expect(sendIntakeStepTransitionEmailMock).not.toHaveBeenCalled();
    expect(storageMock.getIntakeWorkflowSteps).not.toHaveBeenCalled();
  });

  it('does not send emails when the only configured recipients are empty', async () => {
    setupIntake('triage', workflowId, 'business_case');
    storageMock.getIntakeWorkflowSteps.mockResolvedValue([
      { stepKey: 'triage', label: 'Triage', position: 0, notifyOnExit: [], notifyOnEntry: [] },
      { stepKey: 'business_case', label: 'Business Case', position: 1, notifyOnExit: [], notifyOnEntry: [] },
    ]);
    storageMock.updateProjectIntake.mockResolvedValue({
      id: intakeId,
      organizationId: TEST_ORG_ID,
      workflowId,
      currentStep: 'business_case',
      intakeNumber: 'INT-001',
      projectName: 'Test Project',
    });

    const app = await buildApp();
    const res = await request(app)
      .put(`/api/project-intakes/${intakeId}`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ currentStep: 'business_case' });

    expect(res.status).toBe(200);
    await settleAsync();

    expect(sendIntakeStepTransitionEmailMock).not.toHaveBeenCalled();
  });

  it('still returns the updated intake when an email send fails', async () => {
    setupIntake('triage', workflowId, 'business_case');
    setupWorkflowSteps();
    storageMock.updateProjectIntake.mockResolvedValue({
      id: intakeId,
      organizationId: TEST_ORG_ID,
      workflowId,
      currentStep: 'business_case',
      intakeNumber: 'INT-001',
      projectName: 'Test Project',
    });
    sendIntakeStepTransitionEmailMock.mockRejectedValue(new Error('SMTP unavailable'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = await buildApp();
    const res = await request(app)
      .put(`/api/project-intakes/${intakeId}`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ currentStep: 'business_case' });

    expect(res.status).toBe(200);
    expect(res.body.currentStep).toBe('business_case');
    await waitForCondition(() => sendIntakeStepTransitionEmailMock.mock.calls.length > 0, {
      description: 'at least one transition email attempt',
    });

    expect(sendIntakeStepTransitionEmailMock).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('uses fromSteps for both ends when previousWorkflowId equals nextWorkflowId', async () => {
    setupIntake('triage', workflowId, 'business_case');
    setupWorkflowSteps();
    storageMock.updateProjectIntake.mockResolvedValue({
      id: intakeId,
      organizationId: TEST_ORG_ID,
      workflowId,
      currentStep: 'business_case',
      intakeNumber: 'INT-001',
      projectName: 'Test Project',
    });

    const app = await buildApp();
    await request(app)
      .put(`/api/project-intakes/${intakeId}`)
      .set('x-test-user-id', ADMIN_USER_ID)
      .send({ currentStep: 'business_case' });

    await waitForCondition(() => storageMock.getIntakeWorkflowSteps.mock.calls.length >= 1, {
      description: 'workflow steps to be fetched',
    });
    expect(storageMock.getIntakeWorkflowSteps).toHaveBeenCalledTimes(1);
  });
});
