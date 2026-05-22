import { describe, expect, it } from "vitest";
import {
  validateCustomFieldValue,
  CustomFieldValueError,
} from "../server/lib/customFieldValueValidator";

describe("validateCustomFieldValue — computed read-only types", () => {
  const COMPUTED = [
    "days_since_updated",
    "days_since_created",
    "effort_completed_hours",
    "effort_remaining_hours",
    "days_between_dates",
    "roi",
    "rag_rollup",
    "threshold_check",
    "formula",
  ];

  for (const fieldType of COMPUTED) {
    it(`rejects writes to "${fieldType}" with 400`, async () => {
      let caught: unknown;
      try {
        await validateCustomFieldValue(fieldType, "123", 1);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CustomFieldValueError);
      expect((caught as CustomFieldValueError).statusCode).toBe(400);
      expect((caught as CustomFieldValueError).message).toMatch(/read-only/);
    });
  }

  it("rejects roi writes even when value is null/empty", async () => {
    await expect(validateCustomFieldValue("roi", null, 1)).rejects.toBeInstanceOf(
      CustomFieldValueError,
    );
    await expect(validateCustomFieldValue("roi", "", 1)).rejects.toBeInstanceOf(
      CustomFieldValueError,
    );
  });

  it("passes through non-computed types (number, text)", async () => {
    await expect(validateCustomFieldValue("number", "42", 1)).resolves.toBe("42");
    await expect(validateCustomFieldValue("text", "hello", 1)).resolves.toBe("hello");
  });
});
