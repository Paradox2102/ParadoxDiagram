# Paradox Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app that lays out FRC wiring diagrams from the icon collection, with four wire layers, autosave and SVG/PNG/JSON export.

**Architecture:** Pure TypeScript modules (catalog, model reducer, geometry, tags, storage, export) under Vitest, and a React UI that renders one `<svg>` document in millimetres. All edits go through one reducer; history is a list of immutable documents.

**Tech Stack:** Vite 8.3.4, React 19.3.0, TypeScript 7.0.2, Vitest 5.0.3, jsdom 30.1.2, @testing-library/react 16.3.3, @testing-library/user-event 14.6.7, @testing-library/jest-dom 7.0.1.

**Spec:** `docs/specs/2026-10-27-paradox-diagram-design.md`

## Global Constraints

- Units are mm. Grid 5 mm. Zoom 0.2x to 8x of 3 px per mm.
- Layers: power (power), can (can), network (ethernet, usb, signal), air (air).
- Colors: + `#cf222e`, − `#0d1117`, CAN H `#e3b341`, CAN L `#2da44e`, ethernet `#0969da`, usb `#8250df`, signal `#57606a`, air `#1b7c83` dashed `3 1.5`.
- Pair offset ±0.7 mm; port stub 6 mm; off-layer device opacity 0.15.
- Storage keys `paradox-diagram:doc` and `paradox-diagram:doc:broken`; autosave debounce 400 ms; history 100.
- JSON `format: "paradox-diagram"`, `version: 1`.
- No Claude attribution lines in commits (user rule). Author is the repo-local personal noreply address.
- No remote, no push.

## Review Focus

1. A saved document whose icon slug is not in the catalog: it must still open and draw a gray box (Task 2 validate test, Task 7 render).
2. localStorage that throws (private window): the app must still edit and show "Not saved in this browser" (Task 5 test).
3. A device moved or rotated after its wire got manual bends: the route must stay orthogonal and still reach both ports (Task 3 test).
4. Deleting a device must delete its wires, and undo must bring both back (Task 2 test).
5. Two Power wires from PDH channels to one device: the tag reads `PDH 4/5` in channel order (Task 4 test).

---

