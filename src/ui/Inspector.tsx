// The right panel: properties of the selected device or wire.
import { useState } from 'react';
import type { Catalog } from '../catalog/catalog';
import type { Action } from '../model/actions';
import { deviceTag } from '../model/tags';
import type { Device, Doc, PortRef, Wire } from '../model/types';

interface Props {
  doc: Doc;
  catalog: Catalog | null;
  selection: string[];
  dispatch: (a: Action) => void;
}

const LAYER_NAME = { power: 'Power', can: 'CAN', network: 'Network', air: 'Air' } as const;

/** A text field that commits on blur or Enter, so one edit is one undo step. */
function Field(props: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: 'numeric';
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(props.value);
  const commit = () => {
    if (text !== props.value) props.onCommit(text);
  };
  const common = {
    value: text,
    placeholder: props.placeholder,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: commit,
  };
  return (
    <label>
      {props.label}
      {props.multiline ? (
        <textarea {...common} />
      ) : (
        <input
          {...common} inputMode={props.inputMode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setText(props.value);
          }}
        />
      )}
    </label>
  );
}

function DeviceForm({ doc, catalog, device, dispatch }: { doc: Doc; catalog: Catalog | null; device: Device; dispatch: Props['dispatch'] }) {
  const icon = catalog?.bySlug.get(device.slug);
  const tag = deviceTag(doc, device.id, catalog);
  const update = (patch: Partial<Pick<Device, 'name' | 'canId' | 'notes'>>) =>
    dispatch({ type: 'updateDevice', id: device.id, patch });
  return (
    <>
      <h2>{tag.name}</h2>
      <p className="sub">
        {icon ? `${icon.name} · ${icon.vendor_name}` : `Unknown icon ${device.slug}`}
      </p>
      {tag.facts && <p className="sub mono">{tag.facts}</p>}
      <Field label="Name" value={device.name} placeholder={icon?.name} onCommit={(v) => update({ name: v })} />
      <Field
        label="CAN ID" value={device.canId === null ? '' : String(device.canId)} inputMode="numeric"
        onCommit={(v) => {
          const t = v.trim();
          if (!t) return update({ canId: null });
          const n = Number(t);
          if (Number.isInteger(n) && n >= 0) update({ canId: n });
        }}
      />
      <Field label="Notes" value={device.notes} multiline onCommit={(v) => update({ notes: v })} />
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
        <button type="button" onClick={() => dispatch({ type: 'rotateDevices', ids: [device.id] })}>Rotate 90°</button>
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
      <Field label="Note" value={wire.note} multiline onCommit={(v) => dispatch({ type: 'updateWire', id: wire.id, patch: { note: v } })} />
      <div className="row">
        <button type="button" onClick={() => dispatch({ type: 'setBends', id: wire.id, bends: [] })}>Reset route</button>
        <button type="button" className="danger" onClick={() => dispatch({ type: 'delete', ids: [wire.id] })}>Delete</button>
      </div>
    </>
  );
}

function Help() {
  return (
    <>
      <h2>Build a diagram</h2>
      <div className="help">
        <p>Drag a device from the list, or click it. Hover a device to see its ports, then drag from a port to a port of the same layer to draw a wire.</p>
        <p>
          Select a wire to drag its segments or bends. Double-click a segment to add a bend, a bend to remove it.
        </p>
        <p>
          <kbd>R</kbd> rotate · <kbd>Del</kbd> delete · <kbd>Space</kbd>+drag pan · wheel zoom · <kbd>⌘Z</kbd> undo
        </p>
        <p>The layout is kept in this browser. Export JSON to keep a copy or move it to another computer.</p>
      </div>
      <p className="about">
        Device icons: the FRC device icon collection by FRC Team 2102 Paradox, CC0 1.0 (public domain).
      </p>
    </>
  );
}

export function Inspector({ doc, catalog, selection, dispatch }: Props) {
  const live = selection.filter((id) => doc.devices.some((d) => d.id === id) || doc.wires.some((w) => w.id === id));
  let body;
  if (live.length === 0) body = <Help />;
  else if (live.length > 1) {
    body = (
      <>
        <h2>{live.length} selected</h2>
        <div className="row">
          <button type="button" onClick={() => dispatch({ type: 'rotateDevices', ids: live })}>Rotate 90°</button>
          <button type="button" className="danger" onClick={() => dispatch({ type: 'delete', ids: live })}>Delete</button>
        </div>
      </>
    );
  } else {
    const device = doc.devices.find((d) => d.id === live[0]);
    const wire = doc.wires.find((w) => w.id === live[0]);
    // key: a new selection, or an undo that changes the values, starts the fields fresh
    if (device) body = <DeviceForm key={`${device.id}:${device.name}:${device.canId}:${device.notes}`} doc={doc} catalog={catalog} device={device} dispatch={dispatch} />;
    else if (wire) body = <WireForm key={`${wire.id}:${wire.note}`} doc={doc} catalog={catalog} wire={wire} dispatch={dispatch} />;
  }
  return (
    <aside className="inspector" aria-label="Properties">
      {body}
    </aside>
  );
}
