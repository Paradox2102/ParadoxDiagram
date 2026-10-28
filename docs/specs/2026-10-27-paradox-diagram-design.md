# Paradox Diagram: design

Date: 2026-10-27. Status: approved in chat (approach 1, Air as a fourth layer).

## Purpose

A public web app where any FRC team lays out an electrical diagram that looks like the
Team 2102 wiring poster. The user places device icons from the FRC icon collection, draws
wires between the real ports of the icons on four layers (Power, CAN, Network, Air), and
exports the result as SVG, PNG or JSON. The browser keeps the last layout.

Success: a student can, in the browser and with no account, build a small robot diagram
(PDH, SystemCore, radio, two motors) with power, CAN and Ethernet wires, close the tab, open
it again with the layout intact, and export an SVG that looks like the poster style.

## Scope

In v1: catalog search, place / move / rotate / delete devices, orthogonal wires with
editable bends, device tags (name, CAN ID, automatic power channel), layer views, undo/redo,
autosave to localStorage, JSON open and export, SVG export, PNG export.

Out of v1: accounts, sharing or collaboration, CAN checks (duplicate ID, terminator),
auto-layout, import of `devices.json`, deploy (the app runs locally first; deploy is a later
decision of the user).

## Stack and repo

- Local repo `~/ParadoxDiagram`, branch `main`, no remote until the user asks.
- Vite 8 + React 19.3 + TypeScript 7 + Vitest 5 + jsdom, same versions and tsconfig rules
  as PrettyDocs. No diagram library; no state library.
- Icons: `npm run sync-icons` copies `~/PrettyDocs/public/icons/` (every `.svg`,
  `index.json`, `LICENSE.md`) to `public/icons/`. The copy is committed, so a clone builds
  alone. `index.json` gives per icon: slug, name, type, vendor, vendor_name, part_number,
  status (current | legacy), path, size_mm, view_box, anchors[] {port, x, y, kind, label}.
  The icons are CC0 1.0; the app shows the license note in its About box.

## Units and coordinates

The document uses millimetres, the same units as the icons. A device sits at (x, y) = the
position of its icon's view box origin, with rotation 0, 90, 180 or 270 degrees about the
icon's view box centre. A port's world position is the anchor (x, y) transformed by the
device placement. The grid is 5 mm; a device snaps its origin to the grid when dropped
or moved.

## Layers

| Layer   | Anchor kinds              | Wire drawing                                   |
|---------|---------------------------|------------------------------------------------|
| Power   | power                     | pair: red `#cf222e` (+) and black `#0d1117` (−) |
| CAN     | can                       | pair: yellow `#e3b341` (H) and green `#2da44e` (L) |
| Network | ethernet, usb, signal     | one line: ethernet blue `#0969da`, usb purple `#8250df`, signal gray `#57606a` |
| Air     | air                       | one line, cyan `#1b7c83`, dashed `3 1.5`       |

A wire may connect two ports of the same layer only. The Network line color comes from the
start port kind. The layer switch (All / Power / CAN / Network / Air) is kept in the URL hash
(`#layer=can`). In a single-layer view, wires of other layers are hidden, and a device with
no anchor of that layer draws at 15 % opacity.

## Document format (JSON, version 1)

```json
{
  "format": "paradox-diagram",
  "version": 1,
  "title": "Untitled diagram",
  "devices": [
    { "id": "d1", "slug": "rev-pdh", "x": 0, "y": 0, "rot": 0,
      "name": "PDH", "canId": null, "notes": "" }
  ],
  "wires": [
    { "id": "w1", "layer": "power",
      "from": { "device": "d1", "port": "ch4" },
      "to":   { "device": "d2", "port": "vbat_pos" },
      "bends": [ { "x": 120, "y": 40 } ],
      "note": "" }
  ]
}
```

Rules checked on open: `format` and `version` match; every slug is in the catalog (an
unknown slug is kept and drawn as a gray box with the slug, so a file from a newer icon set
still opens); every wire end names an existing device and a port of that device's icon;
wire layer matches both port kinds. A wire that fails is dropped and the user sees a count
of dropped wires. Ids are strings, unique per list; new ids are `d<n>` / `w<n>` above the
highest present.

## Wire routing

Pure module, no DOM. Input: start port point and exit direction, end port point and entry
direction, and the wire's `bends` list. Output: an orthogonal polyline.

