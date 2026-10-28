// The operations of the edit tool. A call runs its operations in order on a copy of the diagram; the first one
// that fails stops the call, and the diagram stays as it was. Each error names the operation and what is allowed.
import { z } from 'zod';
import {
  canConnect, findAnchor, layerOfKind, portPolarity, searchIcons, type Anchor, type Catalog, type Icon, type Layer,
} from '../../src/catalog/catalog';
import { apply, type Action, type DevicePatch, type WirePatch } from '../../src/model/actions';
import { ID_PATTERN, SIDES, TAG_SIDES, type CustomField, type Doc, type PortRef, type Side } from '../../src/model/types';
import { normalIp, validAwg, validCanBus, validFields, validFuse, validIp } from '../../src/model/validate';
import { alignOp, columnMoves, DEFAULT_GAP_MM, relativePlace, rowMoves } from './place';

const id = z.string().describe('A device or wire id, for example "intake" or "d3".');
const ids = z.array(z.string()).min(1).describe('Device ids (remove also takes wire ids).');
const port = z.string().describe('A port as <device-id>.<port>, for example "pdh.ch4". search_devices lists each device type\'s ports.');
const gap = z.number().min(0).describe(`Space between the boxes (device plus label), in mm. Default ${DEFAULT_GAP_MM}.`);
const field = z.object({
  label: z.string().describe('1 to 40 characters'),
  value: z.string().describe('At most 200 characters'),
  on_label: z.boolean().optional().describe('Show "label value" in the device label on the diagram'),
});
const placeFields = {
  x: z.number().optional().describe('Exact x of the device in mm (with y).'),
  y: z.number().optional().describe('Exact y of the device in mm (with x).'),
  right_of: z.string().optional().describe('Put the device to the right of this device id.'),
  left_of: z.string().optional().describe('Put the device to the left of this device id.'),
  above: z.string().optional().describe('Put the device above this device id.'),
  below: z.string().optional().describe('Put the device below this device id.'),
  gap: gap.optional(),
  align: z.enum(['start', 'center', 'end']).optional().describe('Line up with the other device: start (left or top), center (default) or end.'),
};
const Place = z.object(placeFields).describe('Exact x and y, or one of right_of / left_of / above / below.');
const deviceFields = {
  name: z.string().optional().describe('The name in the label, for example "Intake".'),
  notes: z.string().optional(),
};

