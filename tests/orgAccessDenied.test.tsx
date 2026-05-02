import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Presentational tests for `<OrgAccessDenied />`. They verify the visual
// contract — null when there is no access-denied org, the offending org's
// name + sign-out fallback when there is one, and per-org switch buttons
// only when the user has memberships available.
//
// The flow that decides *when* the gate appears (URL → resolver fetch →
// OrganizationProvider state) is exercised separately by
// `tests/orgAccessGate.integration.test.tsx`, which renders the real
// provider with a mocked resolver fetch.

const useOrganizationMock = vi.fn();
vi.mock('@/hooks/use-organization', () => ({
  useOrganization: () => useOrganizationMock(),
}));

import { OrgAccessDenied } from '../client/src/components/OrgAccessDenied';

beforeEach(() => {
  useOrganizationMock.mockReset();
});

describe('<OrgAccessDenied /> (presentational)', () => {
  it('renders nothing when there is no access-denied org', () => {
    useOrganizationMock.mockReturnValue({
      accessDeniedOrg: null,
      organizations: [],
      setCurrentOrganization: vi.fn(),
    });

    const html = renderToStaticMarkup(React.createElement(OrgAccessDenied));
    expect(html).toBe('');
  });

  it('renders the access-denied screen with the offending org name', () => {
    useOrganizationMock.mockReturnValue({
      accessDeniedOrg: { id: 99, slug: 'forbidden', name: 'Forbidden Inc' },
      organizations: [],
      setCurrentOrganization: vi.fn(),
    });

    const html = renderToStaticMarkup(React.createElement(OrgAccessDenied));

    // React serializes apostrophes as `&#x27;` in static markup.
    expect(html).toContain('You don&#x27;t have access to this organization');
    expect(html).toContain('Forbidden Inc');
    expect(html).toContain('text-access-denied-title');
    expect(html).toContain('text-access-denied-org');
    expect(html).toContain('You are not a member of any other organizations');
    expect(html).not.toContain('button-switch-to-org-');
    expect(html).toContain('button-access-denied-signout');
  });

  it('lists switch buttons for each organization the user belongs to', () => {
    useOrganizationMock.mockReturnValue({
      accessDeniedOrg: { id: 99, slug: 'forbidden', name: 'Forbidden Inc' },
      organizations: [
        { id: 1, slug: 'acme', name: 'Acme Corp' },
        { id: 2, slug: 'globex', name: 'Globex' },
      ],
      setCurrentOrganization: vi.fn(),
    });

    const html = renderToStaticMarkup(React.createElement(OrgAccessDenied));

    expect(html).toContain('Switch to one of your organizations');
    expect(html).toContain('button-switch-to-org-1');
    expect(html).toContain('button-switch-to-org-2');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Globex');
    expect(html).not.toContain('You are not a member of any other organizations');
  });
});
