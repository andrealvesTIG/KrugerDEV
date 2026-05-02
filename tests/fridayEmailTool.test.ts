import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../server/db', () => ({
  db: {},
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

const sendEmailMock = vi.fn();
vi.mock('../server/services/email', () => ({
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));

const getGeneratedFileForUserMock = vi.fn();
vi.mock('../server/services/fridayGeneratedFiles', () => ({
  getGeneratedFileForUser: (...args: any[]) => getGeneratedFileForUserMock(...args),
}));

let memberRows: Array<{ email: string }> = [];
let resourceRows: Array<{ email: string }> = [];
let senderRow: { email: string; firstName: string | null; lastName: string | null } | undefined =
  { email: 'me@org.test', firstName: 'Me', lastName: 'User' };

vi.mock('../server/db', async () => {
  const select = vi.fn(() => {
    let target: 'members' | 'resources' | 'sender' = 'sender';
    const builder: any = {
      from: (table: any) => {
        const name = String(table?.[Symbol.for('drizzle:Name')] ?? '');
        if (name === 'organization_members') target = 'members';
        else if (name === 'resources') target = 'resources';
        else target = 'sender';
        return builder;
      },
      innerJoin: () => builder,
      where: () => {
        if (target === 'members') return Promise.resolve(memberRows);
        if (target === 'resources') return Promise.resolve(resourceRows);
        return Promise.resolve(senderRow ? [senderRow] : []);
      },
    };
    return builder;
  });
  return { db: { select }, pool: { on: () => {}, query: () => Promise.resolve() } };
});

beforeEach(() => {
  sendEmailMock.mockReset();
  getGeneratedFileForUserMock.mockReset();
  memberRows = [{ email: 'alice@org.test' }, { email: 'bob@org.test' }];
  resourceRows = [{ email: 'contractor@org.test' }];
  senderRow = { email: 'me@org.test', firstName: 'Me', lastName: 'User' };
  sendEmailMock.mockResolvedValue(true);
});

describe('sendFridayEmail', () => {
  it('sends one email per To recipient and shares CC', async () => {
    const { sendFridayEmail } = await import('../server/services/fridayEmailTool');
    const result = await sendFridayEmail(1, 'me', {
      to: ['alice@org.test', 'bob@org.test'],
      cc: ['contractor@org.test'],
      subject: 'Hello',
      body: 'Hi team\n\n- one\n- two',
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('alice@org.test');
    expect(sendEmailMock.mock.calls[1][0].to).toBe('bob@org.test');
    for (const call of sendEmailMock.mock.calls) {
      expect(call[0].cc).toEqual(['contractor@org.test']);
      expect(call[0].subject).toBe('Hello');
      expect(call[0].html).toContain('<li>one</li>');
    }
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.to).toEqual(['alice@org.test', 'bob@org.test']);
  });

  it('rejects recipients not in the org', async () => {
    const { sendFridayEmail } = await import('../server/services/fridayEmailTool');
    const result = await sendFridayEmail(1, 'me', {
      to: ['outsider@example.com'],
      subject: 'Hi',
      body: 'Body',
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toMatch(/outsider@example\.com/);
  });

  it('attaches a generated PDF when pdfId is supplied', async () => {
    getGeneratedFileForUserMock.mockReturnValue({
      id: 'pdf-1',
      userId: 'me',
      orgId: 1,
      filename: 'report.pdf',
      contentType: 'application/pdf',
      buffer: Buffer.from('PDFDATA'),
      createdAt: Date.now(),
    });
    const { sendFridayEmail } = await import('../server/services/fridayEmailTool');
    const result = await sendFridayEmail(1, 'me', {
      to: ['alice@org.test'],
      subject: 'Report',
      body: 'See attached.',
      pdfId: 'pdf-1',
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].filename).toBe('report.pdf');
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.attachedFilenames).toEqual(['report.pdf']);
  });

  it('fails cleanly when pdfId is unknown or expired', async () => {
    getGeneratedFileForUserMock.mockReturnValue(undefined);
    const { sendFridayEmail } = await import('../server/services/fridayEmailTool');
    const result = await sendFridayEmail(1, 'me', {
      to: ['alice@org.test'],
      subject: 'x',
      body: 'y',
      pdfId: 'gone',
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toMatch(/expired|not be found/i);
  });

  it('reports partial failures when some sends fail', async () => {
    sendEmailMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { sendFridayEmail } = await import('../server/services/fridayEmailTool');
    const result = await sendFridayEmail(1, 'me', {
      to: ['alice@org.test', 'bob@org.test'],
      subject: 'x',
      body: 'y',
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.to).toEqual(['alice@org.test']);
    expect(parsed.failedTo).toEqual(['bob@org.test']);
  });
});