export const OpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_device'),
    slug: z.string().describe('The device type, from search_devices, for example "neo-vortex-spark-flex".'),
    id: z.string().optional().describe('Your id for the device: a letter, then letters, digits, _ or - (at most 40). Default d1, d2, …'),
    ...deviceFields,
    can_id: z.number().int().min(0).optional(),
    can_bus: z.string().optional().describe('Only when the bus cannot be found from the CAN wires.'),
    ip: z.string().optional().describe('IPv4 address or DHCP.'),
    fields: z.array(field).optional(),
    rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional().describe('Rotation, clockwise.'),
    label_side: z.enum(TAG_SIDES).optional(),
    place: Place.optional(),
  }).describe('Add a device to the diagram.'),
  z.object({
    op: z.literal('update_device'),
    id,
    ...deviceFields,
    can_id: z.number().int().min(0).nullable().optional().describe('null removes the CAN ID.'),
    can_bus: z.string().nullable().optional().describe('null goes back to the bus found from the CAN wires.'),
    ip: z.string().nullable().optional().describe('IPv4 address or DHCP; null removes it.'),
    fields: z.array(field).nullable().optional().describe('Replaces all fields; null removes them.'),
  }).describe('Change a device\'s name, CAN ID, bus, IP, notes or fields.'),
  z.object({ op: z.literal('remove'), ids }).describe('Remove devices (with their wires) or wires.'),
  z.object({
    op: z.literal('connect'),
    from: port,
    to: port,
    id: z.string().optional().describe('Your id for the wire. Default w1, w2, …'),
    fuse_a: z.number().optional().describe('Power wires: the fuse or breaker at the channel, in amps (more than 0, at most 200).'),
    awg: z.number().int().optional().describe('Power wires: the wire gauge, 4 to 30.'),
    note: z.string().optional(),
    from_side: z.enum(SIDES).optional().describe('The side the wire leaves the from port by. Default: automatic.'),
    to_side: z.enum(SIDES).optional().describe('The side the wire leaves the to port by. Default: automatic.'),
  }).describe('Draw a wire between two ports of one layer. A power cable to separate + and − terminals splits by itself.'),
  z.object({
    op: z.literal('update_wire'),
    id,
    fuse_a: z.number().nullable().optional(),
    awg: z.number().int().nullable().optional(),
    note: z.string().optional(),
  }).describe('Change a wire\'s fuse, gauge or note.'),
  z.object({ op: z.literal('disconnect'), from: port, to: port }).describe('Remove the wire between two ports.'),
  z.object({ op: z.literal('place'), id, ...placeFields }).describe('Move a device: exact x and y, or beside another device.'),
  z.object({
    op: z.literal('row'), ids, gap: gap.optional(),
    x: z.number().optional().describe('Where the row starts (left edge). Default: where the first device is.'),
    y: z.number().optional().describe('The top of the first device. Default: where it is.'),
  }).describe('Line devices up left to right, in the given order, middles level.'),
  z.object({
    op: z.literal('column'), ids, gap: gap.optional(),
    x: z.number().optional().describe('The left edge of the first device. Default: where it is.'),
    y: z.number().optional().describe('Where the column starts (top edge). Default: where the first device is.'),
  }).describe('Line devices up top to bottom, in the given order, centres in line.'),
  z.object({
    op: z.literal('align'), ids, edge: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']),
  }).describe('Line up the device outlines on one edge or centre line.'),
  z.object({ op: z.literal('rotate'), ids, turns: z.number().int().min(1).max(3).optional().describe('Quarter turns clockwise. Default 1.') }).describe('Rotate devices.'),
  z.object({ op: z.literal('label_side'), ids, side: z.enum(TAG_SIDES) }).describe('Put the labels of devices on one side.'),
  z.object({ op: z.literal('set_label_hidden'), ids, hidden: z.boolean() }).describe('Hide or show the labels of devices.'),
  z.object({ op: z.literal('set_title'), title: z.string() }).describe('Set the diagram title.'),
]);

export type Op = z.infer<typeof OpSchema>;
export type OpName = Op['op'];

export const OP_EXAMPLES: Record<OpName, Op> = {
  add_device: { op: 'add_device', slug: 'neo-vortex-spark-flex', id: 'intake', name: 'Intake', can_id: 21, place: { right_of: 'pdh' } },
  update_device: { op: 'update_device', id: 'radio', ip: '10.21.2.1', fields: [{ label: 'Firmware', value: '1.2.0', on_label: true }] },
  remove: { op: 'remove', ids: ['intake'] },
  connect: { op: 'connect', from: 'pdh.ch4', to: 'intake.vbat_pos', fuse_a: 40, awg: 12 },
  update_wire: { op: 'update_wire', id: 'w3', fuse_a: 30 },
  disconnect: { op: 'disconnect', from: 'pdh.ch4', to: 'intake.vbat_pos' },
  place: { op: 'place', id: 'intake', below: 'pdh', gap: 30, align: 'start' },
  row: { op: 'row', ids: ['intake', 'indexer', 'shooter'], gap: 20 },
  column: { op: 'column', ids: ['sc', 'radio'] },
  align: { op: 'align', ids: ['intake', 'indexer'], edge: 'left' },
  rotate: { op: 'rotate', ids: ['pdh'], turns: 1 },
  label_side: { op: 'label_side', ids: ['intake', 'indexer'], side: 'left' },
  set_label_hidden: { op: 'set_label_hidden', ids: ['bat'], hidden: true },
  set_title: { op: 'set_title', title: 'Team 2102 robot' },
};

export class OpError extends Error {
  constructor(public index: number, public op: string, message: string) {
    super(`op ${index + 1} (${op}): ${message}`);
  }
}

const POLARITY = { '+': '+', '-': '−' } as const;
const portLabel = (a: Anchor) => {
  const p = portPolarity(a);
  return p ? `${a.port} (${POLARITY[p]})` : a.port;
};

/** Everything an op needs: the diagram so far and the catalog, with the lookups that give helpful errors. */
class Ctx {
  constructor(public doc: Doc, public catalog: Catalog) {}

