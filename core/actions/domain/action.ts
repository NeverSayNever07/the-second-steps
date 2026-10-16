import {
  parseDateOnly,
  validateTaskTitle,
} from "@/core/enquiries/domain/enquiry";

export const ACTION_KINDS = [
  "call",
  "email",
  "send",
  "chase",
  "other",
] as const;
export type ActionKindCode = (typeof ACTION_KINDS)[number];

export function isActionKind(value: unknown): value is ActionKindCode {
  return ACTION_KINDS.includes(value as ActionKindCode);
}

export const validateActionTitle = validateTaskTitle;

/** A day in "YYYY-MM-DD" form, or null when it is not a real date. */
export const parseActionDueOn = parseDateOnly;

/**
 * The moment an action is planned for: a real ISO timestamp with a time zone,
 * within the years the app accepts. Returns null when it is not valid.
 */
export function parsePlannedFor(value: string | null | undefined) {
  const text = value?.trim();
  if (
    !text ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      text,
    )
  ) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? date : null;
}
