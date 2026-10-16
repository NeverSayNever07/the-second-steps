export type BranchOption = { id: string; name: string };

// A branch picker needs only these two fields. Branch records also carry
// contact details and staff, which must not be sent to the browser for a
// dropdown.
export function toActiveBranchOptions(
  branches: readonly { id: string; name: string; status: string }[],
): BranchOption[] {
  return branches
    .filter(({ status }) => status === "ACTIVE")
    .map(({ id, name }) => ({ id, name }));
}
