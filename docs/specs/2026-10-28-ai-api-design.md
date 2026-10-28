# AI API (MCP server with live editing): design

Date: 2026-10-28. Status: approved in chat, section by section. Target release: 1.1.0.

## Purpose

A team member uses an AI agent that knows their robot (Claude Desktop, Claude Code, Cursor or any other MCP
client) to build the robot's wiring diagram. The AI chooses the devices, connects them, arranges them and fills
in the details (names, CAN IDs, IP addresses, fuse sizes, notes). The person works on the **same diagram at the
same time** in https://diagram.team2102.org, with no import or export. Each side sees the other's changes.

Success:

1. A student adds the MCP server to their AI with one command from the /api page.
2. They ask the AI for a diagram of the example robot (PDH, battery, breaker, SystemCore, radio, two SPARK Flex,
   two Kraken X60). The AI builds it with the tools only, looks at a render, and fixes its own overlaps.
3. The student opens the live link. The diagram shows, and each later AI change shows in the tab at once.
4. The student drags a device and renames another. The AI's next `get_diagram` shows both changes.
5. The diagram is in a `.paradox.json` file on the student's disk at all times.

## Decisions made in chat

| Question | Choice |
|---|---|
| How the AI reaches the app | An MCP server for agents |
| Where the server runs | On the user's computer, `npx @paradox2102/diagram-mcp` (stdio) |
| How the person sees the work | Live link from the public site to the local server |
| New fields | Fuse/breaker amps and wire gauge, IP address, CAN bus, free key/value fields |
| Layout | Relative placement, auto-layout, exact x/y, and a PNG render for the AI to check |
| npm | Scope `@paradox2102`, published from the release workflow |

## Out of scope for 1.1.0

- A hosted (remote) MCP server for claude.ai or ChatGPT connectors.
- More than one person on one diagram (more than one tab of the same person is allowed).
- Undo of the AI's edits from the tab. The AI has its own `undo_last_edit` tool.
- Changes to the file from outside the server while it runs (the AI calls `open_diagram` again to reload).

## 1. Architecture

```
AI agent ──stdio MCP──▶ @paradox2102/diagram-mcp (user's computer)
                          │ owns the .paradox.json file and a revision counter
                          │ imports src/model, src/catalog, src/geometry, src/export
                          └─ WebSocket server on 127.0.0.1:<port>
                                 ▲
        https://diagram.team2102.org/#live=<port>.<token>   (the person's browser tab)
```

The MCP server is the one owner of the diagram. It applies every change in arrival order, saves the file and
sends the new diagram to every connected tab. The tab is a live copy that sends its edits to the server.

### Server start

`npx -y @paradox2102/diagram-mcp [--file <path>] [--port <n>] [--site <origin>]`

- `--file`: the diagram file to open at start. With no file, the AI must call `new_diagram` or `open_diagram`
  before an edit. The error says so.
- `--port`: the WebSocket port. Default 0 (the OS picks a free port).
- `--site`: the allowed page origin. Default `https://diagram.team2102.org`. `http://localhost:*` and
  `http://127.0.0.1:*` are always allowed, for development.
- The server listens on 127.0.0.1 only. The token is 128 random bits, base64url, new at each start.
- Logs go to stderr (stdout is the MCP channel).

### File

- The file is the normal `paradox-diagram` JSON (`examples/example-robot.paradox.json` opens as is).
- The server writes the file after each revision: write to `<file>.tmp`, then rename.
- `open_diagram` runs `validateDoc` with the catalog. Wires that fail are dropped and the result says how many.

### Live link

- Link: `<site>/#live=<port>.<token>`. The part after `#` never goes to a web server.
- The tab removes `live=` from the address bar after it reads it (as it does for `share=`), and keeps it in
  `sessionStorage` so a reload of the tab connects again.
- The tab connects to `ws://127.0.0.1:<port>/live`. The server refuses the upgrade (HTTP 403) when the Origin
  header is not allowed, and closes the socket (code 4401) when the `hello` token is wrong.
- CSP change on the public site: `connect-src 'self' blob: data: ws://127.0.0.1:*`.

### Messages (JSON text frames)

Tab to server:

