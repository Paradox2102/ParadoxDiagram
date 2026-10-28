// The MCP tools: one definition each (schema, description, example, handler). The server registers them, and
// --dump-tools writes the same definitions as the reference on the /api page.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { layerOfKind, LAYERS, portPolarity, searchIcons, type Catalog, type Icon } from '../../src/catalog/catalog';
import { boundsOf } from '../../src/geometry/scene';
import { busOf } from '../../src/model/canbus';
import type { Doc } from '../../src/model/types';
import { autoLayout } from './layout';
import { OP_EXAMPLES, OpSchema, runOps } from './ops';
import { findProblems } from './problems';
import { renderPng } from './render';
import type { DiagramStore } from './store';

/** What the live link gives the tools (the live server, once it runs). */
export interface LiveLinks {
  /** The link to the public site. */
  link(): string;
  /** The same diagram in the app this server serves on 127.0.0.1. */
  localLink(): string;
  clients(): number;
}

export interface ToolContext {
  store: DiagramStore;
  catalog: Catalog;
  live: LiveLinks | null;
  /** Opens a link in the default browser (not set in tests). */
  openUrl?: (url: string) => void;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  example: Record<string, unknown>;
  run(ctx: ToolContext, args: never): Promise<CallToolResult>;
}

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });
const json = (v: unknown) => JSON.stringify(v, null, 1);

function ports(icon: Icon) {
  return icon.anchors.map((a) => {
    const pol = portPolarity(a);
    return { port: a.port, layer: layerOfKind(a.kind), kind: a.kind, ...(pol ? { polarity: pol } : {}), label: a.label };
  });
}

function deviceType(icon: Icon, full: boolean) {
  return {
    slug: icon.slug, name: icon.name, type: icon.type, vendor: icon.vendor_name,
    ...(icon.part_number ? { part_number: icon.part_number } : {}),
    ...(icon.status === 'legacy' ? { legacy: true } : {}),
    size_mm: icon.size_mm,
    ...(full && icon.description ? { description: icon.description } : {}),
    ports: ports(icon),
  };
}

function problemsText(doc: Doc, catalog: Catalog): string {
  const list = findProblems(doc, catalog);
  return list.length ? `${list.length} problem(s):\n${list.map((p) => `- ${p.message}`).join('\n')}` : 'No problems found.';
}

function problemCount(doc: Doc, catalog: Catalog): string {
  const n = findProblems(doc, catalog).length;
  return n ? `${n} problem(s); call check to list them.` : 'No problems found.';
}

function diagramSummary(ctx: ToolContext) {
  const { store, catalog } = ctx;
  const doc = store.doc;
  return {
    title: doc.title, revision: store.rev, file: store.file,
    devices: doc.devices.map((d) => {
      const b = boundsOf(catalog, d);
      const bus = busOf(doc, catalog, d.id);
      return {
        id: d.id, slug: d.slug, name: d.name, x: d.x, y: d.y, rot: d.rot,
        box: { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, width: Math.round(b.w * 10) / 10, height: Math.round(b.h * 10) / 10 },
        ...(d.canId !== null ? { can_id: d.canId } : {}),
        ...(bus ? { can_bus: bus } : {}),
        ...(d.ip ? { ip: d.ip } : {}),
        ...(d.notes ? { notes: d.notes } : {}),
        ...(d.fields ? { fields: d.fields.map((f) => ({ label: f.label, value: f.value, ...(f.onLabel ? { on_label: true } : {}) })) } : {}),
        ...(d.tagSide ? { label_side: d.tagSide } : {}),
        ...(d.hideTag ? { label_hidden: true } : {}),
      };
    }),
    wires: doc.wires.map((w) => ({
      id: w.id, layer: w.layer, from: `${w.from.device}.${w.from.port}`, to: `${w.to.device}.${w.to.port}`,
      ...(w.fuseA !== undefined ? { fuse_a: w.fuseA } : {}),
      ...(w.awg !== undefined ? { awg: w.awg } : {}),
      ...(w.note ? { note: w.note } : {}),
    })),
    problems: findProblems(doc, catalog).length,
  };
}

function liveText(ctx: ToolContext): string {
  if (!ctx.live) return '';
  return `\nOpen the diagram live: ${ctx.live.link()}\nIf that browser cannot connect, use: ${ctx.live.localLink()}`;
}

/** Apply an AI edit: one revision, one undo step for undo_last_edit. */
function commitAi(ctx: ToolContext, next: Doc): number {
  ctx.store.pushAiStep(ctx.store.doc, next);
  return ctx.store.commit(next, 'ai');
}

const Region = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
  .describe('An area of the diagram in mm (get_diagram gives each device box).');

function tool<S extends z.ZodObject>(def: {
  name: string; title: string; description: string; input: S; example: z.infer<S>;
  run(ctx: ToolContext, args: z.infer<S>): Promise<CallToolResult>;
}): ToolDef {
  return def as unknown as ToolDef;
}

