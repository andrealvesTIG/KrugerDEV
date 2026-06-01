import { describe, it, expect } from "vitest";
import {
  normalizeActualRows,
  matchActuals,
  buildActualsODataUrl,
  buildResourcesODataUrl,
  buildResourceEmailMap,
  applyResourceEmails,
  PROJECT_ONLINE_TIMESHEET_SOURCE,
  type RawActualRow,
  type MatchContext,
} from "../server/services/projectOnlineTimesheetSync";

describe("normalizeActualRows", () => {
  it("normalizes assignment timephased rows and drops zero/no-date rows", () => {
    const rows: RawActualRow[] = [
      {
        ProjectUID: "P1",
        ProjectName: "Alpha",
        TaskUID: "T1",
        TaskName: "Design",
        ResourceUID: "R1",
        ResourceName: "Jane Doe",
        TimeByDay: "2026-05-12T00:00:00",
        AssignmentActualWork: 8,
      },
      // zero hours -> dropped
      { ProjectUID: "P1", TaskUID: "T1", ResourceUID: "R1", TimeByDay: "2026-05-13T00:00:00", AssignmentActualWork: 0 },
      // no date -> dropped
      { ProjectUID: "P1", TaskUID: "T1", ResourceUID: "R1", AssignmentActualWork: 4 },
    ];
    const out = normalizeActualRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalProjectId: "P1",
      projectName: "Alpha",
      externalTaskId: "T1",
      taskName: "Design",
      externalResourceId: "R1",
      resourceName: "Jane Doe",
      date: "2026-05-12",
      hours: 8,
    });
  });

  it("falls back to timesheet-line billable/non-billable fields", () => {
    const rows: RawActualRow[] = [
      {
        ProjectName: "Beta",
        TaskName: "Build",
        ResourceName: "Sam",
        TimeByDay: "2026-05-12",
        ActualWorkBillable: 3,
        ActualWorkNonBillable: 1.5,
      },
    ];
    const out = normalizeActualRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].hours).toBe(4.5);
  });
});

function ctx(): MatchContext {
  return {
    resources: [
      { id: 10, name: "Jane Doe", email: "jane@acme.com", userId: "u-jane" },
      { id: 11, name: "No Login", email: "nologin@acme.com", userId: null },
    ],
    projects: [
      { id: 100, name: "Alpha", externalSource: PROJECT_ONLINE_TIMESHEET_SOURCE, externalId: "P1" },
      { id: 101, name: "Gamma" },
    ],
    tasks: [
      { id: 1000, name: "Design", projectId: 100, externalId: "T1" },
      { id: 1001, name: "Build", projectId: 101 },
    ],
  };
}

describe("matchActuals", () => {
  it("matches by external id and email, aggregating same day/task", () => {
    const normalized = normalizeActualRows([
      { ProjectUID: "P1", TaskUID: "T1", ResourceName: "Jane Doe", ResourceEmailAddress: "jane@acme.com", TimeByDay: "2026-05-12", AssignmentActualWork: 5 },
      { ProjectUID: "P1", TaskUID: "T1", ResourceEmailAddress: "jane@acme.com", TimeByDay: "2026-05-12", AssignmentActualWork: 3 },
    ]);
    const result = matchActuals(normalized, ctx());
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ resourceId: 10, userId: "u-jane", projectId: 100, taskId: 1000, entryDate: "2026-05-12", hours: 8 });
    expect(result.unmatched).toHaveLength(0);
  });

  it("matches project and task by name when no external id", () => {
    const normalized = normalizeActualRows([
      { ProjectName: "Gamma", TaskName: "Build", ResourceName: "Jane Doe", TimeByDay: "2026-05-12", AssignmentActualWork: 2 },
    ]);
    const result = matchActuals(normalized, ctx());
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ projectId: 101, taskId: 1001, resourceId: 10 });
  });

  it("reports unmatched project, resource, task, and missing-user cases", () => {
    const normalized = normalizeActualRows([
      { ProjectName: "Unknown", TaskName: "X", ResourceName: "Jane Doe", TimeByDay: "2026-05-12", AssignmentActualWork: 1 },
      { ProjectName: "Alpha", TaskName: "Design", ResourceName: "Ghost", TimeByDay: "2026-05-12", AssignmentActualWork: 1 },
      { ProjectName: "Alpha", TaskName: "DoesNotExist", ResourceName: "Jane Doe", TimeByDay: "2026-05-12", AssignmentActualWork: 1 },
      { ProjectName: "Alpha", TaskName: "Design", ResourceName: "No Login", TimeByDay: "2026-05-12", AssignmentActualWork: 1 },
    ]);
    const result = matchActuals(normalized, ctx());
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(4);
    const reasons = result.unmatched.map((u) => u.reason);
    expect(reasons).toContain("Project not found in this workspace");
    expect(reasons).toContain("Resource not found in this workspace");
    expect(reasons).toContain("Task not found in the matched project");
    expect(reasons).toContain("Resource has no linked user account");
  });

  it("produces a stable composite externalId", () => {
    const normalized = normalizeActualRows([
      { ProjectUID: "P1", TaskUID: "T1", ResourceUID: "R1", ResourceEmailAddress: "jane@acme.com", TimeByDay: "2026-05-12", AssignmentActualWork: 5 },
    ]);
    const result = matchActuals(normalized, ctx());
    expect(result.matched[0].externalId).toBe("P1:T1:R1:2026-05-12");
  });
});