| Message | Meaning |
|---|---|
| `{ t: "hello", token, protocol: 1, app: "1.1.0" }` | First frame. |
| `{ t: "action", seq, action }` | One edit from the tab. `seq` counts up per tab. `action` is an `Action` (src/model/actions.ts). |

Server to tab:

| Message | Meaning |
|---|---|
| `{ t: "welcome", rev, doc, file, server: "1.1.0" }` | After a good `hello`. |
| `{ t: "doc", rev, doc, by: "ai" \| "tab", seq? }` | The diagram after a change. `seq` is set when the change was this tab's action. |
| `{ t: "reject", seq, error }` | The server could not apply this tab action (for example, the device is gone). |
| `{ t: "error", code, message }` then close | `protocol` mismatch (code 4426) or bad token (4401). |

A `protocol` mismatch shows in the tab as: "This AI server is version X and the site is version Y. Update it with
`npx @paradox2102/diagram-mcp@latest`." The server sends the full diagram in each `doc` message. Diagrams are
small (the example robot is about 6 kB), so no diff format is needed.

### Concurrent edits

- Actions name devices and wires by ID, so the server can apply a tab action to a diagram that the AI changed
  after the tab sent it. Edits to different things both stay. When both sides change the same field, the later
  one wins.
- The tab applies its own action at once (so the drag feels local), then takes each `doc` from the server as
  the truth.
- During a drag (pointer down on a device, wire segment or bend), the tab keeps only the newest `doc` and shows it
  when the pointer comes up.
- An action that the server rejects is undone in the tab by the next `doc`, and the tab shows the `error` in its
  status line.

### Undo in the tab, in live mode

The tab's undo reverses only the person's own actions:

- For each of its own actions, the tab keeps the diagram before and after.
- Undo makes a new `restore` action. For each device or wire that the action changed, `restore` puts back its
  "before" form: re-add it if the action removed it, remove it if the action added it, or replace it.
- Things that the AI changed later are not touched, except the same item, which goes back to its "before" form.
- Redo does the same with the "after" forms.
- `restore` is a new `Action`: `{ type: 'restore'; devices: Device[]; wires: Wire[]; remove: string[] }`.
- Out of live mode, undo works as it does now.

### Live mode in the tab

- **Badge:** a badge in the top bar shows "Live · AI connected" (connected), "Live · reconnecting…", or
  "Live · AI server stopped".
- **Connect:** before it connects, the tab asks for confirmation when its local diagram is not empty (as for a
  share link): "Replace the diagram in this browser with the AI's diagram?". Autosave to localStorage pauses
  while the tab is live.
- **Reconnect:** when the socket closes, the tab tries again after 1, 2, 4 and 8 s, then every 10 s for 2 minutes.
  After that it stops, shows "AI server stopped", and keeps the last diagram as a normal local diagram (autosave
  starts again).
- **Leave live mode:** a "Leave live mode" item in the badge menu does the same at once.
- **Other tabs:** more than one tab can connect. All of them get each `doc`.

### Fallback when a browser blocks the connection

The first plan task tests a page on an HTTPS origin that is not localhost, with a connection to
`ws://127.0.0.1:<port>`, in Chrome (local network access permission prompt), Safari and Firefox. If a browser
blocks it, the server also serves the built app (bundled in the package) at `http://127.0.0.1:<port>/`. In that
case `open_in_browser` gives that address for the blocked browsers, and the /api page says which browsers need it.

**Result (2026-10-28):** the Claude desktop app's built-in browser (Chromium) blocks `https://example.com` to
`ws://127.0.0.1` with no prompt (the request never reaches the server). A page served from `http://127.0.0.1` connects.
Chrome, Safari and Firefox were not tested yet. So the server always serves the app locally as well, and
`open_in_browser` gives both links: the public site first, and the local link for a browser that blocks it.

## 2. MCP tools

All tools are in `mcp/src/tools/`. Each tool has a zod input schema with a description and an example. The
server's MCP `instructions` give the order of work: search devices, add devices, connect, `auto_layout`,
`render`, fix, `check`.

