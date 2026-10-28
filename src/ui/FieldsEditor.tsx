// The custom fields of a device: label / value rows, each with an "On label" box and a remove button.
import { useState } from 'react';
import type { CustomField } from '../model/types';
import { MAX_FIELDS } from '../model/validate';

/** An input that commits on blur or Enter, like the panel's other fields. */
function RowInput(props: { value: string; label: string; maxLength: number; onCommit: (v: string) => void }) {
  const [text, setText] = useState(props.value);
  const commit = () => {
    if (text !== props.value) props.onCommit(text);
  };
  return (
    <input
      aria-label={props.label} value={text} maxLength={props.maxLength} onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setText(props.value);
      }}
    />
  );
}

export function FieldsEditor({ fields, onChange }: { fields: CustomField[]; onChange: (f: CustomField[] | null) => void }) {
  const set = (i: number, patch: Partial<CustomField>) =>
    onChange(fields.map((f, j) => {
      if (j !== i) return f;
      const next = { ...f, ...patch };
      if (!next.onLabel) delete next.onLabel;
      return next;
    }));
  return (
    <fieldset className="fields-editor">
      <legend>Fields</legend>
      {fields.map((f, i) => (
        <div className="field-row" key={i}>
          <RowInput
            label={`Label of field ${i + 1}`} value={f.label} maxLength={40}
            onCommit={(v) => v.trim() && set(i, { label: v.trim() })}
          />
          <RowInput label={`Value of field ${i + 1}`} value={f.value} maxLength={200} onCommit={(v) => set(i, { value: v })} />
          <label className="check" title="Show this field in the device label">
            <input
              type="checkbox" checked={!!f.onLabel} aria-label={`Show ${f.label} on the label`}
              onChange={(e) => set(i, { onLabel: e.target.checked })}
            />
            On label
          </label>
          <button
            type="button" className="icon" aria-label={`Remove field ${f.label}`} title="Remove this field"
            onClick={() => {
              const rest = fields.filter((_, j) => j !== i);
              onChange(rest.length ? rest : null);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button" disabled={fields.length >= MAX_FIELDS}
        onClick={() => onChange([...fields, { label: 'Field', value: '' }])}
      >
        Add field
      </button>
    </fieldset>
  );
}
