const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a well-formed UUID string; used on every id from the browser. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Longest search text accepted, so a search cannot become an expensive scan. */
export const SEARCH_TEXT_MAX = 100;

/**
 * Worklists stop at this page, so a crafted page number cannot ask the
 * database to skip an unbounded number of rows (10,000 records at 25 a page).
 */
export const MAX_LIST_PAGE = 400;

/** A whole page number between 1 and MAX_LIST_PAGE. */
export function listPage(page: number | undefined): number {
  return Math.min(Math.max(Math.trunc(page ?? 1), 1), MAX_LIST_PAGE);
}
