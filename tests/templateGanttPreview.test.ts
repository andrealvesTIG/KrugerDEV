import { describe, expect, it } from "vitest";
import {
  scheduleTemplateItems,
  type TemplateGanttItem,
} from "@/components/templates/TemplateGanttPreview";

function makeItem(partial: Partial<TemplateGanttItem> & { id: number; name: string }): TemplateGanttItem {
  return {
    id: partial.id,
    name: partial.name,
    taskId: partial.taskId ?? null,
    startDate: partial.startDate ?? null,
    endDate: partial.endDate ?? null,
    durationDays: partial.durationDays ?? null,
    outlineLevel: partial.outlineLevel ?? 1,
    parentTaskId: partial.parentTaskId ?? null,
    isSummary: partial.isSummary ?? false,
    isMilestone: partial.isMilestone ?? false,
    predecessors: partial.predecessors ?? null,
  };
}

describe("scheduleTemplateItems", () => {
  it("returns an empty schedule for no items", () => {
    const result = scheduleTemplateItems([]);
    expect(result.scheduled).toEqual([]);
    expect(result.totalDays).toBe(0);
    expect(result.origin).toBeNull();
  });

  it("uses the predecessor chain to lay out tasks sequentially", () => {
    const items: TemplateGanttItem[] = [
      makeItem({ id: 1, taskId: 1, name: "Phase A", isSummary: true }),
      makeItem({
        id: 2,
        taskId: 2,
        parentTaskId: 1,
        name: "Task A1",
        durationDays: 3,
      }),
      makeItem({
        id: 3,
        taskId: 3,
        parentTaskId: 1,
        name: "Task A2",
        durationDays: 5,
        predecessors: JSON.stringify([
          { predecessorTaskId: 2, type: "finish-to-start", lagDays: 0 },
        ]),
      }),
      makeItem({
        id: 4,
        taskId: 4,
        parentTaskId: 1,
        name: "Phase A complete",
        isMilestone: true,
        predecessors: JSON.stringify([
          { predecessorTaskId: 3, type: "finish-to-start", lagDays: 0 },
        ]),
      }),
    ];
    const { scheduled, totalDays } = scheduleTemplateItems(items);
    const byId = new Map(scheduled.map((s) => [s.item.id, s] as const));

    expect(byId.get(2)?.startDay).toBe(0);
    expect(byId.get(2)?.endDay).toBe(3);
    expect(byId.get(3)?.startDay).toBe(3);
    expect(byId.get(3)?.endDay).toBe(8);
    // Milestones occupy a single point in time
    expect(byId.get(4)?.startDay).toBe(8);
    expect(byId.get(4)?.endDay).toBe(8);
    // Summary should span the full child range
    expect(byId.get(1)?.startDay).toBe(0);
    expect(byId.get(1)?.endDay).toBe(8);
    expect(totalDays).toBe(8);
  });

  it("falls back to sequential ordering when there are no predecessors", () => {
    const items: TemplateGanttItem[] = [
      makeItem({ id: 1, taskId: 1, name: "Task 1", durationDays: 2 }),
      makeItem({ id: 2, taskId: 2, name: "Task 2", durationDays: 4 }),
      makeItem({ id: 3, taskId: 3, name: "Task 3", durationDays: 1 }),
    ];
    const { scheduled, totalDays } = scheduleTemplateItems(items);

    expect(scheduled[0].startDay).toBe(0);
    expect(scheduled[0].endDay).toBe(2);
    expect(scheduled[1].startDay).toBe(2);
    expect(scheduled[1].endDay).toBe(6);
    expect(scheduled[2].startDay).toBe(6);
    expect(scheduled[2].endDay).toBe(7);
    expect(totalDays).toBe(7);
  });

  it("uses real start/end dates when every leaf has them", () => {
    const items: TemplateGanttItem[] = [
      makeItem({ id: 1, taskId: 1, name: "Phase", isSummary: true }),
      makeItem({
        id: 2,
        taskId: 2,
        parentTaskId: 1,
        name: "Task 1",
        startDate: "2026-01-05",
        endDate: "2026-01-09",
      }),
      makeItem({
        id: 3,
        taskId: 3,
        parentTaskId: 1,
        name: "Milestone",
        isMilestone: true,
        startDate: "2026-01-12",
      }),
    ];
    const { scheduled, totalDays, origin } = scheduleTemplateItems(items);
    const byId = new Map(scheduled.map((s) => [s.item.id, s] as const));

    expect(origin).not.toBeNull();
    expect(byId.get(2)?.startDay).toBe(0);
    expect(byId.get(2)?.endDay).toBe(5);
    expect(byId.get(3)?.startDay).toBe(7);
    expect(byId.get(3)?.endDay).toBe(7);
    expect(byId.get(1)?.startDay).toBe(0);
    expect(byId.get(1)?.endDay).toBe(7);
    expect(totalDays).toBe(8);
  });

  it("falls back to relative scheduling when only some leaves have dates", () => {
    // Documents current behaviour: if any leaf is missing dates, the whole
    // chart is rendered as a relative timeline (origin === null) rather than
    // attempting to mix anchored and computed segments.
    const items: TemplateGanttItem[] = [
      makeItem({
        id: 1,
        taskId: 1,
        name: "Dated task",
        durationDays: 3,
        startDate: "2026-01-05",
        endDate: "2026-01-07",
      }),
      makeItem({
        id: 2,
        taskId: 2,
        name: "Undated task",
        durationDays: 4,
      }),
    ];
    const { scheduled, totalDays, origin } = scheduleTemplateItems(items);
    expect(origin).toBeNull();
    expect(scheduled[0].startDay).toBe(0);
    expect(scheduled[0].endDay).toBe(3);
    expect(scheduled[1].startDay).toBe(3);
    expect(scheduled[1].endDay).toBe(7);
    expect(totalDays).toBe(7);
  });

  it("ensures every task bar has at least one day of width", () => {
    const items: TemplateGanttItem[] = [
      makeItem({ id: 1, taskId: 1, name: "Zero-duration task", durationDays: 0 }),
    ];
    const { scheduled } = scheduleTemplateItems(items);
    expect(scheduled[0].endDay - scheduled[0].startDay).toBe(1);
  });
});
