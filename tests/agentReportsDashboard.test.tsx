// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Stable org for the dashboard component.
vi.mock('@/hooks/use-organization', () => ({
  useOrganization: () => ({
    currentOrganization: { id: 42, slug: 'acme', name: 'Acme' },
  }),
}));

// Toast hook is invoked even when not asserted; provide a no-op.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// We don't want the ShareReportDialog or PDF flow to pull in heavy
// browser-only deps in jsdom; stub the heavy imports.
vi.mock('@/components/jarvis/ShareReportDialog', () => ({
  ShareReportDialog: () => null,
}));
vi.mock('@/components/jarvis/FridayReportCard', () => ({
  downloadReportAsPdf: vi.fn(),
}));

import { AgentReportsDashboard } from '@/components/dashboard/AgentReportsDashboard';

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => { status?: number; body: unknown };

function makeFetchMock(handlers: Array<[RegExp | string, FetchHandler]>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, handler] of handlers) {
      const matches =
        typeof pattern === 'string'
          ? url.includes(pattern)
          : pattern.test(url);
      if (matches) {
        const out = handler(url, init);
        return new Response(JSON.stringify(out.body ?? null), {
          status: out.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response('not mocked', { status: 404 });
  });
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentReportsDashboard />
    </QueryClientProvider>,
  );
}

const baseReport = {
  id: 1,
  organizationId: 42,
  savedByUserId: 'user-1',
  title: 'Q4 Friday Report',
  subtitle: 'October status',
  generatedAt: '2026-04-01T12:00:00Z',
  createdAt: '2026-04-02T13:00:00Z',
  shareToken: null as string | null,
};

describe('<AgentReportsDashboard />', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders rows from /api/jarvis/saved-reports', async () => {
    global.fetch = makeFetchMock([
      [
        '/api/jarvis/saved-reports?',
        () => ({ body: [baseReport, { ...baseReport, id: 2, title: 'Weekly Standup' }] }),
      ],
      ['/members', () => ({ body: [] })],
    ]) as unknown as typeof fetch;

    const { findByTestId } = renderDashboard();

    const row1 = await findByTestId('agent-report-row-1');
    expect(row1.textContent).toContain('Q4 Friday Report');
    expect(row1.textContent).toContain('October status');
    const row2 = await findByTestId('agent-report-row-2');
    expect(row2.textContent).toContain('Weekly Standup');
  });

  it('shows empty state when no reports exist', async () => {
    global.fetch = makeFetchMock([
      ['/api/jarvis/saved-reports?', () => ({ body: [] })],
      ['/members', () => ({ body: [] })],
    ]) as unknown as typeof fetch;

    const { findByText } = renderDashboard();
    await findByText(/Save a report from a Friday chat/i);
  });

  it('Delete confirms and calls DELETE /api/jarvis/saved-reports/:id', async () => {
    const deleteCalls: string[] = [];
    global.fetch = makeFetchMock([
      ['/api/jarvis/saved-reports?', () => ({ body: [baseReport] })],
      ['/members', () => ({ body: [] })],
      [
        /\/api\/jarvis\/saved-reports\/1/,
        (url, init) => {
          if ((init?.method || 'GET').toUpperCase() === 'DELETE') {
            deleteCalls.push(url);
            return { body: { ok: true } };
          }
          return { status: 404, body: { message: 'not found' } };
        },
      ],
    ]) as unknown as typeof fetch;

    const { findByTestId, queryByTestId } = renderDashboard();

    const deleteBtn = await findByTestId('agent-report-delete-1');
    fireEvent.click(deleteBtn);

    const confirmBtn = await findByTestId('button-confirm-delete-report');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1);
    });
    expect(deleteCalls[0]).toContain('/api/jarvis/saved-reports/1');
    expect(deleteCalls[0]).toContain('organizationId=42');

    // Row is removed from cache after success.
    await waitFor(() => {
      expect(queryByTestId('agent-report-row-1')).toBeNull();
    });
  });

  it('filters rows by title via the search box', async () => {
    global.fetch = makeFetchMock([
      [
        '/api/jarvis/saved-reports?',
        () => ({
          body: [
            baseReport,
            { ...baseReport, id: 2, title: 'Weekly Standup', subtitle: null },
          ],
        }),
      ],
      ['/members', () => ({ body: [] })],
    ]) as unknown as typeof fetch;

    const { findByTestId, queryByTestId } = renderDashboard();
    await findByTestId('agent-report-row-1');
    await findByTestId('agent-report-row-2');

    const search = await findByTestId('input-agent-reports-search');
    fireEvent.change(search, { target: { value: 'standup' } });

    await waitFor(() => {
      expect(queryByTestId('agent-report-row-1')).toBeNull();
      expect(queryByTestId('agent-report-row-2')).not.toBeNull();
    });
  });
});