  do(a: Action) {
    this.doc = apply(this.doc, a);
  }

  device(devId: string) {
    const d = this.doc.devices.find((x) => x.id === devId);
    if (!d) throw new Error(`no device "${devId}". The devices are: ${this.doc.devices.map((x) => x.id).join(', ') || 'none yet'}.`);
    return d;
  }

  icon(devId: string): Icon {
    const d = this.device(devId);
    const icon = this.catalog.bySlug.get(d.slug);
    if (!icon) throw new Error(`device "${devId}" has the unknown type "${d.slug}", so its ports are not known.`);
    return icon;
  }

  /** "pdh.ch4" as a port reference and its anchor; `layer` narrows the list of ports in the error. */
  port(text: string, layer?: Layer): { ref: PortRef; anchor: Anchor } {
    const dot = text.indexOf('.');
    if (dot < 1) throw new Error(`"${text}" is not a port; write <device-id>.<port>, for example pdh.ch4.`);
    const devId = text.slice(0, dot);
    const name = text.slice(dot + 1);
    const icon = this.icon(devId);
    const anchor = findAnchor(icon, name);
    if (!anchor) {
      const ports = icon.anchors.filter((a) => !layer || layerOfKind(a.kind) === layer).map(portLabel);
      const what = layer ? `${layer} ports` : 'ports';
      throw new Error(`${icon.slug} "${devId}" has no port "${name}". Its ${what} are ${ports.join(', ') || 'none'}.`);
    }
    return { ref: { device: devId, port: name }, anchor };
  }

  newId(given: string | undefined) {
    if (given === undefined) return undefined;
    if (!ID_PATTERN.test(given)) {
      throw new Error(`id "${given}" must start with a letter and use only letters, digits, _ and - (at most 40 characters).`);
    }
    if (this.doc.devices.some((d) => d.id === given) || this.doc.wires.some((w) => w.id === given)) {
      throw new Error(`id "${given}" is already used.`);
    }
    return given;
  }
}

/** The other end's layer, when that end is a known port: it narrows the port list in an error. */
function layerOf(ctx: Ctx, text: string): Layer | undefined {
  try {
    return layerOfKind(ctx.port(text).anchor.kind);
  } catch {
    return undefined;
  }
}

function fieldsOf(fields: z.infer<typeof field>[]): CustomField[] {
  const out = fields.map((f) => ({ label: f.label.trim(), value: f.value, ...(f.on_label ? { onLabel: true } : {}) }));
  if (!validFields(out)) throw new Error('fields: at most 20, each with a label of 1 to 40 characters and a value of at most 200.');
  return out;
}

function devicePatch(op: { name?: string; notes?: string; can_id?: number | null; can_bus?: string | null; ip?: string | null; fields?: z.infer<typeof field>[] | null }): DevicePatch {
  const p: DevicePatch = {};
  if (op.name !== undefined) p.name = op.name;
  if (op.notes !== undefined) p.notes = op.notes;
  if (op.can_id !== undefined) p.canId = op.can_id;
  if (op.can_bus !== undefined) {
    if (op.can_bus !== null && !validCanBus(op.can_bus)) throw new Error(`can_bus "${op.can_bus}" must be 1 to 20 characters.`);
    p.canBus = op.can_bus === null ? null : op.can_bus.trim();
  }
  if (op.ip !== undefined) {
    if (op.ip !== null && !validIp(op.ip.trim())) throw new Error(`ip "${op.ip}" must be an IPv4 address like 10.21.2.11, or DHCP.`);
    p.ip = op.ip === null ? null : normalIp(op.ip.trim());
  }
  if (op.fields !== undefined) p.fields = op.fields === null || !op.fields.length ? null : fieldsOf(op.fields);
  return p;
}

function wirePatch(op: { fuse_a?: number | null; awg?: number | null; note?: string }, layer: Layer): WirePatch {
  const p: WirePatch = {};
  if ((op.fuse_a != null || op.awg != null) && layer !== 'power') throw new Error(`fuse_a and awg are for power wires; this is a ${layer} wire.`);
  if (op.fuse_a !== undefined) {
    if (op.fuse_a !== null && !validFuse(op.fuse_a)) throw new Error(`fuse_a ${op.fuse_a} must be more than 0 and at most 200.`);
    p.fuseA = op.fuse_a;
  }
  if (op.awg !== undefined) {
    if (op.awg !== null && !validAwg(op.awg)) throw new Error(`awg ${op.awg} must be a whole number from 4 to 30.`);
    p.awg = op.awg;
  }
  if (op.note !== undefined) p.note = op.note;
  return p;
}

