import { describe, it, expect } from 'vitest';
import {
  withOrg,
  stripOrg,
  isOrgScopedPath,
  stripTrailingEntityId,
  ORG_QUERY_PARAM,
} from '../client/src/lib/orgUrl';

describe('isOrgScopedPath', () => {
  it('returns true for normal app paths', () => {
    expect(isOrgScopedPath('/projects')).toBe(true);
    expect(isOrgScopedPath('/projects/123')).toBe(true);
    expect(isOrgScopedPath('/dashboard')).toBe(true);
    expect(isOrgScopedPath('/admin/users')).toBe(true);
  });

  it('returns false for the public auth/marketing prefixes', () => {
    expect(isOrgScopedPath('/auth')).toBe(false);
    expect(isOrgScopedPath('/auth/callback')).toBe(false);
    expect(isOrgScopedPath('/signin')).toBe(false);
    expect(isOrgScopedPath('/reset-password')).toBe(false);
    expect(isOrgScopedPath('/verify-email')).toBe(false);
    expect(isOrgScopedPath('/onboarding')).toBe(false);
    expect(isOrgScopedPath('/terms')).toBe(false);
    expect(isOrgScopedPath('/privacy')).toBe(false);
    expect(isOrgScopedPath('/healthcare')).toBe(false);
    expect(isOrgScopedPath('/financial-services')).toBe(false);
    expect(isOrgScopedPath('/partners')).toBe(false);
  });

  it('treats slash-terminated prefixes as both exact + nested matches', () => {
    // `/badges/` in the prefix list — both `/badges` and `/badges/anything`
    // should be excluded.
    expect(isOrgScopedPath('/badges')).toBe(false);
    expect(isOrgScopedPath('/badges/abc-123')).toBe(false);
    expect(isOrgScopedPath('/media')).toBe(false);
    expect(isOrgScopedPath('/media/article')).toBe(false);
    expect(isOrgScopedPath('/risk-assessment/share/abc')).toBe(false);
    expect(isOrgScopedPath('/project-risk-assessment/share/xyz')).toBe(false);
  });

  it('does NOT treat non-prefix lookalike paths as public', () => {
    // A path that merely starts with the same letters but is a different
    // segment must remain org-scoped.
    expect(isOrgScopedPath('/authentication-config')).toBe(true);
    expect(isOrgScopedPath('/signups-report')).toBe(true);
    expect(isOrgScopedPath('/healthcare-overview')).toBe(true);
  });

  it('returns false for empty / non-absolute paths', () => {
    expect(isOrgScopedPath('')).toBe(false);
    expect(isOrgScopedPath('projects')).toBe(false);
    expect(isOrgScopedPath('https://example.com/projects')).toBe(false);
  });
});

describe('withOrg', () => {
  it('appends ?org=<slug> to a bare path', () => {
    expect(withOrg('/projects', 'acme')).toBe('/projects?org=acme');
  });

  it('preserves existing query params and adds org', () => {
    const out = withOrg('/projects?status=open', 'acme');
    const search = new URLSearchParams(out.split('?')[1]);
    expect(search.get('status')).toBe('open');
    expect(search.get(ORG_QUERY_PARAM)).toBe('acme');
  });

  it('replaces an existing org param rather than duplicating it', () => {
    const out = withOrg('/projects?org=old&status=open', 'acme');
    const search = new URLSearchParams(out.split('?')[1]);
    expect(search.getAll(ORG_QUERY_PARAM)).toEqual(['acme']);
    expect(search.get('status')).toBe('open');
  });

  it('preserves the hash fragment', () => {
    expect(withOrg('/projects#tasks', 'acme')).toBe('/projects?org=acme#tasks');
    expect(withOrg('/projects?status=open#tab', 'acme')).toContain('#tab');
  });

  it('returns the href unchanged for empty / null slug', () => {
    expect(withOrg('/projects', null)).toBe('/projects');
    expect(withOrg('/projects', undefined)).toBe('/projects');
    expect(withOrg('/projects', '')).toBe('/projects');
  });

  it('returns the href unchanged when the path is public / non-org-scoped', () => {
    expect(withOrg('/auth', 'acme')).toBe('/auth');
    expect(withOrg('/signin', 'acme')).toBe('/signin');
    expect(withOrg('/badges/abc', 'acme')).toBe('/badges/abc');
  });

  it('passes external hrefs through untouched', () => {
    expect(withOrg('https://example.com/path', 'acme')).toBe('https://example.com/path');
    expect(withOrg('http://example.com', 'acme')).toBe('http://example.com');
    expect(withOrg('mailto:foo@bar.com', 'acme')).toBe('mailto:foo@bar.com');
    expect(withOrg('//cdn.example.com/x', 'acme')).toBe('//cdn.example.com/x');
    expect(withOrg('tel:+15551234567', 'acme')).toBe('tel:+15551234567');
  });

  it('returns empty input as-is', () => {
    expect(withOrg('', 'acme')).toBe('');
  });
});

