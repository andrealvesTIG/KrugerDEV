// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-organization', () => ({
  useOrganization: () => ({
    currentOrganization: { id: 42, slug: 'acme', name: 'Acme' },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'u@x.com' } }),
}));

// The Create / Power BI dialogs pull in unrelated browser deps (speech
// recognition, mutations) — stub them so the component under test can
// render in jsdom.
vi.mock('@/components/dashboard/CreateCustomDashboardDialog', () => ({
  CreateCustomDashboardDialog: () => null,
}));
vi.mock('@/components/dashboard/AddPowerBIDialog', () => ({
  AddPowerBIDialog: () => null,
}));

import { AgentDashboardsDashboard } from '@/components/dashboard/AgentDashboardsDashboard';

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

function renderDashboard(onOpenDashboard: (id: number) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentDashboardsDashboard onOpenDashboard={onOpenDashboard} />
    </QueryClientProvider>,
  );
}

const aiDashboard = {
  id: 11,
  organizationId: 42,
  userId: 'user-1',
  name: 'Sales overview',
  description: 'AI-generated overview of sales pipeline',
  config: {
    widgets: [{ id: 'w1', type: 'kpi', title: 'Revenue', dataSource: 'projects', size: 'small' }],
    layout: 'grid',
  },
  createdAt: '2026-04-01T12:00:00Z',
  updatedAt: '2026-04-02T13:00:00Z',
};

const powerBiDashboard = {
  id: 22,
  organizationId: 42,
  userId: 'user-1',
  name: 'Quarterly Power BI',
  description: 'Power BI Report: Quarterly Power BI',
  config: {
    widgets: [
      {
        id: 'w-pbi',
        type: 'powerbi-embed',
        title: 'Quarterly Power BI',
        dataSource: 'external',
        size: 'full',
        embedUrl: 'https://app.powerbi.com/view?r=abc',
      },
    ],
    layout: 'grid',
  },
  createdAt: '2026-04-01T12:00:00Z',
  updatedAt: '2026-04-03T13:00:00Z',
};

describe('<AgentDashboardsDashboard />', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders rows from /api/custom-dashboards with the right source badge', async () => {
    global.fetch = makeFetchMock([
      [
        '/api/custom-dashboards?',
        () => ({ body: [aiDashboard, powerBiDashboard] }),
      ],
    ]) as unknown as typeof fetch;

    const { findByTestId } = renderDashboard(vi.fn());

    const aiRow = await findByTestId('agent-dashboard-row-11');
    expect(aiRow.textContent).toContain('Sales overview');
    const aiBadge = await findByTestId('agent-dashboard-source-11');
    expect(aiBadge.textContent).toMatch(/AI/);

    const pbiRow = await findByTestId('agent-dashboard-row-22');
    expect(pbiRow.textContent).toContain('Quarterly Power BI');
    const pbiBadge = await findByTestId('agent-dashboard-source-22');
    expect(pbiBadge.textContent).toMatch(/Power BI/);
  });

  it('Open invokes onOpenDashboard with the dashboard id', async () => {
    global.fetch = makeFetchMock([
      ['/api/custom-dashboards?', () => ({ body: [aiDashboard] })],
    ]) as unknown as typeof fetch;

    const onOpenDashboard = vi.fn();
    const { findByTestId } = renderDashboard(onOpenDashboard);

    const openBtn = await findByTestId('agent-dashboard-open-11');
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(onOpenDashboard).toHaveBeenCalledWith(11);
    });
  });

  it('Delete confirms and calls DELETE /api/custom-dashboards/:id', async () => {
    const deleteCalls: string[] = [];
    global.fetch = makeFetchMock([
      ['/api/custom-dashboards?', () => ({ body: [aiDashboard] })],
      [
        /\/api\/custom-dashboards\/11/,
        (url, init) => {
          if ((init?.method || 'GET').toUpperCase() === 'DELETE') {
            deleteCalls.push(url);
            return { body: { message: 'ok' } };
          }
          return { status: 404, body: {} };
        },
      ],
    ]) as unknown as typeof fetch;

    const { findByTestId, queryByTestId } = renderDashboard(vi.fn());

    fireEvent.click(await findByTestId('agent-dashboard-delete-11'));
    fireEvent.click(await findByTestId('button-confirm-delete-dashboard'));

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1);
    });
    expect(deleteCalls[0]).toContain('/api/custom-dashboards/11');

    await waitFor(() => {
      expect(queryByTestId('agent-dashboard-row-11')).toBeNull();
    });
  });

  it('shows empty state with Generate / Power BI buttons when no dashboards exist', async () => {
    global.fetch = makeFetchMock([
      ['/api/custom-dashboards?', () => ({ body: [] })],
    ]) as unknown as typeof fetch;

    const { findByText, findByTestId } = renderDashboard(vi.fn());
    await findByText(/No custom dashboards yet/i);
    await findByTestId('button-empty-generate-with-ai');
    await findByTestId('button-empty-add-powerbi');
  });
});