function place(ctx: Ctx, devId: string, p: z.infer<typeof Place>): string {
  const rel = p.right_of ?? p.left_of ?? p.above ?? p.below;
  if (rel !== undefined) {
    ctx.device(rel);
    ctx.do(relativePlace(ctx.doc, ctx.catalog, devId, p));
    const where = (['right_of', 'left_of', 'above', 'below'] as const).find((k) => p[k] !== undefined)!;
    return `${where.replace('_', ' ')} ${rel}`;
  }
  if (p.x === undefined || p.y === undefined) throw new Error('place needs x and y, or one of right_of, left_of, above, below.');
  const d = ctx.device(devId);
  ctx.do({ type: 'moveDevices', ids: [devId], dx: p.x - d.x, dy: p.y - d.y });
  const moved = ctx.device(devId);
  return `at (${moved.x}, ${moved.y})`;
}

function existingIds(ctx: Ctx, list: string[]) {
  for (const x of list) ctx.device(x);
  return list;
}

function runOne(ctx: Ctx, op: Op): string {
  switch (op.op) {
    case 'add_device': {
      if (!ctx.catalog.bySlug.has(op.slug)) {
        const near = searchIcons(ctx.catalog.icons, op.slug.replace(/[-_]/g, ' '), true).slice(0, 3).map((i) => i.slug);
        throw new Error(`no device type "${op.slug}". Use search_devices to find the slug${near.length ? ` (close: ${near.join(', ')})` : ''}.`);
      }
      const given = ctx.newId(op.id);
      const before = ctx.doc.devices.length;
      ctx.do({ type: 'addDevice', id: given, slug: op.slug, name: op.name ?? '', x: 0, y: 0 });
      const devId = ctx.doc.devices[before].id;
      const patch = devicePatch(op);
      if (Object.keys(patch).length) ctx.do({ type: 'updateDevice', id: devId, patch });
      for (let i = 0; i < (op.rot ?? 0) / 90; i++) ctx.do({ type: 'rotateDevices', ids: [devId] });
      if (op.label_side) ctx.do({ type: 'setTagSide', ids: [devId], side: op.label_side });
      const where = op.place ? place(ctx, devId, op.place) : 'at (0, 0)';
      return `added ${devId} (${op.slug}) ${where}`;
    }
    case 'update_device': {
      ctx.device(op.id);
      ctx.do({ type: 'updateDevice', id: op.id, patch: devicePatch(op) });
      return `updated ${op.id}`;
    }
    case 'remove': {
      for (const x of op.ids) {
        if (!ctx.doc.devices.some((d) => d.id === x) && !ctx.doc.wires.some((w) => w.id === x)) {
          throw new Error(`no device or wire "${x}". The devices are: ${ctx.doc.devices.map((d) => d.id).join(', ') || 'none'}.`);
        }
      }
      ctx.do({ type: 'delete', ids: op.ids });
      return `removed ${op.ids.join(', ')}`;
    }
    case 'connect': {
      const a = ctx.port(op.from, layerOf(ctx, op.to));
      const b = ctx.port(op.to, layerOf(ctx, op.from));
      const la = layerOfKind(a.anchor.kind);
      const lb = layerOfKind(b.anchor.kind);
      if (la !== lb) throw new Error(`${op.from} is a ${la} port and ${op.to} is a ${lb} port; a wire joins two ports of one layer.`);
      if (!canConnect(a.anchor, b.anchor)) {
        throw new Error(`${op.from} (${POLARITY[portPolarity(a.anchor)!]}) to ${op.to} (${POLARITY[portPolarity(b.anchor)!]}) is a short; connect + to + and − to −.`);
      }
      if (op.from === op.to) throw new Error('a wire cannot go from a port to itself.');
      const same = (w: { from: PortRef; to: PortRef }, x: PortRef, y: PortRef) =>
        w.from.device === x.device && w.from.port === x.port && w.to.device === y.device && w.to.port === y.port;
      const dup = ctx.doc.wires.find((w) => same(w, a.ref, b.ref) || same(w, b.ref, a.ref));
      if (dup) throw new Error(`${op.from} and ${op.to} are already connected (wire ${dup.id}).`);
      const given = ctx.newId(op.id);
      const patch = wirePatch(op, la);
      const before = ctx.doc.wires.length;
      ctx.do({ type: 'addWire', id: given, layer: la, from: a.ref, to: b.ref });
      const wireId = ctx.doc.wires[before].id;
      if (Object.keys(patch).length) ctx.do({ type: 'updateWire', id: wireId, patch });
      for (const [end, side] of [['from', op.from_side], ['to', op.to_side]] as const) {
        if (side) ctx.do({ type: 'setWireSide', id: wireId, end, side: side as Side });
      }
      return `connected ${op.from} to ${op.to} (${la}, wire ${wireId})`;
    }
    case 'update_wire': {
      const w = ctx.doc.wires.find((x) => x.id === op.id);
      if (!w) throw new Error(`no wire "${op.id}". The wires are: ${ctx.doc.wires.map((x) => x.id).join(', ') || 'none'}.`);
      ctx.do({ type: 'updateWire', id: op.id, patch: wirePatch(op, w.layer) });
      return `updated wire ${op.id}`;
    }
    case 'disconnect': {
      const a = ctx.port(op.from).ref;
      const b = ctx.port(op.to).ref;
      const eq = (x: PortRef, y: PortRef) => x.device === y.device && x.port === y.port;
      const w = ctx.doc.wires.find((x) => (eq(x.from, a) && eq(x.to, b)) || (eq(x.from, b) && eq(x.to, a)));
      if (!w) throw new Error(`no wire between ${op.from} and ${op.to}.`);
      ctx.do({ type: 'delete', ids: [w.id] });
      return `removed wire ${w.id}`;
    }
    case 'place': {
      ctx.device(op.id);
      return `placed ${op.id} ${place(ctx, op.id, op)}`;
    }
    case 'row':
    case 'column': {
      const list = existingIds(ctx, op.ids);
      const start = op.x !== undefined || op.y !== undefined ? { x: op.x, y: op.y } : undefined;
      const f = op.op === 'row' ? rowMoves : columnMoves;
      ctx.do(f(ctx.doc, ctx.catalog, list, op.gap ?? DEFAULT_GAP_MM, start));
      return `${op.op} of ${list.join(', ')}`;
    }
    case 'align': {
      ctx.do(alignOp(ctx.doc, ctx.catalog, existingIds(ctx, op.ids), op.edge));
      return `aligned ${op.ids.join(', ')} ${op.edge}`;
    }
    case 'rotate': {
      const list = existingIds(ctx, op.ids);
      for (let i = 0; i < (op.turns ?? 1); i++) ctx.do({ type: 'rotateDevices', ids: list });
      return `rotated ${list.join(', ')}`;
    }
    case 'label_side':
      ctx.do({ type: 'setTagSide', ids: existingIds(ctx, op.ids), side: op.side });
      return `labels of ${op.ids.join(', ')} on the ${op.side}`;
    case 'set_label_hidden':
      ctx.do({ type: 'setTagHidden', ids: existingIds(ctx, op.ids), hidden: op.hidden });
      return `labels of ${op.ids.join(', ')} ${op.hidden ? 'hidden' : 'shown'}`;
    case 'set_title':
      ctx.do({ type: 'setTitle', title: op.title });
      return `title "${op.title}"`;
  }
}

/** Run the ops in order on a copy of `doc`. Throws OpError at the first op that fails; `doc` is never changed. */
export function runOps(doc: Doc, catalog: Catalog, ops: Op[]): { doc: Doc; summary: string[] } {
  const ctx = new Ctx(doc, catalog);
  const summary: string[] = [];
  ops.forEach((op, i) => {
    try {
      summary.push(runOne(ctx, op));
    } catch (e) {
      throw new OpError(i, op.op, (e as Error).message);
    }
  });
  return { doc: ctx.doc, summary };
}