- Exit direction of a port: the side of the icon `body` box (the icon's view box) nearest
  to the anchor, rotated with the device. Each end gets a 6 mm stub along its direction.
- With no bends: from stub to stub, an L when the stubs allow it, else a Z through the
  midpoint on the axis of the start direction.
- With bends: the path visits stub start, each bend in order, stub end. Between two points
  that are not aligned it adds one elbow (horizontal first, unless that doubles back on
  the previous segment).
- Collinear points are removed.
- Segment drag (UI): dragging an interior segment moves it along its normal; the new path
  corners (without the stub points) become the wire's `bends`. Double-click on a segment
  adds a bend at the click point; double-click on a bend handle removes it.

Pairs (Power, CAN) draw as two copies of the polyline offset ±0.7 mm along the normal of
each segment (at a 90 degree corner the offset point is corner + offset of both segments).
The + / H line is on the left of the direction of travel from the `from` end.

## Tags

Each device has a tag under its icon (rotation does not turn the tag): line 1 the name
(default: the icon name), line 2 the facts: `CAN <id>` when canId is set, and
`<feeder> <channel>` when a Power wire joins this device to a port named `ch<n>` (or a VRM
output) on another device. The feeder is that device's short name: PDH, PDP, PH (Thrifty
PowerHub), MPM or VRM; a VRM channel reads like `12V/2A`. Two such wires give `PDH 4/5`, the
form the poster uses. The tag does not store the channel; it is computed from the wires each
render.

## Screen

- Header: logo (Penrose triangle, three bars red `#cf222e`, blue `#0969da`, gold
  `#e3b341`), the name "Paradox Diagram", the editable title, the layer switch, Undo, Redo,
  New, Open, Export (SVG, PNG 2x, PNG 4x, JSON), About.
- Left panel: search box (every word must match name, vendor name, part number or slug,
  case-insensitive), icon list grouped by type in catalog type order, thumbnails, a
  "Show legacy" switch (off by default). Drag a row onto the canvas, or click it to add the
  device at the centre of the view.
- Canvas: one `<svg>`. Wheel zooms about the pointer (0.2x to 8x of 3 px per mm). Space +
  drag or middle-drag pans. Drag on empty space draws a selection box; shift adds to the
  selection. Drag a device moves the selection. Keys: Delete/Backspace removes the
  selection, R rotates the selection 90 degrees, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and
  Ctrl/Cmd+Y redo, Escape cancels a wire in progress. Ports of hovered or selected devices
  show as dots in their layer color, with the anchor label as a tooltip. Drag from a port to
  a port of the same layer makes a wire; while dragging, valid target ports grow. In a
  single-layer view only that layer's ports show.
- Right panel: the selected device (name, CAN ID, notes, rotate, delete, icon name and
  vendor) or the selected wire (layer, ends, note, "Reset route" which clears bends, delete).

## Undo, autosave, export

- The document is immutable. Every change goes through one `apply(doc, action)` reducer.
  History keeps up to 100 documents; a drag is one history entry (committed on pointer up).
- Autosave: 400 ms after the last change, `localStorage["paradox-diagram:doc"]` = the JSON
  document. On start, the app loads and checks it; if it fails the checks, the raw text is
  moved to `paradox-diagram:doc:broken` and the app starts empty. Every storage call is in
  try/catch; with no storage the app still works and shows "Not saved in this browser".
- New asks for confirmation when the document has devices.
- JSON export: the document, 2-space indent, file `<title>.paradox.json`.
- SVG export: a standalone SVG in mm (`width="<w>mm"`), white background, bounds = content
  box + 10 mm margin. Each icon is inlined as a nested `<svg>` with its own view box, with
  the `<g id="anchors">` group removed (the only ids in the icons). Wires and tags are the
  same elements as on screen, without port dots, handles and selection. The current layer
  view applies.
- PNG export: the SVG export drawn on a canvas at 2x or 4x of 96 dpi
  (1 mm = 3.78 px x scale), white background, saved as `<title>.png`.
- File names: title with characters outside `[A-Za-z0-9 _-]` replaced by `-`.

## Code layout

```
src/
  model/      types.ts, ids.ts, actions.ts (reducer), history.ts, validate.ts, tags.ts
  catalog/    catalog.ts (load index.json, search, layer of kind, port lookup)
  geometry/   transform.ts (placement, port world point, exit direction), route.ts, offset.ts
  storage/    autosave.ts
  export/     svg.ts, png.ts, json.ts, download.ts
  ui/         App.tsx, Header.tsx, Logo.tsx, Palette.tsx, Canvas.tsx, DeviceView.tsx,
              WireView.tsx, Inspector.tsx, useKeys.ts, styles.css
scripts/sync-icons.mjs
```

Each `model`, `catalog`, `geometry`, `storage` and `export` module is pure or takes its
browser APIs as parameters, and has Vitest tests. UI gets component tests for the palette
search, inspector and layer switch, and a manual check in the browser preview.

## Error handling

- `index.json` fails to load: the app shows the error text in the palette and keeps the
  canvas (devices draw as gray boxes).
- An icon SVG fails to load at export: that device exports as a gray box with its name.
- Open of a bad JSON file: an alert with the first check that failed; the current document
  stays.