| Tool | Input | Result |
|---|---|---|
| `search_devices` | `query`, `type?`, `include_legacy?` | Up to 20 devices: slug, name, vendor, part number, size in mm, ports (ID, layer, polarity `+`/`−`/none, label). |
| `get_device_type` | `slug` | One device with all its ports and its description. |
| `get_diagram` | none | Title, revision, file path, devices (ID, slug, name, x, y, rot, width, height, all fields), wires (ID, layer, from, to, fields), problem count. |
| `new_diagram` | `path`, `title?` | Makes an empty diagram file (refuses to overwrite an existing file). |
| `open_diagram` | `path` | Opens a file; the count of dropped wires. |
| `open_in_browser` | none | The live link. Also opens it in the default browser (`open`, `xdg-open` or `start`). |
| `edit` | `ops: Op[]` | All ops or none. A summary of each op, the new revision and the problem count. |
| `auto_layout` | `ids?` | Arranges the devices (all, or the list). The new revision. |
| `render` | `layer?`, `region?: {x, y, width, height}`, `scale?` | A PNG image (at most 1600 px wide) and the problems list as text. |
| `check` | none | The problems list. |
| `undo_last_edit` | none | Reverses the AI's last `edit` or `auto_layout` with a `restore` (same rule as the tab's undo). |

### `edit` operations

A port is written `<device-id>.<port>`, for example `pdh.ch4`. A device ID from the AI must match
`^[A-Za-z][A-Za-z0-9_-]{0,39}$` and be unique among all device and wire IDs. With no ID, the server uses
`nextId` (`d1`, `d2`, …), which already skips IDs in use.

