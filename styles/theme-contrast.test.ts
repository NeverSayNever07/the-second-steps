import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(path.join(import.meta.dirname, "globals.css"), "utf8");

function declarations(selector: ":root" | ".dark") {
  const vars = new Map<string, string>();
  const blockPattern = new RegExp(
    `(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`,
    "g",
  );
  for (const block of css.matchAll(blockPattern)) {
    for (const [, name, value] of block[1].matchAll(
      /--([\w-]+)\s*:\s*([^;]+);/g,
    )) {
      vars.set(name, value.trim());
    }
  }
  return vars;
}

const light = declarations(":root");
const dark = new Map([...light, ...declarations(".dark")]);

function resolve(vars: Map<string, string>, name: string): string {
  const value = vars.get(name);
  if (!value) throw new Error(`Token --${name} is not defined`);
  const reference = value.match(/^var\(--([\w-]+)\)$/);
  return reference ? resolve(vars, reference[1]) : value;
}

function luminance(hex: string) {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Expected a 6-digit hex colour, got ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const TEXT = 4.5;
const CONTROL = 3;

const pairs: [foreground: string, background: string, minimum: number][] = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["primary", "card", TEXT],
  ["primary", "background", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["highlight-foreground", "highlight", TEXT],
  ["record-foreground", "record", TEXT],
  ["record-muted-foreground", "record", TEXT],
  ["success-foreground", "success", TEXT],
  ["success", "success-soft", TEXT],
  ["success", "card", TEXT],
  ["warning-foreground", "warning", TEXT],
  ["warning", "warning-soft", TEXT],
  ["warning", "card", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["destructive", "destructive-soft", TEXT],
  ["destructive", "card", TEXT],
  ["info-foreground", "info", TEXT],
  ["info", "info-soft", TEXT],
  ["info", "card", TEXT],
  ["input", "card", CONTROL],
  ["input", "background", CONTROL],
  ["ring", "card", CONTROL],
  ["ring", "background", CONTROL],
  ["sidebar-foreground", "sidebar", TEXT],
  ["sidebar-muted-foreground", "sidebar", TEXT],
  ["sidebar-primary-foreground", "sidebar-primary", TEXT],
  ["sidebar-accent-foreground", "sidebar-accent", TEXT],
  ["sidebar-ring", "sidebar", CONTROL],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast (WCAG 2.2 AA)", (_theme, vars) => {
  test.each(pairs)("%s on %s", (foreground, background, minimum) => {
    const ratio = contrast(
      resolve(vars, foreground),
      resolve(vars, background),
    );
    expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(
      minimum,
    );
  });
});
