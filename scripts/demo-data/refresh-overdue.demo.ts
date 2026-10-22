import { it } from "vitest";
import {
  cancelWorkItem,
  listWorkItems,
  snoozeWorkItem,
} from "@/core/actions/application/work-items";
import { ukToday } from "@/core/enquiries/domain/enquiry";

// Keeps the fictional demo workspace looking current: anything overdue is
// moved to a spread of upcoming days (a few due today), keeping whoever it is
// assigned to, and leftover test actions are cancelled. It goes through the
// app's own services as the fictional Account Owner, so every rule applies.
//
//   npx vitest run --config scripts/demo-data/vitest.config.mts
//
// It writes to whichever database DATABASE_URL names (the shared fictional
// development database), so run it deliberately.
const actor = {
  // The fictional Account Owner (Olivia Hart) in the shared development
  // project. A user id, not a secret.
  authSubject: "0055c81d-37e2-4601-822d-c404cce25dd5",
  workspaceSlug: "oakfield-lettings-demo",
};

function addDays(day: string, days: number) {
  const moved = new Date(`${day}T12:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

it("clears overdue work", async () => {
  const today = ukToday();
  const items = await listWorkItems({ ...actor, scope: "visible", take: 200 });
  const overdue = items.filter((item) => item.overdue);
  let n = 0;
  for (const item of overdue) {
    const ref = { source: item.source, id: item.id };
    if (/^E2E check \d+$/.test(item.title)) {
      await cancelWorkItem({ ...actor, item: ref });
      console.log("cancelled", item.title);
      continue;
    }
    const dueOn = addDays(today, [0, 0, 1, 1, 2, 3, 4, 5, 6, 7][n % 10]);
    n += 1;
    const result = await snoozeWorkItem({ ...actor, item: ref, dueOn });
    console.log("moved to", dueOn, item.title, result.ok ? "ok" : result.error);
  }
  console.log(`${overdue.length} overdue item(s) handled`);
});