| Op | Fields |
|---|---|
| `add_device` | `slug`, `id?`, `name?`, `can_id?`, `can_bus?`, `ip?`, `notes?`, `fields?`, `rot?`, `label_side?`, `place?` |
| `update_device` | `id`, then any of `name`, `can_id`, `can_bus`, `ip`, `notes`, `fields` (`null` clears a field) |
| `remove` | `ids` (devices also remove their wires) |
| `connect` | `from`, `to`, `id?`, `fuse_a?`, `awg?`, `note?`, `from_side?`, `to_side?` |
| `update_wire` | `id`, then any of `fuse_a`, `awg`, `note` |
| `disconnect` | `from`, `to` (or use `remove` with the wire ID) |
| `place` | `id`, then `x` and `y` (mm), or `right_of` / `left_of` / `above` / `below` with `gap?` (mm, default 20) and `align?` (`start`, `center`, `end`; default `center`) |
| `row` / `column` | `ids` (in order), `gap?` (default 20), `x?`, `y?` (start point; default the first device's position) |
| `align` | `ids`, `edge`: `left`, `center`, `right`, `top`, `middle` or `bottom` |
| `rotate` | `ids`, `turns?` (90° each, default 1) |
| `label_side` | `ids`, `side`: `bottom`, `top`, `left` or `right` |
| `set_label_hidden` | `ids`, `hidden` |
| `set_title` | `title` |

Ops in one call run in order, and a later op can use an ID that an earlier op made. `place` in `add_device`
uses the same keys as the `place` op. The layer of a `connect` comes from the two ports. `connect` refuses what
the canvas refuses, with the same function (`canConnect` in src/catalog/catalog.ts):

- ports on different layers;
- a `+` to `−` power connection;
- a port to itself, or a wire that is already there.

The split power cables are drawn as in the app, because the server uses the same scene code.

The server makes each op into one or more `Action`s and applies them with `apply()`. A failed op stops the call
and leaves the diagram as it was. The error has this form:

```
op 3 (connect): rev-spark-flex "intake" has no port "v+". Its power ports are pwr_pos (+), pwr_neg (−).
```

Each message names the op number, the op, the device, what is wrong, and the values that are allowed.

### Auto-layout rules

`auto_layout` gives a first arrangement. The AI then corrects it with `place`, `row`, `column` and `align`.

1. **Power row (bottom):** battery, main breaker, then the PDH/PDP/PowerHub, left to right, in the order of the
   power wires.
2. **Control row (top):** the robot controller, radio, then the other network devices (coprocessors, cameras),
   in the order of the network wires.
3. **Motor columns (middle):** motor controllers in CAN chain order (follow the CAN wires from the controller
   port), each with its motor to the right when a motor connects to it. Start a new column after 6 rows.
4. **Pneumatics (right):** compressor, PH, solenoids, tanks, in a column.
5. **Other devices:** a row at the right of the power row.

Spacing is the device size plus its label box plus 20 mm, snapped to the 5 mm grid. Devices that the rules do
not cover stay where they are, unless they overlap a placed device (then they move right until clear).

### Render

`render` builds the SVG with the export code (`src/export/svg.ts`, the same output as Export → SVG), with the
icons from the package, and converts it to PNG with `@resvg/resvg-js`. The package bundles TTF copies of
Barlow, Barlow Semi Condensed and JetBrains Mono (SIL OFL 1.1, with the license files). `layer` shows one layer
as the app does (other devices fade). `region` crops to an area in mm. `scale` is 1 to 4 and is lowered when the
image would be more than 1600 px wide.

### Problems (`check`, and with `render`, `edit` and `get_diagram`)

| Problem | Example text |
|---|---|
| Devices overlap | `intake and indexer overlap (12 × 30 mm)` |
| A label covers another device | `the label of pdh covers systemcore` |
| The same CAN ID twice on one bus | `CAN ID 21 is used twice on bus S0: intake, shooter` |
| A CAN device with no CAN ID | `intake has CAN ports and no CAN ID` |
| A powered device with no power wire | `radio has a power port and no power wire` |
| A power channel used twice | `pdh.ch4 feeds two devices: intake, indexer` |
| An unknown slug | `d9 uses unknown device "spark-maxx"` |

## 3. New fields

All new fields are optional. A file keeps `version: 1`. `validateDoc` keeps a field only when it is valid, so a
bad value is dropped, not an error.

### Device

| Field | Type and rule | Panel | Label facts |
|---|---|---|---|
| `ip` | IPv4 dotted quad, or `DHCP` | "IP address", only for a device with an Ethernet port | `10.21.2.11` |
| `canBus` | 1 to 20 characters | "CAN bus", only for a device with a CAN port; the placeholder shows the bus the app finds | `CAN S1·12`, only when the diagram has more than one bus |
| `fields` | list of `{ label, value, onLabel? }`, label 1 to 40 characters, value up to 200, at most 20 rows | "Fields": a row each (label, value, "On label" box, remove), and "Add field" | `Firmware 25.1`, for each row with `onLabel` |

**CAN bus that the app finds:**

- When `canBus` is empty, `src/model/canbus.ts` follows the CAN wires from the device to a port on a robot
  controller or CAN adapter.
- The bus name comes from that port: SystemCore `can_s0` is `S0`, a roboRIO `can` is `RIO`, and a CANivore is
  `CANivore`.
- A device with no path to such a port has no bus.
- The duplicate CAN ID check uses this bus, or the typed bus.

### Power wire

| Field | Type and rule | Panel | Label facts of the powered device |
|---|---|---|---|
| `fuseA` | number, more than 0, at most 200 | "Fuse / breaker (A)" | `PDH 4 (40 A)` |
| `awg` | integer, 4 to 30 | "Gauge (AWG)" | `PDH 4 (40 A, 12 AWG)` |

These two fields show only for wires on the power layer.

### Model changes

- `Device` gets `ip?`, `canBus?` and `fields?`. `Wire` gets `fuseA?` and `awg?`.
- The `updateDevice` and `updateWire` patches take the new fields.
- `addDevice` takes an optional `id`.
- `Action` gets `restore` (section 1).
- `src/model/tags.ts` puts the new facts in the label, in this order: CAN, power, IP, then the fields marked
  "On label".
- SVG and PNG exports show the same label as the canvas. JSON and share links carry every field.
- Each field edit in the panel is one undo step, as for the current fields.

## 4. Package, documentation, release and tests

### Repo layout

```
mcp/
  package.json        @paradox2102/diagram-mcp, version = root package.json version, bin diagram-mcp
  src/server.ts       stdio MCP server, args, instructions
  src/live.ts         WebSocket server, origin and token check, revisions, file save
  src/tools/*.ts      one file per tool; ops.ts for the edit ops
  src/layout.ts       auto_layout
  src/problems.ts     check
  src/render.ts       SVG to PNG
  assets/             icons (index.json and SVGs, copied at build), fonts (TTF and OFL licenses)
  vite.config.ts      library build to dist/server.js (Node 24, ESM), with src/ code bundled in
  README.md           the npm page
src/live/             the tab side: client, live badge, selective undo
src/ui/ApiPage.tsx    the /api page
public/api/           tools.json (generated), schema.json (the file format JSON Schema)
scripts/api-docs.mjs  writes public/api/tools.json from the zod schemas
```

New pinned dependencies of `mcp/`: `@modelcontextprotocol/sdk`, `zod`, `ws`, `@resvg/resvg-js`. The app gets no
new runtime dependency. The root `npm run check` also type-checks and tests `mcp/`.

### Documentation

- **The /api page:** linked as "API" in the top bar of the editor and the gallery. It has these parts:
  1. What it does: an AI builds and edits the diagram with you, live.
  2. Setup:
     - Claude Code: `claude mcp add paradox-diagram -- npx -y @paradox2102/diagram-mcp`
     - Claude Desktop and Cursor: an MCP JSON config, with a copy button for each.
  3. A first session: an example prompt for a student.
  4. Tool reference: from `public/api/tools.json`, each tool and each `edit` op with its parameters and an
     example.
  5. File format, with a link to `/api/schema.json`.
  6. How the live link is kept safe: 127.0.0.1 only, a token, and open only while the server runs.
  7. Troubleshooting: the local network permission prompt, a version mismatch, and a stopped server.
- **No drift:**
  - `scripts/api-docs.mjs` makes `tools.json` from the same zod schemas as the server.
  - The build runs the script.
  - A test fails when `tools.json` is out of date, or when a tool or op has no description or example.
- **Other docs:** `mcp/README.md` gives setup and a short tool list, and links to the /api page. The main README
  gets an "Use it with an AI" section.

### Release

- **Version:** the root and `mcp/` package versions must be the same. `deploy.yml` checks this along with the tag.
- **npm publish:** `deploy.yml` gets a `publish-mcp` job after the deploy job. It builds `mcp/` and runs
  `npm publish --access public --provenance` with npm trusted publishing (GitHub OIDC, `id-token: write`), so
  no npm token is stored.
- **One-time steps for the user:**
  1. Make the npm org `paradox2102`.
  2. Publish 1.1.0 by hand (`npm publish` in `mcp/` after `npm run build`), or put a one-time token in a GitHub
     Environment secret for the first run.
  3. Add the trusted publisher (repo `Paradox2102/ParadoxDiagram`, workflow `deploy.yml`) on npmjs.com.
- **Site change:** the Caddyfile CSP gets `ws://127.0.0.1:*` in `connect-src`, and `scripts/check-headers.sh`
  checks for it.
- **The release:** 1.1.0, published from GitHub as 1.0.1 and 1.0.2 were.

### Tests

- **Unit tests (Vitest):**
  - The new fields: `validateDoc` keeps good values and drops bad ones; the actions; the label facts.
  - CAN bus: found from the chain, and replaced by a typed value.
  - Each `edit` op; a batch that fails at op N changes nothing; the error text names the allowed values.
  - `auto_layout` on the example robot (all its devices, no positions) gives no overlaps and no label overlaps.
  - Each problem in `check`.
  - `restore`: undo in live mode reverses only the tab's own action and keeps a later AI change.
- **Live sync:**
  - A real `ws` server on port 0 with two clients checks the revision order and that each client gets each
    `doc`.
  - A wrong token closes with 4401. A wrong Origin gets 403. A protocol mismatch closes with 4426.
  - A `reject` reaches the tab for an action on a removed device.
  - The tab client with a mock socket holds a `doc` during a drag and shows the newest after it.
- **MCP end to end:** the SDK's client starts `dist/server.js` over stdio and builds the example robot through
  the tools only. Then `render` must return a PNG with a valid signature and a width of at most 1600 px, and the
  saved file must pass `validateDoc`.
- **Browser test (plan task 1):** the test in section 1, "Fallback when a browser blocks the connection".
