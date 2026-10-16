# ADR-017: Brand colours and typography as design tokens

- **Status:** Accepted (owner decision, 2026-10-11); visual direction revised by owner on 2026-10-15
- **Decision:** All brand colours live once in `styles/globals.css` as `--brand-*` variables, mapped to shadcn's semantic tokens (`primary`, `background`, `sidebar`, `highlight`, and so on). Components use only the semantic Tailwind classes (`bg-primary`, `bg-sidebar`), never hex values, so a rebrand is a change to one file. Typeface is Inter via `next/font`. Light and dark values for every token are in ADR-018.
- **Visual direction revised by owner (2026-10-15):** use the **Deep Navy** Design Lab palette, the rounded and softly elevated component treatment from the Aubergine direction, and the clean conventional table treatment from Cobalt. Light mode uses an off-white canvas, white floating surfaces and blue-grey fills; dark mode uses layered deep-navy surfaces. This supersedes the earlier cobalt-only, black/charcoal direction. Status colours remain functional rather than decorative.
- **Accessibility:** dark mode uses a lighter navy-blue accent where needed against deep surfaces. Input borders, text, focus rings and semantic status pairs continue to be enforced by `styles/theme-contrast.test.ts` against WCAG 2.2 AA.
- **Date:** 2026-10-11