export const TOOLS: ToolDef[] = [
  tool({
    name: 'search_devices',
    title: 'Search devices',
    description:
      'Find device types in the FRC device catalog by name, vendor, part number or slug. Gives each slug (for add_device), ' +
      'its size and its ports: port name, layer (power, can, network, air), + or − polarity for single-conductor power ports, and label.',
    input: z.object({
      query: z.string().describe('Words to look for, for example "spark flex", "pdh", "limelight".'),
      type: z.string().optional().describe('Only this type: controllers, power, motor-controllers, motors, communication, sensors, vision, pneumatics, lights, driver-station.'),
      include_legacy: z.boolean().optional().describe('Also show devices that are not sold now.'),
    }),
    example: { query: 'spark flex' },
    async run(ctx, a) {
      let found = searchIcons(ctx.catalog.icons, a.query, !!a.include_legacy);
      if (a.type) found = found.filter((i) => i.type === a.type);
      if (!found.length) return text(`No device matches "${a.query}". Try fewer words, or one of the types: ${ctx.catalog.types.map((t) => t.id).join(', ')}.`);
      return text(json(found.slice(0, 20).map((i) => deviceType(i, false))) + (found.length > 20 ? `\n(${found.length - 20} more; add words to narrow it)` : ''));
    },
  }),
  tool({
    name: 'get_device_type',
    title: 'Get a device type',
    description: 'One device type from the catalog with its description and all its ports.',
    input: z.object({ slug: z.string().describe('The slug, from search_devices.') }),
    example: { slug: 'rev-pdh' },
    async run(ctx, a) {
      const icon = ctx.catalog.bySlug.get(a.slug);
      if (!icon) return { ...text(`No device type "${a.slug}". Use search_devices to find the slug.`), isError: true };
      return text(json(deviceType(icon, true)));
    },
  }),
  tool({
    name: 'get_diagram',
    title: 'Get the diagram',
    description:
      'The current diagram, with the changes the person made in the browser: devices (id, type, name, position, box in mm, ' +
      'CAN ID and bus, IP, notes, fields, label side) and wires (layer, ends, fuse, gauge, note). Call it before you edit ' +
      'after the person has had the diagram open.',
    input: z.object({}),
    example: {},
    async run(ctx) {
      ctx.store.requireFile();
      return text(json(diagramSummary(ctx)));
    },
  }),
  tool({
    name: 'new_diagram',
    title: 'New diagram',
    description: 'Make a new, empty diagram file and work on it. It does not overwrite a file that exists (use open_diagram).',
    input: z.object({
      path: z.string().describe('The file, for example "~/robot/robot.paradox.json". A relative path is from the folder the server started in.'),
      title: z.string().optional(),
    }),
    example: { path: 'robot.paradox.json', title: 'Team 2102 robot' },
    async run(ctx, a) {
      const file = ctx.store.create(a.path, a.title);
      return text(`New diagram ${file}.${liveText(ctx)}`);
    },
  }),
  tool({
    name: 'open_diagram',
    title: 'Open a diagram',
    description: 'Open a .paradox.json file (from the app\'s Export → JSON, or one made here) and work on it.',
    input: z.object({ path: z.string().describe('The file. A relative path is from the folder the server started in.') }),
    example: { path: 'robot.paradox.json' },
    async run(ctx, a) {
      const { file, droppedWires } = ctx.store.open(a.path);
      const d = ctx.store.doc;
      const dropped = droppedWires ? ` ${droppedWires} wire(s) did not match their ports and were left out.` : '';
      return text(`Opened ${file}: "${d.title}", ${d.devices.length} devices, ${d.wires.length} wires.${dropped}${liveText(ctx)}`);
    },
  }),
  tool({
    name: 'open_in_browser',
    title: 'Open in the browser',
    description:
      'Give the person the live link and open it in their browser. In the browser they see each change you make at once, ' +
      'and you see theirs with get_diagram. The link works only on this computer, while this server runs.',
    input: z.object({}),
    example: {},
    async run(ctx) {
      if (!ctx.live) return { ...text('The live server is not running.'), isError: true };
      ctx.store.requireFile();
      const link = ctx.live.link();
      ctx.openUrl?.(link);
      return text(`Live link: ${link}\nIf that browser cannot connect (a "local network" block), use: ${ctx.live.localLink()}\nTabs connected now: ${ctx.live.clients()}`);
    },
  }),
  tool({
    name: 'edit',
    title: 'Edit the diagram',
    description:
      'Change the diagram with a list of operations, run in order: add_device, update_device, remove, connect, update_wire, ' +
      'disconnect, place, row, column, align, rotate, label_side, set_label_hidden, set_title. A later operation can use an ' +
      'id that an earlier one made. If one operation fails, nothing changes and the error says which one and why. ' +
      'Ports are written <device-id>.<port>, for example pdh.ch4.',
    input: z.object({ ops: z.array(OpSchema).min(1).describe('The operations, in order.') }),
    example: { ops: [OP_EXAMPLES.add_device, OP_EXAMPLES.connect] },
    async run(ctx, a) {
      ctx.store.requireFile();
      const { doc, summary } = runOps(ctx.store.doc, ctx.catalog, a.ops);
      const rev = commitAi(ctx, doc);
      return text(`${summary.map((s) => `- ${s}`).join('\n')}\nNow at revision ${rev}. ${problemCount(doc, ctx.catalog)}`);
    },
  }),
  tool({
    name: 'auto_layout',
    title: 'Arrange automatically',
    description:
      'Arrange the devices from the way they connect: controller and network devices in a row at the top, motor controllers ' +
      'in columns in CAN chain order with their motors beside them, pneumatics to the right, power devices in a row at the ' +
      'bottom (battery, breaker, PDH). Use it once for a first layout, then render and fix details with edit (place, row, align).',
    input: z.object({ ids: z.array(z.string()).optional().describe('Only these devices (placed to the right of the others). Default: all.') }),
    example: {},
    async run(ctx, a) {
      ctx.store.requireFile();
      for (const id of a.ids ?? []) if (!ctx.store.doc.devices.some((d) => d.id === id)) throw new Error(`no device "${id}"`);
      const doc = autoLayout(ctx.store.doc, ctx.catalog, a.ids);
      const rev = commitAi(ctx, doc);
      return text(`Arranged ${a.ids?.length ?? doc.devices.length} devices. Now at revision ${rev}. ${problemCount(doc, ctx.catalog)}`);
    },
  }),
  tool({
    name: 'render',
    title: 'Render a picture',
    description:
      'A PNG picture of the diagram as it exports (at most 1600 px wide), and its problems. Look at it after a change to ' +
      'find overlaps, crossed wires and labels in the way. Give a layer to see one layer, or a region (mm) to look closer.',
    input: z.object({
      layer: z.enum([...LAYERS, 'all']).optional().describe('One layer; devices with no port on it fade. Default: all.'),
      region: Region.optional(),
      scale: z.number().min(1).max(4).optional().describe('1 to 4, default 2. Lowered to keep the picture 1600 px wide or less.'),
    }),
    example: { layer: 'power' },
    async run(ctx, a) {
      ctx.store.requireFile();
      const r = await renderPng(ctx.store.doc, ctx.catalog, a);
      return {
        content: [
          { type: 'image', data: r.png.toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: `${r.width} × ${r.height} px, scale ${Math.round(r.scale * 100) / 100}. ${problemsText(ctx.store.doc, ctx.catalog)}` },
        ],
      };
    },
  }),
  tool({
    name: 'check',
    title: 'Check the diagram',
    description:
      'List the problems: devices that overlap, labels that cover devices, a CAN ID missing or used twice on one bus, ' +
      'devices with no power wire, a power channel that feeds two devices, unknown device types.',
    input: z.object({}),
    example: {},
    async run(ctx) {
      ctx.store.requireFile();
      return text(problemsText(ctx.store.doc, ctx.catalog));
    },
  }),
  tool({
    name: 'undo_last_edit',
    title: 'Undo the last edit',
    description: 'Reverse your last edit or auto_layout. Changes the person made in the browser since then stay.',
    input: z.object({}),
    example: {},
    async run(ctx) {
      ctx.store.requireFile();
      return text(ctx.store.undoAi() ? `Undone. Now at revision ${ctx.store.rev}.` : 'There is no edit of yours to undo.');
    },
  }),
];

