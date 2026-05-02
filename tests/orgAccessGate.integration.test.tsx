// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Stable user for the OrganizationProvider's `useAuth()` dependency. Without
// a logged-in user the provider's queries stay disabled and the resolver
// flow we want to exercise never runs.
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@example.com' } }),
}));

import { OrganizationProvider, useOrganization } from '@/hooks/use-organization';
import { OrgAccessDenied } from '@/components/OrgAccessDenied';

// Mirrors the production `OrgAccessGate` defined inline in `App.tsx`. We
// intentionally render the *real* `useOrganization()` hook so this test
// catches regressions in the provider's URL → resolver → gate pipeline,
// not just the OrgAccessDenied component itself.
function GateChild() {
  const { accessDeniedOrg } = useOrganization();
  if (accessDeniedOrg) return <OrgAccessDenied />;
  return <div data-testid="protected-content">protected content</div>;
}

type FetchHandler = () => unknown;
function makeFetchMock(handlers: Array<[string, FetchHandler]>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, handler] of handlers) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(handler()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response('not mocked', { status: 404 });
  });
}

function renderWithProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationProvider>
        <GateChild />
      </OrganizationProvider>
    </QueryClientProvider>,
  );
}

describe('OrganizationProvider → OrgAccessGate (integration)', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Land on an org-scoped path with `?org=forbidden` so the provider's
    // URL-driven resolution kicks in.
    window.history.replaceState({}, '', '/?org=forbidden');
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    window.history.replaceState({}, '', '/');
  });

  it('renders OrgAccessDenied when /api/organizations/resolve returns isMember: false', async () => {
    const resolveHandler = vi.fn(() => ({
      id: 99,
      slug: 'forbidden',
      name: 'Forbidden Inc',
      isMember: false,
    }));

    global.fetch = makeFetchMock([
      // Order matters — `/api/organizations/resolve` must be checked before
      // the more general `/api/organizations`.
      ['/api/users/user-1/organizations', () => []],
      ['/api/organizations/resolve', resolveHandler],
      ['/api/organizations', () => []],
    ]) as unknown as typeof fetch;

    const { findByTestId, queryByTestId } = renderWithProvider();

    // The access-denied screen replaces the protected children once the
    // resolver fetch settles with isMember: false.
    const title = await findByTestId('text-access-denied-title');
    expect(title.textContent).toContain("You don't have access to this organization");
    const orgLine = await findByTestId('text-access-denied-org');
    expect(orgLine.textContent).toContain('Forbidden Inc');
    expect(queryByTestId('protected-content')).toBeNull();

    // The provider must have called the resolver with the URL's `?org=`
    // value verbatim.
    await waitFor(() => expect(resolveHandler).toHaveBeenCalled());
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const calledResolve = fetchMock.mock.calls.some(([input]) =>
      String(input).includes('/api/organizations/resolve?key=forbidden'),
    );
    expect(calledResolve).toBe(true);
  });

  it('renders the protected children (NOT the gate) when the resolver returns isMember: true', async () => {
    global.fetch = makeFetchMock([
      ['/api/users/user-1/organizations', () => []],
      [
        '/api/organizations/resolve',
        () => ({ id: 7, slug: 'forbidden', name: 'Allowed Inc', isMember: true }),
      ],
      ['/api/organizations', () => [{ id: 7, slug: 'forbidden', name: 'Allowed Inc' }]],
    ]) as unknown as typeof fetch;

    const { findByTestId, queryByTestId } = renderWithProvider();

    await findByTestId('protected-content');
    expect(queryByTestId('text-access-denied-title')).toBeNull();
  });
});
