import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Stub out the db module so importing route helpers doesn't try to open a
// real connection during the test.
vi.mock('../server/db', () => ({
  db: {},
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

const storageMock = {
  getOrganization: vi.fn(),
  getOrganizationBySlug: vi.fn(),
};

vi.mock('../server/storage', () => ({
  storage: storageMock,
}));

const userHasOrgAccessMock = vi.fn();

// Mock just the helpers the route depends on. The route file imports a large
// surface area from `./helpers`, so we provide stand-ins for everything it
// touches at module load time.
vi.mock('../server/routes/helpers', () => ({
  classifyError: (err: unknown) => ({
    status: 500,
    message: err instanceof Error ? err.message : String(err),
  }),
  getUserIdFromRequest: (req: any) =>
    req.headers?.['x-test-user-id'] as string | undefined,
  sanitizeUser: (u: any) => u,
  sanitizeUsers: (us: any) => us,
  hasAdminAccess: () => false,
  userHasOrgAccess: (userId: string | undefined, orgId: number) =>
    userHasOrgAccessMock(userId, orgId),
  getUserOrgIds: async () => [] as number[],
  userHasAnyOrgAccess: async () => true,
  requireEmailVerified: async () => ({ verified: true }),
  getUserOrgRole: async () => null,
  isTeamMemberInOrg: async () => false,
  getUserResourceIds: async () => [],
  getTeamMemberAccessData: async () => ({}),
  getTeamMemberProjectIds: async () => [],
  getTeamMemberTaskIds: async () => [],
  getTeamMemberRiskIds: async () => [],
  getTeamMemberIssueIds: async () => [],
  getTeamMemberPortfolioIds: async () => [],
  normalizeSearchStr: (s: string) => s,
  logUserActivity: async () => {},
  upload: { single: () => (_req: any, _res: any, next: any) => next() },
  imageUpload: { single: () => (_req: any, _res: any, next: any) => next() },
  openai: {},
  encryptApiKey: (s: string) => s,
  decryptApiKey: (s: string) => s,
  parseMppFile: async () => ({}),
  parseXmlMspdi: async () => ({}),
  parseCsv: async () => [],
  parseDate: (s: string) => new Date(s),
  seedDatabase: async () => {},
  formatZodErrors: (e: any) => String(e),
}));

const TEST_USER_ID = 'user-1';
const ORG = { id: 17, slug: 'acme', name: 'Acme Inc' };

async function buildApp() {
  const app = express();
  app.use(express.json());
  const { registerOrganizationRoutes } = await import(
    '../server/routes/organizationRoutes'
  );
  registerOrganizationRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getOrganization.mockReset();
  storageMock.getOrganizationBySlug.mockReset();
  userHasOrgAccessMock.mockReset();
});

describe('GET /api/organizations/resolve', () => {
  it('resolves a slug for a member and returns isMember: true', async () => {
    const app = await buildApp();
    storageMock.getOrganizationBySlug.mockResolvedValue(ORG);
    userHasOrgAccessMock.mockResolvedValue(true);

    const res = await request(app)
      .get('/api/organizations/resolve?key=acme')
      .set('x-test-user-id', TEST_USER_ID);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ORG.id,
      slug: ORG.slug,
      name: ORG.name,
      isMember: true,
    });
    expect(storageMock.getOrganizationBySlug).toHaveBeenCalledWith('acme');
    expect(storageMock.getOrganization).not.toHaveBeenCalled();
    expect(userHasOrgAccessMock).toHaveBeenCalledWith(TEST_USER_ID, ORG.id);
  });

  it('resolves a numeric id by calling getOrganization (not getOrganizationBySlug)', async () => {
    const app = await buildApp();
    storageMock.getOrganization.mockResolvedValue(ORG);
    userHasOrgAccessMock.mockResolvedValue(true);

    const res = await request(app)
      .get(`/api/organizations/resolve?key=${ORG.id}`)
      .set('x-test-user-id', TEST_USER_ID);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ORG.id,
      slug: ORG.slug,
      name: ORG.name,
      isMember: true,
    });
    expect(storageMock.getOrganization).toHaveBeenCalledWith(ORG.id);
    expect(storageMock.getOrganizationBySlug).not.toHaveBeenCalled();
  });

  it('returns isMember: false (still 200) when the user is not a member', async () => {
    const app = await buildApp();
    storageMock.getOrganizationBySlug.mockResolvedValue(ORG);
    userHasOrgAccessMock.mockResolvedValue(false);

    const res = await request(app)
      .get('/api/organizations/resolve?key=acme')
      .set('x-test-user-id', TEST_USER_ID);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ORG.id,
      slug: ORG.slug,
      name: ORG.name,
      isMember: false,
    });
  });

  it('returns 404 when no organization matches the key', async () => {
    const app = await buildApp();
    storageMock.getOrganizationBySlug.mockResolvedValue(undefined);

    const res = await request(app)
      .get('/api/organizations/resolve?key=does-not-exist')
      .set('x-test-user-id', TEST_USER_ID);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Organization not found' });
    expect(userHasOrgAccessMock).not.toHaveBeenCalled();
  });

  it('returns 401 when no user id is supplied (unauthenticated)', async () => {
    const app = await buildApp();

    const res = await request(app).get('/api/organizations/resolve?key=acme');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Authentication required' });
    expect(storageMock.getOrganizationBySlug).not.toHaveBeenCalled();
    expect(storageMock.getOrganization).not.toHaveBeenCalled();
  });

  it('returns 400 when the key query parameter is missing or blank', async () => {
    const app = await buildApp();

    const missing = await request(app)
      .get('/api/organizations/resolve')
      .set('x-test-user-id', TEST_USER_ID);
    expect(missing.status).toBe(400);

    const blank = await request(app)
      .get('/api/organizations/resolve?key=%20%20')
      .set('x-test-user-id', TEST_USER_ID);
    expect(blank.status).toBe(400);
  });
});
