---
name: whoosh-design-review
description: Unified UI/UX workflow for the existing WHOOSH STAY app. Use for any change, review or audit of interface work (pages, components, sidebar/navigation, forms, tables, responsive behaviour, accessibility, visual polish) in this repository, or when the user asks for Hallmark / ui-ux-pro-max / "review tampilan" / "perbaiki UI" / "desain halaman". Combines ui-ux-pro-max design direction with a Hallmark QC pass (report-only) and fixes inside the project's own design system.
argument-hint: "<target page/component or 'audit'>"
---

# WHOOSH STAY design review (Pro Max direction + Hallmark QC)

One workflow, two roles. **ui-ux-pro-max** supplies direction, patterns and
accessibility rules. **Hallmark** audits the result and reports gaps. Neither
one replaces the project's design system: WHOOSH STAY is an existing branded
product, so Hallmark runs **audit only** — never `redesign`, never theme
dealing, never a rebuilt shell.

## 1. Pre-flight (always)

1. Read `docs/DECISIONS.md` D-046 (skill split, waivers) and the newest decision
   that touches UI.
2. Read `apps/web/src/styles.css` for tokens (`brand-*`, `sand-*`, `ink-*`,
   `gold-*`, `chart-*`, `sidebar`). Sidebar background is exactly `#8B1A1A`.
3. Read the target component/page and the shared pieces it uses
   (`apps/web/src/components/ui.tsx`, `Sidebar.tsx`, layouts).
4. Never add a route, API call, DB column, RBAC grant or business rule for a
   visual change.

## 2. Direction (ui-ux-pro-max)

Skill files: `C:\Users\muhammad.farandi\.qoder\skills\ui-ux-pro-max\`.
- Read `SKILL.md` (priority table) and load only what the task needs from
  `references/quick-reference.md` and `references/pro-rules.md`.
- The bundled search CLI needs Python; this machine has no Python. Do not fake
  a search result. Read the reference files directly and say the CLI was not
  used.
- Enterprise app scope: density over marketing patterns. No hero/eyebrow
  inventions, no new palette, no new font. Plus Jakarta Sans and the existing
  tokens stay.
- Every interactive element: visible label, 44px hit target, focus-visible,
  disabled/loading states. Data screens: loading, empty, error, full.

## 3. Implement

- Reuse `components/ui.tsx` primitives and Tailwind token utilities. No literal
  hex colours in class names when a token exists.
- Animations: `transform`/`opacity` only, 150–260 ms, `motion-reduce` fallback.
- Keep existing test-visible text, `aria-label`s and `aria-current` contracts
  unless the task explicitly changes them.

## 4. QC (Hallmark, report-only)

Run the bundled harness from the repo root:

```bash
node .qoder/skills/whoosh-design-review/scripts/audit.mjs apps/web/src
```

It wraps `C:\Users\muhammad.farandi\.qoder\skills\hallmark\scripts\sloplint.mjs`
with `--scope app --genre modern-minimal --json` and prints findings grouped by
gate. `--render` is unavailable (puppeteer-core not installed); never claim it.

### Fix on sight (safe in this project)

| Gate | Issue | Action |
|---|---|---|
| 48 | colour/font literal in classes | use the token utility |
| 10a | `transition-[width]` / `transition-[height]` on decorative bars | switch to `transform`/`opacity` when layout does not depend on it |
| 26b | interactive surface with no `:active` state | add one `active:` signal |
| 28a | above-the-fold hero image lazily loaded | `fetchpriority="high"` (keep width/height); below-fold lazies are waived |
| F24 | hairline border plus `shadow-xl/2xl` | commit to one elevation |
| 11 | repeated hover-scale on sibling cards | keep one hover signal per element |

After fixes rerun the audit. Fixing a finding must not break existing E2E
selectors, accessibility or the brand.

### Waived on record (D-046 + user brief) — report, do not "fix"

- **54 / 67** uppercase tracked labels and eyebrows: the established WHOOSH STAY
  page-header and sidebar-group pattern (bold uppercase + letter-spacing over a
  maroon surface). Removing it is a redesign the brief forbids.
- **19** em dash in Indonesian copy: several labels are asserted by E2E
  (`HALIM — Halim`). Copy changes need a dedicated copy pass, not a QC sweep.
- **63** middle-dot separators in metadata copy: brand copy pattern, kept.
- **74** semantic status palette (`red`/`amber`/`emerald` status text): status
  semantics are deliberate and axe-checked; brand tokens would erase the
  success/warning/danger signal.
- **49** dense calendar month-grid labels: `nowrap` breaks the day cells;
  labels truncate inside the grid instead.
- **28a** below-the-fold images flagged as likely LCP: thumbnails and gallery
  images correctly lazy-load; only true hero images get `fetchpriority`.
- **10a** sidebar `transition-[width]` and the `lg:pl-[var(--sidebar-w)]`
  shell: the requested collapse/expand animation; replacing it changes layout
  behaviour, out of scope for polish.
- **29** `backdrop-blur` glass surfaces (gallery/lightbox): intentional brand
  treatment, contrast verified by axe.
- **20** stamp is not waived: `apps/web/src/styles.css` starts with the
  `/* Hallmark · audit-only pass · … */` line, which satisfies gate 20. Keep it
  as the first line; do not reorder the file.

Never waive a genuine accessibility failure, invented metric, or a broken
state to make the audit green.

## 5. Verify

1. `npm run typecheck`, `npm run lint` at the repo root.
2. Targeted Playwright for the touched area, e.g.
   `npx playwright test tests/e2e/sidebar-navigation.spec.ts tests/e2e/sidebar.spec.ts`.
3. `tests/e2e/a11y.spec.ts` for axe; `tests/e2e/responsive.spec.ts` when layout
   changed.
4. Do not edit `apps/web/src` while Playwright is running; E2E uses ports
   4001/5175 and the dev DB is separate.
5. Report actual numbers. If a check was not run, say so.

## 6. Output

Reply with: target, what Pro Max guidance was applied (or that its CLI was
unavailable), audit result before/after (counts per tier), fixes shipped,
findings waived with the reason, and verification commands with real results.
Keep findings inside the project system: no new tokens, fonts or routes.
