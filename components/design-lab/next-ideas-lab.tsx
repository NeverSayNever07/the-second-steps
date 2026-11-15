import { Bell, User } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { DIRECTIONS, Navigation } from "./look-and-feel-lab";
import styles from "./look-and-feel-lab.module.css";
import { DayView, JourneyView, ListsView } from "./next-ideas-views";

// Three ideas from the November 2026 design review, each on its own page so
// they can be compared (proposals, not the product). Fictional data only.

export type IdeaId = "journey" | "lists" | "day";

export const IDEAS: {
  id: IdeaId;
  label: string;
  nav: string;
  summary: string;
  points: string[];
}[] = [
  {
    id: "journey",
    label: "1. Journey bar",
    nav: "properties",
    summary:
      "A property record that shows where the home is in its journey and the one next step, instead of leading with static facts.",
    points: [
      "Click any stage to see what it holds.",
      "One Next step panel, with anything in its way beside it.",
      "One timeline replaces the separate history tabs.",
      "Empty details collapse into one link. Try both header styles.",
    ],
  },
  {
    id: "lists",
    label: "2. Working lists",
    nav: "leads",
    summary:
      "A list you work from: views with live counts, filtering as you type, and a preview beside the list.",
    points: [
      "The view tabs replace the dropdowns and the Apply button.",
      "Click a row to preview it; click again to close.",
      "Press Done in the preview: it asks what happens next straight away.",
    ],
  },
  {
    id: "day",
    label: "3. Your day",
    nav: "dashboard",
    summary:
      "Home as one ordered list of what needs you today, each with a single action. The figures shrink to one strip.",
    points: [
      "Now, Today and This week, most urgent first.",
      "Press a button and the job leaves the list; the progress bar fills.",
      "The diary sits beside the list.",
    ],
  },
];

export function NextIdeasLab({ idea }: { idea: IdeaId }) {
  const current = IDEAS.find(({ id }) => id === idea) ?? IDEAS[0];
  const pill = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`;

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto grid max-w-[96rem] gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/design-lab"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Design lab
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Design ideas, November 2026
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Three ideas for making Zayto feel built around the letting
              agent&apos;s job. They use the current colours and components.
              Names and figures are made up, and nothing is saved.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Ideas">
          {IDEAS.map(({ id, label }) => (
            <Link
              key={id}
              href={`/design-lab/next-ideas?v=${id}`}
              className={pill(id === idea)}
              aria-current={id === idea ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="grid gap-2">
          <p className="max-w-3xl text-sm">{current.summary}</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {current.points.map((point) => (
              <li key={point} className="list-inside list-disc">
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.frame}>
          <Navigation
            direction={DIRECTIONS[0]}
            screen="list"
            active={current.nav}
          />
          <div className="min-w-0 bg-background">
            <div className="flex items-center justify-end gap-3 border-b bg-card px-5 py-2 text-muted-foreground">
              <Bell aria-hidden="true" className="size-4" />
              <User aria-hidden="true" className="size-4" />
            </div>
            {idea === "journey" && <JourneyView />}
            {idea === "lists" && <ListsView />}
            {idea === "day" && <DayView />}
          </div>
        </div>
      </div>
    </main>
  );
}
