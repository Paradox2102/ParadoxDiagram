# @paradox2102/diagram-mcp

An [MCP](https://modelcontextprotocol.io) server for [Paradox Diagram](https://diagram.team2102.org), the FRC robot
wiring diagram editor. It lets an AI agent (Claude, Cursor, or any MCP app) build the diagram with you: choose the
devices, connect them, lay them out, and fill in CAN IDs, power channels, fuse sizes, IP addresses and notes. You watch
and edit the same diagram live at diagram.team2102.org, at the same time.

Full documentation: **[diagram.team2102.org/api](https://diagram.team2102.org/api)**

## Setup

You need Node.js 24 or later.

Claude Code:

```bash
claude mcp add paradox-diagram -- npx -y @paradox2102/diagram-mcp
```

Claude Desktop, Cursor and other MCP apps (Claude Desktop: Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "paradox-diagram": { "command": "npx", "args": ["-y", "@paradox2102/diagram-mcp"] }
  }
}
```

Options: `--file <path>` opens (or makes) that diagram at start, `--port <n>` sets the live link's port (default: any
free port), `--site <origin>` sets the site that may connect.

## Tools

| Tool | What it does |
|---|---|
| `search_devices` | Find device types and their ports in the FRC device catalog |
| `get_device_type` | One device type with all its ports |
| `new_diagram`, `open_diagram` | Make or open a `.paradox.json` file |
| `open_in_browser` | Open the live link in your browser |
| `get_diagram` | The diagram now, with your edits from the browser |
| `edit` | A list of operations: add, update, remove, connect, place, row, column, align, rotate, … |
| `auto_layout` | A first arrangement from the way the devices connect |
| `render` | A PNG picture of the diagram and its problems |
| `check` | Overlaps, CAN IDs used twice, devices with no power, … |
| `undo_last_edit` | Undo the AI's last edit (yours stay) |

## The live link

The server keeps the diagram in a file and runs a WebSocket server on 127.0.0.1 only. The link it gives has a random
token; only the Paradox Diagram site (and localhost pages) with that token can connect. If a browser does not let the
site connect to 127.0.0.1, use the second link `open_in_browser` gives: the same app, served by the server itself.

## License

The FRC device icons are CC0 1.0 (public domain). Liberation Sans (assets/fonts) is under the SIL Open Font License
1.1; see assets/fonts/LICENSE.
