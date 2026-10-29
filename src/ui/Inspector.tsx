// The right panel: properties of the selected device or wire.
import { useEffect, useRef, useState } from 'react';
import type { Catalog } from '../catalog/catalog';
import type { Action, DevicePatch } from '../model/actions';
import { foundBus, hasNoCanId } from '../model/canbus';
import { deviceTag } from '../model/tags';
import { MAX_REVISION, MAX_TEAM, normalIp, validAwg, validCanBus, validFuse, validIp } from '../model/validate';
import { Arrange } from './Arrange';
import { FieldsEditor } from './FieldsEditor';
import { RotateIcon } from './RotateIcon';
import type { Device, Doc, PortRef, Side, TagSide, Wire } from '../model/types';

interface Props {
  doc: Doc;
  catalog: Catalog | null;
  selection: string[];
  dispatch: (a: Action) => void;
  /** Replaces the diagram with the example robot (the help panel's button). */
  onExample?: () => void;
}

const LAYER_NAME = { power: 'Power', can: 'CAN', network: 'Network', air: 'Air' } as const;

/**
 * A text field that commits on blur or Enter, so one edit is one undo step. Text not yet
 * committed is saved when the field goes away (a click on the canvas changes the selection).
 */
function Field(props: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: 'numeric' | 'decimal';
  /** The hint to show when the text is not valid; null when it is. Invalid text is never committed. */
  check?: (v: string) => string | null;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(props.value);
  const [hint, setHint] = useState<string | null>(null);
  const latest = useRef({ text, saved: props.value, onCommit: props.onCommit, check: props.check });
  latest.current.text = text;
  latest.current.onCommit = props.onCommit;
  latest.current.check = props.check;
  const commit = () => {
    const bad = props.check?.(text) ?? null;
    setHint(bad);
    if (bad) return;
    if (text !== latest.current.saved) {
      latest.current.saved = text;
      props.onCommit(text);
    }
  };
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.text !== l.saved && !l.check?.(l.text)) l.onCommit(l.text);
    },
    [],
  );
  const common = {
    value: text,
    placeholder: props.placeholder,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: commit,
  };
  const hintId = `hint-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <>
      <label>
        {props.label}
        {props.multiline ? (
          <textarea {...common} />
        ) : (
          <input
            {...common} inputMode={props.inputMode} aria-invalid={hint ? true : undefined}
            aria-describedby={hint ? hintId : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setText(latest.current.saved);
                setHint(null);
              }
            }}
          />
        )}
      </label>
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
    </>
  );
}

const ipCheck = (v: string) => (!v.trim() || validIp(v.trim()) ? null : 'Use 10.TE.AM.x or DHCP');
const busCheck = (v: string) => (!v.trim() || validCanBus(v) ? null : '1 to 20 characters');
const fuseCheck = (v: string) => (!v.trim() || validFuse(Number(v)) ? null : 'More than 0, at most 200');
const awgCheck = (v: string) => (!v.trim() || validAwg(Number(v)) ? null : 'A whole number from 4 to 30');

const TAG_BUTTONS: { side: TagSide; text: string }[] = [
  { side: 'left', text: '←' },
  { side: 'right', text: '→' },
  { side: 'top', text: '↑' },
  { side: 'bottom', text: '↓' },
];

/** Which side of the device(s) the label sits on; none pressed when a selection is mixed. */
function TagSidePicker({ devices, dispatch }: { devices: Device[]; dispatch: Props['dispatch'] }) {
  const sides = new Set(devices.map((d) => d.tagSide ?? 'bottom'));
  const current = sides.size === 1 ? [...sides][0] : null;
  return (
    <div className="side-row" role="group" aria-label="Label side">
      <span>Label side</span>
      {TAG_BUTTONS.map((b) => (
        <button
          key={b.side} type="button" aria-pressed={current === b.side} aria-label={`Label ${b.side}`}
          title={`Put the label ${b.side === 'bottom' || b.side === 'top' ? 'at the ' : 'on the '}${b.side} of the device`}
          onClick={() => dispatch({ type: 'setTagSide', ids: devices.map((d) => d.id), side: b.side })}
        >
          {b.text}
        </button>
      ))}
    </div>
  );
}

function RotateButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon" aria-label="Rotate 90°" title="Rotate 90° clockwise (R)" onClick={onClick}>
      <RotateIcon />
    </button>
  );
}

function DeviceForm({ doc, catalog, device, dispatch }: { doc: Doc; catalog: Catalog | null; device: Device; dispatch: Props['dispatch'] }) {
  const icon = catalog?.bySlug.get(device.slug);
  const tag = deviceTag(doc, device.id, catalog);
  const update = (patch: DevicePatch) => dispatch({ type: 'updateDevice', id: device.id, patch });
  const kinds = new Set(icon?.anchors.map((a) => a.kind));
  return (
    <>
      <h2>{tag.name}</h2>
      <p className="sub">
        {icon ? `${icon.name} · ${icon.vendor_name}` : `Unknown icon ${device.slug}`}
      </p>
      {icon?.description && <p className="desc">{icon.description}</p>}
      {tag.facts && <p className="sub mono">{tag.facts}</p>}
      <Field label="Name" value={device.name} placeholder={icon?.name} onCommit={(v) => update({ name: v })} />
      {(device.canId !== null || !hasNoCanId(device.slug)) && (
        <Field
          label="CAN ID" value={device.canId === null ? '' : String(device.canId)} inputMode="numeric"
          onCommit={(v) => {
            const t = v.trim();
            if (!t) return update({ canId: null });
            const n = Number(t);
            if (Number.isInteger(n) && n >= 0) update({ canId: n });
          }}
        />
      )}
      {kinds.has('can') && (
        <Field
          label="CAN bus" value={device.canBus ?? ''} placeholder={foundBus(doc, catalog, device.id) ?? 'none found'}
          check={busCheck} onCommit={(v) => update({ canBus: v.trim() || null })}
        />
      )}
      {kinds.has('ethernet') && (
        <Field
          label="IP address" value={device.ip ?? ''} placeholder="10.TE.AM.x or DHCP" check={ipCheck}
          onCommit={(v) => update({ ip: v.trim() ? normalIp(v.trim()) : null })}
        />
      )}
      <Field label="Notes" value={device.notes} multiline onCommit={(v) => update({ notes: v })} />
      <FieldsEditor fields={device.fields ?? []} onChange={(fields) => update({ fields })} />
      <label className="check">
        <input
          type="checkbox" checked={!device.hideTag}
          onChange={(e) => dispatch({ type: 'setTagHidden', ids: [device.id], hidden: !e.target.checked })}
        />
        Show label
      </label>
      <TagSidePicker devices={[device]} dispatch={dispatch} />
      {doc.hideTags && <p className="help">All labels are off (Labels in the top bar).</p>}
      <dl>
        <dt>Icon</dt>
        <dd>{device.slug}</dd>
        {icon?.part_number && (
          <>
            <dt>Part</dt>
            <dd>{icon.part_number}</dd>
          </>
        )}
        <dt>Rotation</dt>
        <dd>{device.rot}°</dd>
      </dl>
      <div className="row">
        <RotateButton onClick={() => dispatch({ type: 'rotateDevices', ids: [device.id] })} />
        <button type="button" className="danger" onClick={() => dispatch({ type: 'delete', ids: [device.id] })}>Delete</button>
      </div>
    </>
  );
}

function endName(doc: Doc, catalog: Catalog | null, ref: PortRef): string {
  const d = doc.devices.find((x) => x.id === ref.device);
  if (!d) return ref.port;
  return `${deviceTag(doc, d.id, catalog).name} · ${ref.port}`;
}

const SIDE_BUTTONS: { side: Side | null; label: string; text: string }[] = [
  { side: null, label: 'automatically', text: 'Auto' },
  { side: 'left', label: 'left', text: '←' },
  { side: 'right', label: 'right', text: '→' },
  { side: 'up', label: 'up', text: '↑' },
  { side: 'down', label: 'down', text: '↓' },
];

/** Which side one end of a wire leaves its port by: automatic, or a side the user picks. */
function SidePicker({ wire, end, dispatch }: { wire: Wire; end: 'from' | 'to'; dispatch: Props['dispatch'] }) {
  const current = (end === 'from' ? wire.fromSide : wire.toSide) ?? null;
  const name = end === 'from' ? 'From' : 'To';
  return (
    <div className="side-row" role="group" aria-label={`${name} end leaves`}>
      <span>{name} leaves</span>
      {SIDE_BUTTONS.map((b) => (
        <button
          key={b.text} type="button" aria-pressed={current === b.side} aria-label={`${name} end leaves ${b.label}`}
          title={b.side ? `Leave the port going ${b.label}` : 'Pick the side that gives the best route'}
          onClick={() => dispatch({ type: 'setWireSide', id: wire.id, end, side: b.side })}
        >
          {b.text}
        </button>
      ))}
    </div>
  );
}

function WireForm({ doc, catalog, wire, dispatch }: { doc: Doc; catalog: Catalog | null; wire: Wire; dispatch: Props['dispatch'] }) {
  return (
    <>
      <h2>{LAYER_NAME[wire.layer]} wire</h2>
      <dl>
        <dt>From</dt>
        <dd>{endName(doc, catalog, wire.from)}</dd>
        <dt>To</dt>
        <dd>{endName(doc, catalog, wire.to)}</dd>
        <dt>Bends</dt>
        <dd>{wire.bends.length}</dd>
      </dl>
      <SidePicker wire={wire} end="from" dispatch={dispatch} />
      <SidePicker wire={wire} end="to" dispatch={dispatch} />
      {wire.layer === 'power' && (
        <>
          <Field
            label="Fuse / breaker (A)" value={wire.fuseA === undefined ? '' : String(wire.fuseA)} inputMode="decimal"
            check={fuseCheck}
            onCommit={(v) => dispatch({ type: 'updateWire', id: wire.id, patch: { fuseA: v.trim() ? Number(v) : null } })}
          />
          <Field
            label="Gauge (AWG)" value={wire.awg === undefined ? '' : String(wire.awg)} inputMode="numeric" check={awgCheck}
            onCommit={(v) => dispatch({ type: 'updateWire', id: wire.id, patch: { awg: v.trim() ? Number(v) : null } })}
          />
        </>
      )}
      <Field label="Note" value={wire.note} multiline onCommit={(v) => dispatch({ type: 'updateWire', id: wire.id, patch: { note: v } })} />
      <div className="row">
        <button type="button" onClick={() => dispatch({ type: 'resetRoute', id: wire.id })} title="Remove the bends and set both ends to Auto">
          Reset route
        </button>
        <button type="button" className="danger" onClick={() => dispatch({ type: 'delete', ids: [wire.id] })}>Delete</button>
      </div>
    </>
  );
}

const longest = (max: number) => (v: string) => (v.trim().length <= max ? null : `${max} characters at most`);

/** Team and revision, for the title block under SVG and PNG exports. */
function DiagramDetails({ doc, dispatch }: { doc: Doc; dispatch: (a: Action) => void }) {
  return (
    <>
      <h2>Diagram</h2>
      {/* the key resets a box when the value changes from outside (undo, New, Open) */}
      <Field
        key={`team:${doc.team ?? ''}`} label="Team" value={doc.team ?? ''} placeholder="Number or name"
        check={longest(MAX_TEAM)} onCommit={(team) => dispatch({ type: 'setDetails', team })}
      />
      <Field
        key={`rev:${doc.revision ?? ''}`} label="Revision" value={doc.revision ?? ''} placeholder="For example B"
        check={longest(MAX_REVISION)} onCommit={(revision) => dispatch({ type: 'setDetails', revision })}
      />
      <p className="field-note">Shown in the title block of SVG and PNG exports.</p>
    </>
  );
}

function Help({ onExample }: { onExample?: () => void }) {
  return (
    <>
      <h2>Build a diagram</h2>
      <div className="help">
        {onExample && (
          <p>
            New here? <button type="button" className="link-button" onClick={onExample}>Open the example robot</button> to
            see a finished diagram.
          </p>
        )}
        <p>Drag a device from the list, or click it. Hover a device to see its ports, then drag from a port to a port of the same layer to draw a wire.</p>
        <p>
          Select a wire to drag its segments or bends. Double-click a segment to add a bend, a bend to remove it.
        </p>
        <p>
          <kbd>R</kbd> rotate · arrows nudge · <kbd>Del</kbd> delete · right-drag pan · wheel zoom · <kbd>⌘Z</kbd> undo ·{' '}
          <kbd>⌘C</kbd> <kbd>⌘V</kbd> copy, paste · <kbd>⌘D</kbd> duplicate
        </p>
        <p>
          Dragged devices snap to the edges and centres of other devices (hold <kbd>Alt</kbd> to place freely). Select
          several devices to align them or set the space between them.
        </p>
        <p>The layout is kept in this browser. Export JSON to keep a copy or move it to another computer.</p>
      </div>
      <p className="about">
        Device icons: the FRC device icon collection by FRC Team 2102 Paradox, CC0 1.0 (public domain).
      </p>
    </>
  );
}

export function Inspector({ doc, catalog, selection, dispatch, onExample }: Props) {
  const live = selection.filter((id) => doc.devices.some((d) => d.id === id) || doc.wires.some((w) => w.id === id));
  let body;
  if (live.length === 0) {
    body = (
      <>
        <DiagramDetails doc={doc} dispatch={dispatch} />
        <Help onExample={onExample} />
      </>
    );
  }
  else if (live.length > 1) {
    const devices = live.filter((id) => doc.devices.some((d) => d.id === id));
    const selected = doc.devices.filter((d) => devices.includes(d.id));
    body = (
      <>
        <h2>{live.length} selected</h2>
        {devices.length > 1 && <Arrange doc={doc} catalog={catalog} ids={devices} dispatch={dispatch} />}
        {devices.length > 0 && (
          <div className="row">
            <button type="button" onClick={() => dispatch({ type: 'setTagHidden', ids: devices, hidden: true })}>Hide labels</button>
            <button type="button" onClick={() => dispatch({ type: 'setTagHidden', ids: devices, hidden: false })}>Show labels</button>
          </div>
        )}
        {devices.length > 0 && <TagSidePicker devices={selected} dispatch={dispatch} />}
        <div className="row">
          <RotateButton onClick={() => dispatch({ type: 'rotateDevices', ids: live })} />
          <button type="button" className="danger" onClick={() => dispatch({ type: 'delete', ids: live })}>Delete</button>
        </div>
      </>
    );
  } else {
    const device = doc.devices.find((d) => d.id === live[0]);
    const wire = doc.wires.find((w) => w.id === live[0]);
    // key: a new selection, or an undo that changes the values, starts the fields fresh
    if (device) body = <DeviceForm key={`${device.id}:${device.name}:${device.canId}:${device.notes}:${device.ip}:${device.canBus}:${JSON.stringify(device.fields ?? [])}`} doc={doc} catalog={catalog} device={device} dispatch={dispatch} />;
    else if (wire) body = <WireForm key={`${wire.id}:${wire.note}:${wire.fuseA}:${wire.awg}`} doc={doc} catalog={catalog} wire={wire} dispatch={dispatch} />;
  }
  return (
    <aside className="inspector" aria-label="Properties">
      {body}
    </aside>
  );
}
