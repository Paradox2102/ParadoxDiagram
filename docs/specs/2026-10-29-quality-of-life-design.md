# Quality-of-life features: design

Date: 2026-10-29. Status: scope approved in chat ("all 4 of these, plus the title block on export"). Target release: 1.2.0.

## Goal

Five small features that save time for an FRC team and keep the app simple: no account, no server, no new settings
page. Each feature uses code or data that already exists.

1. A problem list in the browser.
2. Copy, paste and duplicate.
3. A CAN ID and power table (CSV export).
4. Start from the example robot.
5. A title block on SVG and PNG exports.

## 1. Problem list

- Move `mcp/src/problems.ts` to `src/model/problems.ts`, so the app and the MCP server use one module. The MCP server
  imports it from there; its tool output stays the same, word for word.
- `findProblems(doc, catalog, nameOf?)`: `nameOf(id)` gives the text that a message uses for a device. The default is
  the id (the MCP server's text). The app passes the label name (`deviceTag(...).name`), so a person reads
  "Front left drive", not "d4".
- The top bar gets a **Check** button. It shows the count when there are problems: `Check (3)`. A click opens a list
  under the button (the same style as the Export menu). Each problem is one item; a click on an item selects its devices
  and closes the list. With no problems, the list says "No problems found."
- The count is computed from the current document after each edit (`useMemo` on the document and the catalog).
- All seven checks of the MCP server show: overlap, label covers a device, CAN ID missing, CAN ID used twice on one bus,
  no power, one power channel feeds two devices, unknown device.

## 2. Copy, paste and duplicate

- **Ctrl/Cmd+C** copies the selected devices and the wires whose two ends are both in the selection. The clipboard is
  in memory in this tab, so a copy can go into a new diagram in the same tab. Nothing goes to the system clipboard.
- **Ctrl/Cmd+V** pastes the clipboard 10 mm right and 10 mm down from where it was copied. Each further paste of the
  same clipboard moves 10 mm more, so pastes do not stack.
- **Ctrl/Cmd+D** duplicates the selection in one step (10 mm offset). It does not change the clipboard.
- A pasted device gets a new id, the same name, rotation, label side, label hiding, IP, CAN bus, notes and fields.
- **CAN ID:** a copy of a device with a CAN ID gets the smallest free ID above the original, from 1 to 62, that no
  device in the document uses. When none is free, the copy has no CAN ID (the problem list then shows it).
- A pasted wire gets a new id and keeps its layer, note, fuse, gauge, chosen sides and bends (moved by the offset).
- The pasted devices become the selection. One paste is one undo step.
- The keys do nothing while the focus is in a text box (the rule that the other keys already follow), and Ctrl/Cmd+C
  with no device selected keeps the browser's normal copy.

## 3. CAN ID and power table

- The Export menu gets **Table (CSV)**. It downloads `<title>-devices.csv`.
- One row for each device. Columns: Name, Device, Vendor, CAN bus, CAN ID, Power from, Fuse (A), Wire (AWG), IP,
  Notes, then one column for each custom field label in the document (in first-seen order).
- **Power from** uses the label's text for the feeds: `PDH 4`, or `PDH 4/5` for two channels. Fuse and wire gauge
  come from the power wire of the first feed.
- **CAN bus** is the bus from the CAN chain or the device's own setting (`busOf`), empty when unknown.
- Rows sort by CAN bus, then CAN ID, then name. Devices with no CAN ID come last, by name.
- RFC 4180 quoting (a field with a comma, a quote or a line break is quoted, a quote is doubled), CRLF line ends, and
  a UTF-8 byte order mark so Excel reads characters such as "×" correctly.

## 4. Start from the example robot

- `examples/example-robot.paradox.json` goes into the build (a JSON import; it is 5 KB).
- **New** becomes a menu with two items: **Empty diagram** and **Example robot**. Both ask before they replace a
  diagram that has devices, as New does now.
- The help panel (the right panel when nothing is selected) gets an **Open the example robot** button, so a new user
  sees it on the first visit.
- The example goes through `validateDoc` with the catalog, like a file that a person opens, and the view fits it.

## 5. Title block

- The document gets two optional fields: `team` (team number or name, up to 40 characters) and `revision` (up to 20).
  Empty means absent. They travel like the title: JSON file, share link, autosave, live link (`DocPatch`), the file
  JSON Schema, and `validateDoc`.
- The help panel gets a **Diagram** section with two text boxes: Team and Revision. The title stays in the top bar.
- SVG and PNG exports get a title block: a strip across the bottom of the page, 14 mm high, with a thin line above it.
  - Left: the title in bold; under it, the team.
  - Right: `Rev <revision>` (when set), the export date (`YYYY-MM-DD`), and the layer when one layer is shown
    (`Power layer`); under it, in small grey text, `diagram.team2102.org`.
  - The page is at least 160 mm wide, so the block has room on a small diagram.
- The Export menu gets a check item **Title block**, on by default. The choice is kept in this browser
  (`localStorage`, in try/catch), because it is a viewer's preference and not part of the diagram.
- The MCP server's `render` tool does not draw the title block (it is for the AI to look at the layout). The
  `set_title` operation gets optional `team` and `revision`, so an AI can fill them in.

## 6. Numbered CANivores (added 2026-10-29 at the user's request)

- SystemCore has CAN buses S0 to S4, and some teams add one or more CANivores. With one CANivore, its bus stays
  `CANivore`. With two or more, the buses are `CANivore 1`, `CANivore 2`, and so on, in the order the devices were added.
- Each numbered CANivore's label shows `Bus CANivore 2`, so a person can see which bus is which.
- The duplicate CAN ID check then keeps the CANivore buses apart (the same ID on two CANivores is correct).

## Out of scope

- A system-clipboard paste between tabs or browsers.
- A printable HTML table (the CSV opens in Excel or Google Sheets, which print it).
- More than one diagram kept in the browser.
- Pan to a problem's devices (the selection shows them).

## Testing

- Unit tests: problems with names, the paste clone (ids, CAN IDs, offset, wires), the CSV (columns, sort, quoting,
  BOM), the title block in the SVG, `team` and `revision` in validate, patch and schema.
- UI tests: the Check button and list, the keys, the New menu and the example button, the Diagram section, the
  Table (CSV) and Title block items.
- The MCP tests keep passing with the moved module, and `tools.json` is rebuilt for the new `set_title` fields.
- A check in the browser: each feature once, light and dark.
