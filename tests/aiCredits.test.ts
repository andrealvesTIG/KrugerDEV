import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));

const mockCheck = vi.fn();
const mockRecord = vi.fn();

vi.mock("../server/services/billing", () => ({
  checkAndEnforceLimit: (...args: any[]) => mockCheck(...args),
  recordCreditUsage: (...args: any[]) => mockRecord(...args),
  METER_CODES: { AI_RUNS: "ai_runs" },
  RESOURCE_TYPES: { AI_RUN: "ai_runs" },
}));

import {
  withAiCredits,
  enforceAiCredits,
  recordAiCredits,
  AiCreditsLimitError,
  sendLimitExceeded,
  writeSseLimitExceeded,
} from "../server/services/aiCredits";

describe("aiCredits", () => {
  beforeEach(() => {
    mockCheck.mockReset();
    mockRecord.mockReset();
  });

  describe("withAiCredits (under limit)", () => {
    it("runs the wrapped function and records exactly one credit", async () => {
      mockCheck.mockResolvedValue({ allowed: true });
      mockRecord.mockResolvedValue(undefined);

      const fn = vi.fn().mockResolvedValue("ok");
      const result = await withAiCredits(
        { userId: "u1", orgId: 7, action: "friday_chat", entityId: 42 },
        fn,
      );

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockCheck).toHaveBeenCalledTimes(1);
      expect(mockCheck).toHaveBeenCalledWith("u1", "ai_runs", 1, 7);
      expect(mockRecord).toHaveBeenCalledTimes(1);
      expect(mockRecord.mock.calls[0][0]).toBe("u1");
      expect(mockRecord.mock.calls[0][1]).toBe("ai_runs");
      expect(mockRecord.mock.calls[0][3]).toBe(7);
    });
  });

  describe("withAiCredits (over limit)", () => {
    it("throws AiCreditsLimitError without running fn or recording usage", async () => {
      mockCheck.mockResolvedValue({ allowed: false, error: "Plan exhausted" });
      const fn = vi.fn().mockResolvedValue("never");

      await expect(
        withAiCredits({ userId: "u1", orgId: 7, action: "friday_chat" }, fn),
      ).rejects.toBeInstanceOf(AiCreditsLimitError);

      expect(fn).not.toHaveBeenCalled();
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it("AiCreditsLimitError carries 403 + ai_runs metadata", async () => {
      mockCheck.mockResolvedValue({ allowed: false, error: "out of credits" });
      try {
        await enforceAiCredits({ userId: "u1", orgId: 7, action: "friday_chat" });
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AiCreditsLimitError);
        expect((err as AiCreditsLimitError).status).toBe(403);
        expect((err as AiCreditsLimitError).limitExceeded).toBe(true);
        expect((err as AiCreditsLimitError).resourceType).toBe("ai_runs");
        expect((err as AiCreditsLimitError).message).toBe("out of credits");
      }
    });
  });

  describe("recordAiCredits idempotency", () => {
    it("forwards a stable requestId to recordCreditUsage so retries dedupe", async () => {
      mockRecord.mockResolvedValue(undefined);
      const ctx = {
        userId: "u1",
        orgId: 7,
        action: "friday_chat",
        entityId: 42,
        requestId: "stable-req-id-123",
      };
      await recordAiCredits("u1", ctx);
      await recordAiCredits("u1", ctx);
      await recordAiCredits("u1", ctx);

      expect(mockRecord).toHaveBeenCalledTimes(3);
      // recordCreditUsage(userId, resourceType, resourceId, orgId, requestId)
      // both arg[2] (resourceId) and arg[4] (requestId) must be the stable id
      // so the underlying usage_events table truly dedupes on retries.
      for (const call of mockRecord.mock.calls) {
        expect(call[2]).toBe("stable-req-id-123");
        expect(call[4]).toBe("stable-req-id-123");
        expect(call[3]).toBe(7);
      }
    });

    it("generates unique requestIds when none is provided", async () => {
      mockRecord.mockResolvedValue(undefined);
      const ctx = { userId: "u1", orgId: 7, action: "friday_chat", entityId: 42 };
      await recordAiCredits("u1", ctx);
      await new Promise((r) => setTimeout(r, 2));
      await recordAiCredits("u1", ctx);

      const reqIds = mockRecord.mock.calls.map((c) => c[2]);
      expect(reqIds[0]).not.toBe(reqIds[1]);
      expect(reqIds[0].startsWith("friday_chat_42_")).toBe(true);
      // requestId arg (5th) must equal resourceId arg (3rd) for idempotency
      for (const call of mockRecord.mock.calls) {
        expect(call[4]).toBe(call[2]);
      }
    });
  });

  describe("sendLimitExceeded", () => {
    it("returns false for non-limit errors", () => {
      const res: any = { status: vi.fn(), json: vi.fn(), headersSent: false };
      expect(sendLimitExceeded(res, new Error("boom"))).toBe(false);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("writes a 403 limitExceeded JSON for AiCreditsLimitError", () => {
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const res: any = { status, json: vi.fn(), headersSent: false };
      const handled = sendLimitExceeded(
        res,
        new AiCreditsLimitError("nope"),
      );
      expect(handled).toBe(true);
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        message: "nope",
        limitExceeded: true,
        resourceType: "ai_runs",
      });
    });

    it("does not write twice if headers already sent", () => {
      const status = vi.fn();
      const res: any = { status, headersSent: true };
      const handled = sendLimitExceeded(res, new AiCreditsLimitError("nope"));
      expect(handled).toBe(true);
      expect(status).not.toHaveBeenCalled();
    });
  });

  describe("writeSseLimitExceeded", () => {
    it("emits SSE error event and ends the stream", () => {
      const write = vi.fn();
      const end = vi.fn();
      const res: any = { write, end };
      const handled = writeSseLimitExceeded(
        res,
        new AiCreditsLimitError("nope"),
      );
      expect(handled).toBe(true);
      expect(write).toHaveBeenCalledTimes(1);
      const payload = write.mock.calls[0][0] as string;
      expect(payload.startsWith("data: ")).toBe(true);
      const data = JSON.parse(payload.slice(6).trim());
      expect(data).toEqual({
        error: "nope",
        limitExceeded: true,
        resourceType: "ai_runs",
      });
      expect(end).toHaveBeenCalledTimes(1);
    });

    it("returns false for unrelated errors", () => {
      const res: any = { write: vi.fn(), end: vi.fn() };
      expect(writeSseLimitExceeded(res, new Error("oops"))).toBe(false);
      expect(res.write).not.toHaveBeenCalled();
    });
  });
});
