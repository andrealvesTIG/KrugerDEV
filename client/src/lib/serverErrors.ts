import type { UseFormReturn, FieldValues, Path } from "react-hook-form";

/**
 * Parse a server validation error message produced by the API's
 * `formatZodErrors` helper. The server returns strings shaped like:
 *
 *   "status: Invalid status 'Done'. Allowed values: Not Started, In Progress;
 *    priority: Invalid priority 'Urgent'. Allowed values: Low, Medium, High"
 *
 * This returns a map of `{ field: message }` that the UI can use to show
 * inline form errors. A `_form` key is used to capture any segments that
 * don't match the expected `field: message` shape so the caller can fall
 * back to a toast for those.
 */
export function parseServerValidationErrors(
  raw: string | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw) return result;

  // Split on "; " but only at the top level — `Allowed values: a, b` segments
  // are separated by ", " not "; ", so this naive split is safe.
  const segments = raw.split(/;\s+/);
  const generic: string[] = [];
  for (const segment of segments) {
    const match = segment.match(/^([a-zA-Z_][a-zA-Z0-9_.]*):\s+(.*)$/s);
    if (match) {
      const [, field, message] = match;
      // If the same field appears twice, join the messages.
      result[field] = result[field] ? `${result[field]}; ${message}` : message;
    } else if (segment.trim().length > 0) {
      generic.push(segment.trim());
    }
  }
  if (generic.length > 0) {
    result._form = generic.join("; ");
  }
  return result;
}

/**
 * Apply parsed server validation errors to a react-hook-form instance so the
 * fields they refer to render inline error messages. Returns an object that
 * tells the caller whether any field-level errors were applied (so they can
 * decide whether to also show a toast for "form" / unknown errors).
 */
export function applyServerErrorsToForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  rawMessage: string | null | undefined,
  knownFields: ReadonlyArray<Path<T>>,
): { appliedFields: string[]; unknownMessage: string | null } {
  const parsed = parseServerValidationErrors(rawMessage);
  const known = new Set<string>(knownFields as readonly string[]);
  const applied: string[] = [];
  const leftovers: string[] = [];

  for (const [field, message] of Object.entries(parsed)) {
    if (field === "_form") {
      leftovers.push(message);
      continue;
    }
    if (known.has(field)) {
      form.setError(field as Path<T>, { type: "server", message });
      applied.push(field);
    } else {
      leftovers.push(`${field}: ${message}`);
    }
  }

  return {
    appliedFields: applied,
    unknownMessage: leftovers.length > 0 ? leftovers.join("; ") : null,
  };
}
