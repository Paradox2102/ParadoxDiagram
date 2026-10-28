<p align="center">
  <img src="public/logo.svg" width="96" alt="Paradox Diagram logo: a Penrose triangle in red, blue and gold">
</p>

<h1 align="center">Paradox Diagram</h1>

<p align="center">
  Lay out your FRC robot's wiring in the browser: power, CAN, network and air, drawn with real device icons.<br>
  No account, no install. Your diagram stays in your browser until you export or share it.
</p>

![Paradox Diagram with an example robot: PDH, battery, main breaker, SystemCore, radio, two SPARK Flex and two Kraken X60 motors](docs/screenshots/hero.png)

Paradox Diagram is a web app made by [FRC Team 2102 Paradox](https://docs.team2102.org) for any FRC team.
You place devices from the FRC device icon collection, draw wires between their real ports, and export a
diagram that looks like a team wiring poster.

## Features

- **Real device icons.** 92 FRC devices (controllers, PDH / PDP / PowerHub, motor controllers, motors, sensors,
  radios, vision, pneumatics) with every port where it is on the real device. Search by name, vendor or part
  number.
- **Four layers.** Power, CAN, Network (Ethernet, USB, signal) and Air. Show all of them, or one at a time.
- **Wires that route themselves.** Wires go around devices and labels, and leave each port by its own side.
  Drag a segment or add bends where you want a different path, and choose the side a wire leaves a port by.
- **Power drawn like the real thing.** A power cable is a red and black pair. Battery, breaker and
  distribution inputs are single conductors. A cable to a device with separate + and − terminals splits near
  the device.
- **Labels that fill themselves in.** Each device shows its name, its CAN ID and the channel its power comes
  from (`PDH 4`, `PDP 2`, `PH 7`, `MPM 1`, `VRM 12V/2A`). Put a label on any side of its device, or hide it.
- **Tidy layouts.** Devices snap to the grid and to the edges and centres of other devices. Select several
  devices to align them or set the space between them.
- **Export and share.** SVG and PNG (2× or 4×) for posters and slides, JSON to keep a copy, and a share link
  that opens the same diagram for anyone, with no account.
- **Saved as you go.** The layout is kept in your browser, with undo and redo.

## Screenshots

### One layer at a time

Pick a layer in the top bar. Devices with no port on that layer fade, so the CAN bus or the power tree is easy
to follow.

![The CAN layer: SystemCore, two SPARK Flex, the PDH and two Kraken X60 on two CAN buses](docs/screenshots/layer-can.png)

### Device details

Select a device to give it a name and a CAN ID, write notes, move or hide its label, and rotate it. The panel
shows the device's full description and part number.

![A Kraken X60 selected: name, CAN ID, notes, label side and rotate controls](docs/screenshots/device-details.png)

### Wire details

Select a wire to see its two ends, choose which side each end leaves its port by, or reset its route. Here the
PDH channel 12 cable runs to the SPARK Flex + terminal and the black conductor splits off to its − terminal.

![A power wire selected, with the From leaves and To leaves controls](docs/screenshots/wire-details.png)

### What you export

The SVG and PNG exports draw the devices, wires and labels on white, ready to print.

![The exported diagram of the example robot](docs/screenshots/export.png)

## Build a diagram

1. Find a device in the list on the left. Drag it onto the canvas, or click it to add it at the centre.
2. Hover a device to see its ports. Drag from a port to a port of the same layer to draw a wire.
3. Select a device to name it and give it a CAN ID. Select a wire to change its route.
4. Use **Export** to save an SVG, a PNG or a JSON file, or **Share** to copy a link.

To try it with a full robot, use **Open** with
[`examples/example-robot.paradox.json`](examples/example-robot.paradox.json).

| Action | How |
|---|---|
| Pan | Right-drag, middle-drag, or Space + drag |
| Zoom | Mouse wheel, or the − / + / Fit buttons |
| Select several | Drag a box on empty space; Shift + click adds to the selection |
| Move | Drag a device (hold Alt to place it without snapping); arrow keys nudge 1 mm, Shift + arrow 5 mm |
| Rotate | R, or the rotate handle on a selected device |
| Delete | Delete or Backspace |
| Undo / redo | Ctrl/⌘ + Z, Ctrl/⌘ + Shift + Z |
| Add or remove a bend | Double-click a wire segment, or a bend |

## Files and share links

- **JSON** is the full diagram (`"format": "paradox-diagram"`). Open it again with **Open** on any computer.
- **Share links** hold the whole diagram, compressed, in the part of the URL after `#`. That part is never
  sent to a server. A link always opens the version you shared; share again after you make changes.
- **Your browser** keeps the last layout (local storage). Clear the site data, or use a private window, and it
  is gone, so export a JSON copy of work you want to keep.

## Run it locally

You need [Node.js](https://nodejs.org) 24 or later.

```bash
npm ci
```

```bash
npm run dev
```

The app runs at the address Vite prints (for example `http://localhost:5173`). Other commands:

| Command | What it does |
|---|---|
| `npm run check` | Type check and run all tests (Vitest) |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the built site |

The app is static files only: no server and no database.

## Project layout

```
src/
  catalog/    the icon index: devices, ports, search, port polarity
  model/      the diagram document, its actions (undo/redo), checks for opened files, labels
  geometry/   wire routing, lanes, + / − splits, label placement, alignment
  export/     SVG, PNG and JSON export
  share/      share links
  storage/    browser autosave
  ui/         React components
public/icons/ the FRC device icon collection (copied in, see below)
examples/     an example diagram
docs/         design notes and screenshots
```

## Device icons

The icons come from the FRC device icon collection by Team 2102, published at
[github.com/Paradox2102/PrettyDocs/tree/main/public/icons](https://github.com/Paradox2102/PrettyDocs/tree/main/public/icons)
and dedicated to the public domain under [CC0 1.0](public/icons/LICENSE.md). A copy is committed in
`public/icons/`, so the app builds on its own. Team 2102 maintainers update the copy with `npm run sync-icons`.

Missing a device, or found a port in the wrong place? Open an issue with the device name and a link to its
product page.

## Credits

Made by [FRC Team 2102 Paradox](https://docs.team2102.org).