### Task 1: Scaffold, icon sync and catalog

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/test/setup.ts`, `.gitignore`, `scripts/sync-icons.mjs`, `public/icons/**`, `src/catalog/catalog.ts`, `src/catalog/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Layer = 'power' | 'can' | 'network' | 'air'`; `type AnchorKind = 'power'|'can'|'ethernet'|'usb'|'signal'|'air'`
  - `interface Anchor { port: string; x: number; y: number; kind: AnchorKind; label: string }`
  - `interface Icon { slug; name; type; vendor; vendor_name; part_number: string|null; status: 'current'|'legacy'; path; size_mm: [number,number]; view_box: [number,number,number,number]; anchors: Anchor[] }`
  - `interface Catalog { types: {id,name,count}[]; icons: Icon[]; bySlug: Map<string, Icon> }`
  - `parseCatalog(json: unknown): Catalog`, `loadCatalog(fetchFn = fetch): Promise<Catalog>` (GET `icons/index.json`)
  - `layerOfKind(kind: AnchorKind): Layer`, `iconLayers(icon: Icon): Set<Layer>`
  - `searchIcons(icons: Icon[], query: string, showLegacy: boolean): Icon[]`
  - `findAnchor(icon: Icon, port: string): Anchor | undefined`

- [ ] **Step 1:** Write `package.json` (scripts `dev`, `build`, `preview`, `typecheck`, `test`, `check`, `sync-icons`; engines node >=24), tsconfig and vite config copied in shape from PrettyDocs (`test.environment: 'jsdom'`, `globals`, setup file importing `@testing-library/jest-dom/vitest`). `npm install`.
- [ ] **Step 2:** Write `scripts/sync-icons.mjs`: source `process.env.ICONS_SRC ?? ~/PrettyDocs/public/icons`, copy every `.svg`, `index.json`, `LICENSE.md` (skip the zip and README) to `public/icons/`, clear the target first, print the count. Run it. Expected: `92 icons`.
- [ ] **Step 3:** Write failing tests in `catalog.test.ts`: `parseCatalog` of the real `public/icons/index.json` gives 92 icons and `bySlug.get('rev-pdh')` has port `ch4`; `layerOfKind('usb') === 'network'`, `layerOfKind('air') === 'air'`; `searchIcons(icons,'kraken x60',false)` contains `kraken-x60-powerpole` and every result matches both words; `searchIcons(icons,'',false)` has no legacy icon and `searchIcons(icons,'',true).length === 92`; `parseCatalog({})` throws `Error('icons/index.json: no icons list')`.
- [ ] **Step 4:** Implement `catalog.ts`. Search haystack: `name vendor_name part_number slug`, lower case; every whitespace word must be a substring.
- [ ] **Step 5:** `npm run check`. Expected: typecheck clean, catalog tests pass.
- [ ] **Step 6:** Commit `chore: scaffold, icon sync (92 icons), catalog`.

### Task 2: Document model, reducer, history, validation

**Files:**
- Create: `src/model/types.ts`, `src/model/ids.ts`, `src/model/actions.ts`, `src/model/history.ts`, `src/model/validate.ts`, tests `src/model/*.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `findAnchor`, `layerOfKind`, `Layer` (Task 1).
- Produces:
  - `type Rot = 0|90|180|270`; `interface Point {x:number;y:number}`
  - `interface Device { id; slug; x; y; rot: Rot; name; canId: number|null; notes }`
  - `interface PortRef { device: string; port: string }`
  - `interface Wire { id; layer: Layer; from: PortRef; to: PortRef; bends: Point[]; note }`
  - `interface Doc { format: 'paradox-diagram'; version: 1; title; devices: Device[]; wires: Wire[] }`
  - `emptyDoc(): Doc`; `nextId(prefix: 'd'|'w', used: {id:string}[]): string`
  - `type Action = {type:'addDevice', slug, name, x, y} | {type:'moveDevices', ids, dx, dy} | {type:'rotateDevices', ids} | {type:'updateDevice', id, patch: Partial<Pick<Device,'name'|'canId'|'notes'>>} | {type:'addWire', layer, from, to} | {type:'setBends', id, bends} | {type:'updateWire', id, patch:{note}} | {type:'delete', ids} | {type:'setTitle', title}`
  - `apply(doc: Doc, action: Action): Doc` (moves snap the result to the 5 mm grid; `addWire` refuses a wire whose two ends are the same port or that duplicates an existing wire, returning `doc` unchanged)
  - `interface History { past: Doc[]; present: Doc; future: Doc[] }`; `initHistory(doc)`, `commit(h, doc)` (no-op if `doc === h.present`, caps past at 100), `undo(h)`, `redo(h)`
  - `validateDoc(raw: unknown, catalog: Catalog | null): { doc: Doc; droppedWires: number }` throws `Error(<first failed check>)` for wrong format/version or non-array lists

- [ ] **Step 1:** Write failing tests: `addDevice` gives id `d1` then `d2`; `moveDevices` by (3, 7) from (0,0) lands on (5, 5); `rotateDevices` cycles 0→90→180→270→0; `delete` of a device removes its wires and `undo` after `commit` restores both; `addWire` with identical ends returns the same object; `commit` keeps at most 100 past entries; `validateDoc` keeps a device with unknown slug `future-thing`, drops a wire to a missing port and reports `droppedWires: 1`; `validateDoc({format:'x'})` throws `format is not paradox-diagram`.
- [ ] **Step 2:** Run `npx vitest run src/model`. Expected: fail (modules missing).
- [ ] **Step 3:** Implement the five files. `validateDoc` with `catalog === null` skips slug and port checks.
- [ ] **Step 4:** Run again. Expected: pass.
- [ ] **Step 5:** Commit `feat: document model, reducer, history, validation`.

### Task 3: Geometry: placement, routing, pair offset

**Files:**
- Create: `src/geometry/transform.ts`, `src/geometry/route.ts`, `src/geometry/offset.ts`, tests beside them

**Interfaces:**
- Consumes: `Icon`, `Anchor`, `Device`, `Point`, `Rot`.
- Produces:
  - `type Dir = 'up'|'down'|'left'|'right'`
  - `deviceTransform(d: Device, icon: Icon): string` (SVG transform: translate to x,y then rotate about view box centre)
  - `portWorld(d: Device, icon: Icon, a: Anchor): { p: Point; dir: Dir }` (dir = nearest view box side to the anchor, rotated)
  - `deviceBounds(d: Device, icon: Icon): { x; y; w; h }` (world box after rotation)
  - `routeWire(start: Point, sDir: Dir, end: Point, eDir: Dir, bends: Point[]): Point[]` (orthogonal, collinear points removed, first = start, last = end)
  - `dragSegment(path: Point[], index: number, delta: number): Point[]` returns new bends (path corners without start, start stub, end stub, end)
  - `insertBend(path: Point[], segIndex: number, at: Point): Point[]` returns bends
  - `offsetPolyline(path: Point[], d: number): Point[]` (left of travel for d > 0)

- [ ] **Step 1:** Write failing tests: `portWorld` for rot 0 of rev-pdh `ch9` (x 113 on a view box right side) gives dir `right`; same anchor at rot 90 gives dir `down` and the point rotated about the centre; `routeWire({0,0},'right',{100,50},'left',[])` is orthogonal (every segment has dx==0 or dy==0), starts at (0,0), ends at (100,50), passes (6,0) and (94,50); a route with one bend (50,80) visits (50,80); after moving end to (130,20) with the same bend it is still orthogonal and ends at (130,20) (Review Focus 3); `routeWire` facing ports that point away from each other (`'left'` at start, target to the right) still ends at the target with no zero-length segment; `offsetPolyline([{0,0},{10,0},{10,10}], 0.7)` gives `[{0,-0.7},{10.7,-0.7},{10.7,10}]` (y-down SVG: left of travel +x is −y).
- [ ] **Step 2:** Run; expect fail.
- [ ] **Step 3:** Implement. Router algorithm:

```
pts = [start, stub(start,sDir), ...bends, stub(end,eDir), end]
out = [pts[0]]
for each next point q after p = last(out):
  if p.x == q.x or p.y == q.y: push q
  else elbow = horizontal-first (q.x, p.y); if the segment p→elbow reverses the previous segment's direction, use vertical-first (p.x, q.y); push elbow, q
if bends empty and the stubs face each other on one axis: use a Z through the midpoint of that axis instead of an L
remove zero-length and collinear points
```
- [ ] **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit `feat: placement, orthogonal router, pair offset`.

### Task 4: Tags

**Files:** Create `src/model/tags.ts`, `src/model/tags.test.ts`

**Interfaces:**
- Consumes: `Doc`, `Catalog`.
- Produces: `deviceTag(doc: Doc, deviceId: string, catalog: Catalog | null): { name: string; facts: string }` where name = device name or icon name, facts joins `CAN <id>` and `PDH <n>` with `  ·  `.

- [ ] **Step 1:** Failing tests: device with `canId 12` and no wires gives facts `CAN 12`; power wires `ch5→vbat_pos` and `ch4→vbat_neg` from a rev-pdh give `PDH 4/5` (Review Focus 5); a CAN wire to a `can_a` port adds nothing; a power wire between two motors adds nothing.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement (port name `/^ch(\d+)$/` on the other end). **Step 4:** Run, pass.
- [ ] **Step 5:** Commit `feat: device tags with CAN ID and PDH channel`.

### Task 5: Autosave, JSON file, download

**Files:** Create `src/storage/autosave.ts`, `src/export/json.ts`, `src/export/download.ts`, tests for the first two.

**Interfaces:**
- Produces:
  - `loadSaved(storage: Storage | null, catalog: Catalog | null): { doc: Doc | null; status: 'ok'|'empty'|'broken'|'unavailable' }` (broken: copies raw to `paradox-diagram:doc:broken`)
  - `saveDoc(storage: Storage | null, doc: Doc): boolean` (false on throw or null)
  - `safeStorage(): Storage | null` (returns null when `localStorage` access throws)
  - `docToJson(doc: Doc): string` (2-space), `fileBase(title: string): string`
  - `downloadBlob(blob: Blob, filename: string): void`

- [ ] **Step 1:** Failing tests: round trip `saveDoc` then `loadSaved` with an in-memory Storage; a storage whose `setItem` throws makes `saveDoc` return false (Review Focus 2); bad JSON gives `broken` and the broken key holds the raw text; `fileBase('My robot: v2!')` is `My robot- v2-`.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat: autosave and JSON file`.

### Task 6: SVG and PNG export

**Files:** Create `src/export/svg.ts`, `src/export/png.ts`, `src/export/svg.test.ts`

**Interfaces:**
- Consumes: `deviceTransform`, `deviceBounds`, `routeWire`, `offsetPolyline`, `deviceTag`, `iconLayers`.
- Produces:
  - `renderWirePaths(doc, catalog, wire): {d: string; stroke: string; dash?: string}[]` (shared with the canvas)
  - `exportSvg(doc: Doc, catalog: Catalog, layer: Layer | 'all', iconText: (path: string) => Promise<string | null>): Promise<string>`
  - `svgToPng(svg: string, widthMm: number, heightMm: number, scale: 2 | 4): Promise<Blob>`
  - `stripAnchors(svgText: string): string`

- [ ] **Step 1:** Failing tests: `stripAnchors` removes `<g id="anchors">…</g>` and no `id=` remains for the kraken-x60-powerpole file; `exportSvg` of a doc with one rev-pdh at (0,0) and a stub iconText returns text starting `<svg`, with `width="` ending `mm"`, a white `<rect`, one nested `<svg viewBox="-10 -6 131 248"`; with layer `can` a power wire is absent; an iconText returning null draws a gray box with the device name.
- [ ] **Step 2–4:** fail, implement (PNG: Image from a Blob URL, canvas `widthMm*3.78*scale`, white fill, `toBlob`), pass. PNG is checked in the browser in Task 9.
- [ ] **Step 5:** Commit `feat: SVG and PNG export`.

### Task 7: App shell: header, logo, palette, layer switch

**Files:** Create `src/ui/App.tsx`, `src/ui/Header.tsx`, `src/ui/Logo.tsx`, `src/ui/Palette.tsx`, `src/ui/useLayerHash.ts`, `src/ui/styles.css`, tests `src/ui/Palette.test.tsx`, `src/ui/Header.test.tsx`

**Interfaces:**
- Produces: `App` owns `history`, `catalog`, `layer`, `selection: string[]`; passes `dispatch(action: Action, opts?: {transient?: boolean})` down (transient = replace present without a history entry, used during drags; pointer up commits).
- `useLayerHash(): [Layer | 'all', (l) => void]` reads/writes `#layer=`.

- [ ] **Step 1:** Failing tests: Palette with a 3-icon catalog shows type headings, filters on `kraken`, hides a legacy icon until "Show legacy" is checked; clicking a row calls `onAdd(slug)`; Header layer buttons set `aria-pressed` on the active layer and call `onLayer('can')`.
- [ ] **Step 2–4:** fail, implement, pass. Logo: inline SVG Penrose triangle, three bars in `#cf222e`, `#0969da`, `#e3b341`. Layout: CSS grid header / palette | canvas | inspector. Typeface: system UI with Helvetica, like the icons; light theme only (the diagram is print-white).
- [ ] **Step 5:** Commit `feat: app shell, logo, palette, layer switch`.

### Task 8: Canvas, wires, inspector, keys

**Files:** Create `src/ui/Canvas.tsx`, `src/ui/DeviceView.tsx`, `src/ui/WireView.tsx`, `src/ui/Inspector.tsx`, `src/ui/useKeys.ts`, test `src/ui/Inspector.test.tsx`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1:** Failing test: Inspector for a selected device edits name and CAN ID (empty input = null) through `dispatch({type:'updateDevice'})`; for a wire, "Reset route" dispatches `setBends` with `[]`.
- [ ] **Step 2–4:** fail, implement, pass. Canvas behaviour per spec "Screen": viewBox state {x, y, scale}; device `<image href>` at its view box; ports as circles r 1.6 colored by kind, visible on hover/selection or while wiring; wire drag from port with a live dashed preview; segment drag and double-click bends; selection box; pan with space or middle button; wheel zoom about the pointer; drop from the palette (`dataTransfer` type `application/x-paradox-slug`). Unknown slug draws a gray box with the slug.
- [ ] **Step 5:** Wire autosave (400 ms) and the "Not saved in this browser" note, New (confirm), Open (file input → `validateDoc`, alert on error, note on dropped wires), Export menu.
- [ ] **Step 6:** `npm run check`. Commit `feat: canvas editing, wires, inspector, autosave`.

### Task 9: Run and check in the browser

- [ ] **Step 1:** Add `.claude/launch.json` entry `paradox-diagram` in `~/systemcore` (`npm --prefix /Users/nickfoote/ParadoxDiagram run dev -- --port 5180`).
- [ ] **Step 2:** In the preview: add rev-pdh, systemcore, a Vivid radio and two Kraken X60s; draw power, CAN and Ethernet wires; set a CAN ID; check the tags, each layer view, a segment drag, undo/redo, reload keeps the layout, export SVG/PNG/JSON, open the JSON. No console errors.
- [ ] **Step 3:** Screenshot for the user. Commit any fixes.