describe('stripOrg', () => {
  it('removes the org param and leaves other params alone', () => {
    expect(stripOrg('/projects?org=acme')).toBe('/projects');
    expect(stripOrg('/projects?status=open&org=acme')).toBe('/projects?status=open');
    expect(stripOrg('/projects?org=acme&status=open')).toBe('/projects?status=open');
  });

  it('preserves the hash fragment', () => {
    expect(stripOrg('/projects?org=acme#tab')).toBe('/projects#tab');
    expect(stripOrg('/projects?status=open&org=acme#tab')).toBe('/projects?status=open#tab');
  });

  it('returns the href unchanged when there is no query string', () => {
    expect(stripOrg('/projects')).toBe('/projects');
    expect(stripOrg('/projects#tab')).toBe('/projects#tab');
  });

  it('passes external hrefs through untouched', () => {
    expect(stripOrg('https://example.com/path?org=acme')).toBe(
      'https://example.com/path?org=acme',
    );
    expect(stripOrg('mailto:foo@bar.com?org=acme')).toBe('mailto:foo@bar.com?org=acme');
  });

  it('returns empty input as-is', () => {
    expect(stripOrg('')).toBe('');
  });
});

describe('stripTrailingEntityId', () => {
  it('strips numeric ids after collection prefixes', () => {
    expect(stripTrailingEntityId('/projects/123')).toBe('/projects');
    expect(stripTrailingEntityId('/portfolios/42')).toBe('/portfolios');
    expect(stripTrailingEntityId('/intakes/9')).toBe('/intakes');
    expect(stripTrailingEntityId('/resources/5')).toBe('/resources');
    expect(stripTrailingEntityId('/admin/users/77')).toBe('/admin/users');
  });

  it('strips uuid ids', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(stripTrailingEntityId(`/projects/${uuid}`)).toBe('/projects');
  });

  it('strips opaque cuid-like ids (>=16 alphanumeric chars)', () => {
    expect(stripTrailingEntityId('/projects/ckabc123def456ghi')).toBe('/projects');
  });

  it('also drops anything below the entity id (sub-routes of an entity)', () => {
    expect(stripTrailingEntityId('/projects/123/tasks')).toBe('/projects');
    expect(stripTrailingEntityId('/projects/123/tasks/45')).toBe('/projects');
  });

  it('preserves static sub-routes that are NOT entity ids', () => {
    expect(stripTrailingEntityId('/training/schedule-management')).toBe(
      '/training/schedule-management',
    );
    expect(stripTrailingEntityId('/projects/new')).toBe('/projects/new');
    expect(stripTrailingEntityId('/projects/edit')).toBe('/projects/edit');
    expect(stripTrailingEntityId('/admin/users/invite')).toBe('/admin/users/invite');
  });

  it('returns the path unchanged when already at a collection root', () => {
    expect(stripTrailingEntityId('/projects')).toBe('/projects');
    expect(stripTrailingEntityId('/projects/')).toBe('/projects/');
  });

  it('returns the path unchanged when no collection prefix matches', () => {
    expect(stripTrailingEntityId('/dashboard/123')).toBe('/dashboard/123');
    expect(stripTrailingEntityId('/settings')).toBe('/settings');
    expect(stripTrailingEntityId('')).toBe('');
  });
});
