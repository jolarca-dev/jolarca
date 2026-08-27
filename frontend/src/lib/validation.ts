/**
 * Accessible form validation helpers — pure functions, unit-tested.
 * Convention: every field with an error gets `aria-invalid="true"` and
 * `aria-describedby` pointing at its error element (`<fieldId>-error`),
 * so screen readers announce the reason, not just the state.
 *
 * The form-level ErrorSummary lives at
 * `src/components/client/a11y/error-summary.tsx` (it needs client hooks);
 * these helpers keep the association contract in one testable place.
 */

export type FieldErrors = Record<string, string[] | string | undefined>;

/** Stable error element id for a field — `<fieldId>-error`. */
export function errorIdFor(fieldId: string): string {
  return `${fieldId}-error`;
}

/**
 * ARIA props for an input with a possible error. Spread onto the field:
 *   <input id="email" {...fieldAriaProps("email", errors.email)} />
 * When there is no error, no describedby is emitted (clean accessibility
 * tree; NVDA/JAWS announce only what exists).
 */
export function fieldAriaProps(
  fieldId: string,
  error?: string[] | string,
): { "aria-invalid"?: boolean; "aria-describedby"?: string } {
  const message = firstError(error);
  if (!message) return {};
  return { "aria-invalid": true, "aria-describedby": errorIdFor(fieldId) };
}

/** First human message for a field (arrays come from Zod/server maps). */
export function firstError(error?: string[] | string): string | undefined {
  if (typeof error === "string") return error || undefined;
  if (Array.isArray(error)) return error.find((entry) => entry.trim() !== "");
  return undefined;
}

/** Flattened [fieldId, message] pairs for the ErrorSummary, in order. */
export function errorSummaryEntries(
  errors: FieldErrors,
): Array<{ fieldId: string; message: string }> {
  return Object.entries(errors)
    .map(([fieldId, error]) => {
      const message = firstError(error);
      return message ? { fieldId, message } : null;
    })
    .filter(
      (entry): entry is { fieldId: string; message: string } => entry !== null,
    );
}

/** True when the error map contains at least one renderable message. */
export function hasErrors(errors: FieldErrors): boolean {
  return errorSummaryEntries(errors).length > 0;
}
