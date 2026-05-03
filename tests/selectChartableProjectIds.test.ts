import { describe, it, expect } from 'vitest';
import { selectChartableProjectIds } from '../server/services/jarvisService';

describe('selectChartableProjectIds', () => {
  it('includes canonical lifecycle states (Initiation/Planning/Execution/Monitoring/Closing/Billing)', () => {
    const projects = [
      { id: 1, status: 'Initiation' },
      { id: 2, status: 'Planning' },
      { id: 3, status: 'Execution' },
      { id: 4, status: 'Monitoring' },
      { id: 5, status: 'Closing' },
      { id: 6, status: 'Billing' },
    ];
    expect(selectChartableProjectIds(projects)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('excludes terminal states (Closed/Cancelled/Completed/Archived)', () => {
    const projects = [
      { id: 1, status: 'Execution' },
      { id: 2, status: 'Closed' },
      { id: 3, status: 'Cancelled' },
      { id: 4, status: 'Completed' },
      { id: 5, status: 'Archived' },
      { id: 6, status: 'Monitoring' },
    ];
    expect(selectChartableProjectIds(projects)).toEqual([1, 6]);
  });

  it('treats unknown and null statuses as chartable so older rows are not silently dropped', () => {
    const projects = [
      { id: 1, status: null },
      { id: 2, status: 'Active' }, // legacy value
      { id: 3, status: 'On Hold' }, // legacy value
      { id: 4, status: 'WhoKnows' },
    ];
    expect(selectChartableProjectIds(projects)).toEqual([1, 2, 3, 4]);
  });

  it('caps the returned set at 200 to keep the Friday payload bounded', () => {
    const projects = Array.from({ length: 250 }, (_, i) => ({
      id: i + 1,
      status: 'Execution',
    }));
    const ids = selectChartableProjectIds(projects);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe(1);
    expect(ids[199]).toBe(200);
  });
});
