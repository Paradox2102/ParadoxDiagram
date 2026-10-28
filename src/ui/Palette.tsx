// The icon list: search, grouped by type, drag or click to add a device.
import { useMemo, useState } from 'react';
import { searchIcons, type Catalog } from '../catalog/catalog';

export const SLUG_MIME = 'application/x-paradox-slug';

interface Props {
  catalog: Catalog | null;
  error: string | null;
  onAdd: (slug: string) => void;
}

export function Palette({ catalog, error, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [legacy, setLegacy] = useState(false);
  const groups = useMemo(() => {
    if (!catalog) return [];
    const hits = searchIcons(catalog.icons, query, legacy);
    return catalog.types
      .map((t) => ({ type: t, icons: hits.filter((i) => i.type === t.id) }))
      .filter((g) => g.icons.length);
  }, [catalog, query, legacy]);

  return (
    <aside className="palette" aria-label="Devices">
      <div className="palette-tools">
        <input
          type="search" placeholder="Search devices" aria-label="Search devices"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} />
          Show legacy
        </label>
      </div>
      {error && <p role="alert" className="palette-error">{error}</p>}
      <div className="palette-list">
        {catalog && !groups.length && <p className="palette-empty">No device matches “{query}”.</p>}
        {groups.map(({ type, icons }) => (
          <section key={type.id}>
            <h2>{type.name}</h2>
            <ul>
              {icons.map((i) => (
                <li key={i.slug}>
                  <button
                    type="button" draggable title={`${i.description ?? i.name}: click to add, or drag onto the diagram`}
                    onClick={() => onAdd(i.slug)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(SLUG_MIME, i.slug);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <img src={`./icons/${i.path}`} alt="" loading="lazy" draggable={false} />
                    <span className="palette-name">{i.name}</span>
                    <span className="palette-vendor">
                      {i.vendor_name}
                      {i.status === 'legacy' && <em> · legacy</em>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
