import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Gallery } from './Gallery';
import * as download from '../export/download';
import * as usage from '../usage/track';

const index = readFileSync(join(import.meta.dirname, '../../public/icons/index.json'), 'utf8');
const total = (JSON.parse(index) as { icons: unknown[] }).icons.length;

beforeEach(() => {
  window.history.replaceState(null, '', '/gallery');
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    new Response(url.endsWith('index.json') ? index : `<svg>${url}</svg>`, { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('every icon type has a section, and each icon a Download SVG link', async () => {
  render(<Gallery />);
  expect(await screen.findByRole('heading', { name: 'FRC device icons' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 2, name: 'Power' })).toBeTruthy();
  const pdh = screen.getByRole('link', { name: 'Download SVG of Power Distribution Hub (PDH)' });
  expect(pdh.getAttribute('href')).toBe('icons/power/rev/rev-pdh.svg');
  expect(pdh.getAttribute('download')).toBe('rev-pdh.svg');
});

test('a Download SVG link counts one icon download, on the card and in the large view', async () => {
  const count = vi.spyOn(usage, 'track').mockImplementation(() => {});
  render(<Gallery />);
  const link = await screen.findByRole('link', { name: 'Download SVG of Power Distribution Hub (PDH)' });
  link.addEventListener('click', (e) => e.preventDefault());
  await userEvent.click(link);
  expect(count).toHaveBeenCalledTimes(1);
  expect(count).toHaveBeenCalledWith('icon');
  await userEvent.click(screen.getByRole('button', { name: /Power Distribution Hub \(PDH\)/ }));
  const big = within(await screen.findByRole('dialog')).getByRole('link', { name: 'Download SVG of Power Distribution Hub (PDH)' });
  big.addEventListener('click', (e) => e.preventDefault());
  await userEvent.click(big);
  expect(count).toHaveBeenCalledTimes(2);
});

test('a search narrows the list and offers a ZIP of just those icons', async () => {
  render(<Gallery />);
  const box = await screen.findByRole('searchbox', { name: 'Search icons' });
  await userEvent.type(box, 'kraken');
  expect(screen.getByRole('status').textContent).toMatch(new RegExp(`^\\d+ of ${total} icons$`));
  expect(screen.queryByRole('heading', { level: 2, name: 'Power' })).toBeNull();
  expect(screen.getByRole('button', { name: /^Download the \d+ shown \(ZIP\)$/ })).toBeTruthy();
  expect(window.location.search).toBe('?q=kraken');
});

test('a group ZIP fetches the license and that group\'s icons, and downloads one file', async () => {
  const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
  render(<Gallery />);
  const section = (await screen.findByRole('heading', { level: 2, name: 'Power' })).closest('section')!;
  await userEvent.click(within(section).getByRole('button', { name: /^Download Power \(\d+, ZIP\)$/ }));
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][1]).toBe('frc-device-icons-power.zip');
  const asked = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
  expect(asked).toContain('icons/LICENSE.md');
  expect(asked).toContain('icons/power/rev/rev-pdh.svg');
  expect(asked).not.toContain('icons/motors/ctre/falcon-500.svg');
});

test('Download all names its count and includes index.json', async () => {
  const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
  const count = vi.spyOn(usage, 'track').mockImplementation(() => {});
  render(<Gallery />);
  await userEvent.click(await screen.findByRole('button', { name: `Download all (${total} icons, ZIP)` }));
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][1]).toBe('frc-device-icons.zip');
  expect(count).toHaveBeenCalledTimes(1);
  expect(count).toHaveBeenCalledWith('icon');
  const asked = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
  expect(asked.filter((u) => u.endsWith('.svg')).length).toBe(total);
});

test('grouping by vendor makes vendor sections and keeps it in the URL', async () => {
  render(<Gallery />);
  await userEvent.click(await screen.findByRole('button', { name: 'Vendor' }));
  expect(screen.getByRole('heading', { level: 2, name: 'REV Robotics' })).toBeTruthy();
  expect(window.location.search).toBe('?by=vendor');
});

test('a card opens the large view with the full description', async () => {
  render(<Gallery />);
  await userEvent.click(await screen.findByRole('button', { name: 'Enlarge the Battery (6AWG - SB50) drawing' }));
  const dialog = screen.getByRole('dialog', { hidden: true });
  expect(within(dialog).getByText(/18 Ah sealed lead-acid/)).toBeTruthy();
  expect(window.location.search).toBe('?icon=frc-battery');
});
