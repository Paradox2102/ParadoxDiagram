// The device table: one CSV row per device with its CAN bus, CAN ID, power channel, fuse, gauge, IP, notes and
// custom fields, for code constants and a sheet taped inside the robot. Excel and Google Sheets open it.
import type { Catalog } from '../catalog/catalog';
import { busOf, canivoreBus } from '../model/canbus';
import { deviceTag, powerFeeds } from '../model/tags';
import type { Doc } from '../model/types';

const HEADER = ['Name', 'Device', 'Vendor', 'CAN bus', 'CAN ID', 'Power from', 'Fuse (A)', 'Wire (AWG)', 'IP', 'Notes'];

/** One CSV cell: quoted when it holds a comma, a quote or a line break (RFC 4180). */
const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function deviceTableCsv(doc: Doc, catalog: Catalog | null): string {
  const fieldLabels = [...new Set(doc.devices.flatMap((d) => (d.fields ?? []).map((f) => f.label)))];
  const rows = doc.devices.map((d) => {
    const icon = catalog?.bySlug.get(d.slug);
    const bus = d.slug === 'canivore' ? canivoreBus(doc, d.id) : busOf(doc, catalog, d.id);
    const feeds = powerFeeds(doc, catalog, d.id);
    const first = feeds[0]?.channels[0];
    const cells = [
      deviceTag(doc, d.id, catalog).name, icon?.name ?? d.slug, icon?.vendor_name ?? '', bus ?? '',
      d.canId === null ? '' : String(d.canId),
      feeds.map((f) => `${f.feeder} ${f.channels.map((c) => c.channel).join('/')}`).join('; '),
      first?.fuseA === undefined ? '' : String(first.fuseA), first?.awg === undefined ? '' : String(first.awg),
      d.ip ?? '', d.notes,
      ...fieldLabels.map((label) => d.fields?.find((f) => f.label === label)?.value ?? ''),
    ];
    return { bus, canId: d.canId, name: cells[0], cells };
  });
  // CAN devices by bus (no bus found after the named buses), then ID; devices with no CAN ID last, by name
  rows.sort((a, b) =>
    Number(a.canId === null) - Number(b.canId === null) ||
    Number(a.bus === null) - Number(b.bus === null) ||
    (a.bus ?? '').localeCompare(b.bus ?? '', undefined, { numeric: true }) ||
    (a.canId ?? 0) - (b.canId ?? 0) ||
    a.name.localeCompare(b.name));
  const lines = [[...HEADER, ...fieldLabels], ...rows.map((r) => r.cells)].map((r) => r.map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