export const INSTRUCTIONS = `Paradox Diagram: build an FRC robot wiring diagram with the person, live in their browser.
1. new_diagram (or open_diagram), then open_in_browser so the person can watch and edit.
2. search_devices for each device, then one edit call that adds the devices and connects the ports (power, CAN, network, air).
3. auto_layout for a first arrangement, then render and look at the picture.
4. Fix overlaps and details with edit (place, row, column, align, label_side); check until it reports no problems.
5. The person edits too: call get_diagram before each edit, and never undo their changes.`;

export const PROMPT = `Build the wiring diagram of my FRC robot in Paradox Diagram. Before you start, ask me for what you do not know:
- the robot controller (SystemCore or roboRIO) and the radio;
- the power devices: battery, main breaker, PDH or PDP, and any VRM, MPM or PowerHub;
- each motor controller or integrated motor: its name, CAN ID, CAN bus, and the PDH channel and fuse it uses;
- the network devices (coprocessors, cameras) and their IP addresses;
- the pneumatics, if any.
Then make the diagram, open it in my browser, lay it out, and check it.`;

/** The tool reference for the /api page: each tool and each edit operation, with its JSON Schema and an example. */
export function toolsJson(): object {
  return {
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, input: z.toJSONSchema(t.input), example: t.example })),
    ops: OpSchema.options.map((o) => {
      const op = (o.shape.op as z.ZodLiteral<string>).value;
      return { op, description: o.description ?? '', input: z.toJSONSchema(o), example: OP_EXAMPLES[op as keyof typeof OP_EXAMPLES] };
    }),
    instructions: INSTRUCTIONS,
  };
}
