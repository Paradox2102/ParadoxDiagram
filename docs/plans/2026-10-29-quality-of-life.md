# Quality-of-life features: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** the five features of the spec: problem list, copy and paste, CSV table, example robot, title block.

**Architecture:** pure functions in `src/model` and `src/export` with unit tests; the UI (Header, Inspector, App,
useKeys) calls them and gets testing-library tests. The MCP server reuses the moved problems module.

**Tech Stack:** React 19, TypeScript 7, Vitest 5, testing-library; MCP workspace in `mcp/` (zod).

**Spec:** `docs/specs/2026-10-29-quality-of-life-design.md`

## Global Constraints

- No new dependency. No change to Caddy or the server.
- Text in the UI is plain English, short, like the current labels.
- Every edit goes through `apply()` as one action, so one undo step undoes it.
- `npm run check` and `npm run build` pass after each task; the build rewrites `public/api/tools.json`.
- Commits have no Claude attribution lines (user's rule).

## Review Focus

- Paste of a selection that holds a wire to a device outside the selection: that wire is not copied.
- Paste after the copied devices were deleted: the clipboard still pastes (it holds copies, not ids).
- CAN ID 62 copied: no free ID above it, so the copy has no CAN ID.
- A diagram with no devices: the export with a title block is 160 mm wide and has no NaN in the SVG.
- `team` or `revision` set to an empty string: absent in the file, not `""`.

---

### Task 1: `team` and `revision` on the document

**Files:** `src/model/types.ts`, `src/model/validate.ts`, `src/model/patch.ts`, `src/model/actions.ts`,
`public/api/schema.json`, `mcp/src/ops.ts`; tests in the matching `*.test.ts` and `src/export/schema.test.ts`.

**Produces:** `Doc.team?: string`, `Doc.revision?: string`; `Action { type: 'setDetails'; team?: string; revision?: string }`
(an empty string removes the field); `MAX_TEAM = 40`, `MAX_REVISION = 20` in `validate.ts`; `DocPatch.team?: string | null`,
`DocPatch.revision?: string | null` (null removes); `set_title` op accepts optional `team`, `revision`.

- [ ] Tests first: validate keeps trimmed values within the limits and drops empty or too long ones; `setDetails` sets
  and removes; `diffDocs`/`applyPatch` carry both fields both ways; schema accepts both and rejects 41 characters;
  `set_title` with team and revision sets them.
- [ ] Implement; run `npm run check`; commit `feat: team and revision on the diagram`.

### Task 2: Problem list

**Files:** move `mcp/src/problems.ts` → `src/model/problems.ts` (and its test → `src/model/problems.test.ts`, which
stays in the mcp project if it reads mcp files); update mcp imports; `src/ui/Header.tsx`, `src/ui/App.tsx`.

**Produces:** `findProblems(doc, catalog, nameOf = (id) => id): Problem[]`; Header props `problems: Problem[]`,
`onPick: (ids: string[]) => void`.

- [ ] Tests first: a message uses `nameOf` ("CAN ID 3 is used twice on bus S1: Front left, Front right"); the MCP
  messages stay the same (existing mcp tests); Header shows `Check (2)`, the list items, a click calls `onPick` with
  the ids and closes the list; no problems shows "No problems found."
- [ ] Implement; App passes `nameOf = (id) => deviceTag(doc, id, catalog).name` and `onPick = setSelection`.
- [ ] `npm run check`; commit `feat: problem list in the browser`.

### Task 3: Copy, paste and duplicate

**Files:** `src/model/paste.ts` (new), `src/model/actions.ts`, `src/ui/useKeys.ts`, `src/ui/App.tsx`, `src/ui/Inspector.tsx`
(help text), tests.

**Produces:** `interface Clip { devices: Device[]; wires: Wire[] }`; `copyItems(doc: Doc, ids: string[]): Clip | null`
(null when no device is selected); `pasteItems(doc: Doc, clip: Clip, offset: number): Clip` (new ids, CAN IDs,
offset applied); `Action { type: 'paste'; devices: Device[]; wires: Wire[] }`; `useKeys` gets `copy`, `paste`,
`duplicate` callbacks.

- [ ] Tests first: new ids not used in the doc; name and fields kept; CAN ID 3 with 4 used → 5; CAN ID 62 → null;
  wire with one end outside not copied; wire bends moved by the offset; `paste` action adds them in one step; keys:
  Cmd/Ctrl+C/V/D call the callbacks and prevent default, nothing in a text box, Cmd+C with no device selected is not
  prevented.
- [ ] Implement; App keeps `clip` and a paste count in refs; the offset is `10 * count` mm; selection becomes the
  pasted ids. Help text gains `⌘C ⌘V copy, paste · ⌘D duplicate`.
- [ ] `npm run check`; commit `feat: copy, paste and duplicate devices`.

### Task 4: CAN ID and power table

**Files:** `src/model/tags.ts` (export `powerFeeds`), `src/export/table.ts` (new), `src/ui/Header.tsx`, `src/ui/App.tsx`, tests.

**Produces:** `powerFeeds(doc, catalog, id): { feeder: string; channels: string[]; fuseA?: number; awg?: number }[]`
(used by `deviceTag` too); `deviceTableCsv(doc: Doc, catalog: Catalog | null): string`; `ExportKind` gains `'csv'`.

- [ ] Tests first: header row and BOM; a row's Power from `PDH 4/5`, fuse and AWG; sort order; quoting of a comma, a
  quote and a line break; custom field columns; deviceTag text unchanged (existing tests).
- [ ] Implement; Export menu item "Table (CSV)"; file `<base>-devices.csv`, type `text/csv`.
- [ ] `npm run check`; commit `feat: CAN ID and power table export (CSV)`.

### Task 5: Start from the example robot

**Files:** `src/ui/Header.tsx`, `src/ui/Inspector.tsx`, `src/ui/App.tsx`, `src/model/example.ts` (new: imports the JSON).

**Produces:** Header `onNew: (kind: 'empty' | 'example') => void`; Inspector prop `onExample: () => void`.

- [ ] Tests first: New opens a menu with Empty diagram and Example robot, each calls `onNew` with its kind; the help
  panel button calls `onExample`; the example JSON validates with no dropped wires.
- [ ] Implement; App loads the example through `validateDoc(example, catalog)`, asks as New does, then fits the view.
- [ ] `npm run check`; commit `feat: start from the example robot`.

### Task 6: Title block

**Files:** `src/export/svg.ts`, `src/ui/Header.tsx`, `src/ui/Inspector.tsx`, `src/ui/App.tsx`, tests.

**Produces:** `exportSvg(doc, catalog, layer, iconText, opts?: { titleBlock?: { date: string } })`;
`exportPage(doc, catalog, titleBlock: boolean): { x: number; y: number; w: number; h: number }` (the PNG size uses it);
`TITLE_BLOCK_MM = 14`, `MIN_PAGE_MM = 160`; Header props `titleBlock: boolean`, `onTitleBlock: (on: boolean) => void`;
Inspector Help gets a Diagram section (Team, Revision) that dispatches `setDetails`.

- [ ] Tests first: with the option, the SVG has the title, team, `Rev B`, the date, `Power layer` when a layer is
  given, and `diagram.team2102.org`; the page grows by 14 mm and is at least 160 mm wide; without it, the SVG is the
  same as before; an empty doc gives no NaN; Header shows a checked "Title block" item and calls `onTitleBlock`; the
  Diagram fields dispatch `setDetails`.
- [ ] Implement; App keeps the choice in `localStorage` key `paradox-diagram.titleBlock` (try/catch) and passes
  today's local date; MCP `render` passes no option.
- [ ] `npm run check`; commit `feat: title block on SVG and PNG exports`.

### Task 7: Docs

- [ ] README Features: the five features; Build a diagram: the keys. `npm run build` to rebuild `tools.json`.
- [ ] `npm run check`; commit `docs: quality-of-life features in the README`.