describe("buildActualsODataUrl", () => {
  it("builds a filtered, ordered reporting URL", () => {
    const url = buildActualsODataUrl("https://acme.sharepoint.com/sites/pwa/", "2026-05-01", "2026-05-31");
    expect(url).toContain("/_api/ProjectData/AssignmentTimephasedDataSet?");
    expect(url).toContain("AssignmentActualWork");
    const decoded = decodeURIComponent(url).replace(/\+/g, " ");
    expect(decoded).toContain("TimeByDay ge datetime'2026-05-01T00:00:00'");
    expect(decoded).toContain("TimeByDay le datetime'2026-05-31T23:59:59'");
    expect(url).not.toContain("pwa//_api");
  });
});

describe("buildResourcesODataUrl", () => {
  it("builds a Resources URL selecting email", () => {
    const url = buildResourcesODataUrl("https://acme.sharepoint.com/sites/pwa/");
    expect(url).toContain("/_api/ProjectData/Resources?");
    expect(decodeURIComponent(url)).toContain("ResourceEmailAddress");
    expect(url).not.toContain("pwa//_api");
  });
});

describe("resource email enrichment", () => {
  it("builds a UID→email map and skips rows without both fields", () => {
    const map = buildResourceEmailMap([
      { ResourceUID: "R1", ResourceEmailAddress: "jane@acme.com" },
      { ResourceUID: "R2", ResourceEmailAddress: "  " },
      { ResourceEmailAddress: "nouid@acme.com" },
    ]);
    expect(map).toEqual({ R1: "jane@acme.com" });
  });

  it("fills missing emails by UID and lets email-first matching succeed", () => {
    // No email on the actuals row, and a different display name than the app
    // resource — only the UID→email map can rescue the match.
    const normalized = normalizeActualRows([
      { ProjectUID: "P1", TaskUID: "T1", ResourceUID: "R1", ResourceName: "J. Doe", TimeByDay: "2026-05-12", AssignmentActualWork: 6 },
    ]);
    expect(normalized[0].resourceEmail).toBeNull();

    const enriched = applyResourceEmails(normalized, { R1: "jane@acme.com" });
    expect(enriched[0].resourceEmail).toBe("jane@acme.com");

    const result = matchActuals(enriched, ctx());
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].resourceId).toBe(10);
  });

  it("leaves an existing row email untouched", () => {
    const normalized = normalizeActualRows([
      { ProjectUID: "P1", TaskUID: "T1", ResourceUID: "R1", ResourceEmailAddress: "real@acme.com", TimeByDay: "2026-05-12", AssignmentActualWork: 2 },
    ]);
    const enriched = applyResourceEmails(normalized, { R1: "other@acme.com" });
    expect(enriched[0].resourceEmail).toBe("real@acme.com");
  });
});
