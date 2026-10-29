import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header, type HeaderProps } from './Header';
import * as usage from '../usage/track';

function props(over: Partial<HeaderProps> = {}): HeaderProps {
  return {
    title: 'Robot', onTitle: () => {}, layer: 'all', onLayer: () => {},
    canUndo: false, canRedo: false, onUndo: () => {}, onRedo: () => {},
    onNew: () => {}, onOpen: () => {}, onExport: () => {}, saved: true,
    labels: true, onLabels: () => {}, onShare: async () => 'https://x.test/#share=abc', problems: [], onPick: () => {}, ...over,
  };
}

test('the active layer button is pressed and a click picks another layer', async () => {
  const onLayer = vi.fn();
  render(<Header {...props({ layer: 'power', onLayer })} />);
  expect(screen.getByRole('button', { name: 'Power' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'CAN' })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'CAN' }));
  expect(onLayer).toHaveBeenCalledWith('can');
});

test('the four layers and All are offered', () => {
  render(<Header {...props()} />);
  for (const name of ['All', 'Power', 'CAN', 'Network', 'Air']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
});

test('the app name and a no-storage note show', () => {
  render(<Header {...props({ saved: false })} />);
  expect(screen.getByText('Paradox Diagram')).toBeInTheDocument();
  expect(screen.getByText('Not saved in this browser')).toBeInTheDocument();
});

test('export offers SVG, PNG 2x, PNG 4x and JSON', async () => {
  const onExport = vi.fn();
  render(<Header {...props({ onExport })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Export' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'PNG 4x' }));
  expect(onExport).toHaveBeenCalledWith('png4');
});

test('the title commits once, on blur', async () => {
  const onTitle = vi.fn();
  render(<Header {...props({ onTitle })} />);
  const box = screen.getByLabelText('Diagram title');
  await userEvent.clear(box);
  await userEvent.type(box, 'Swerve');
  expect(onTitle).not.toHaveBeenCalled();
  await userEvent.tab();
  expect(onTitle).toHaveBeenCalledTimes(1);
  expect(onTitle).toHaveBeenCalledWith('Swerve');
});

test('About shows the icon license', async () => {
  render(<Header {...props()} />);
  await userEvent.click(screen.getByRole('button', { name: 'About' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('CC0 1.0');
});

test('About tells how to request a component, with three ways to ask', async () => {
  render(<Header {...props()} />);
  await userEvent.click(screen.getByRole('button', { name: 'About' }));
  const box = screen.getByRole('dialog');
  expect(box).toHaveTextContent('link to the product page or the documentation');
  expect(screen.getByRole('link', { name: 'nickfoote@team2102.org' })).toHaveAttribute('href', expect.stringMatching(/^mailto:nickfoote@team2102\.org\?subject=/));
  expect(screen.getByRole('link', { name: 'footie' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/www\.chiefdelphi\.com\/new-message\?username=footie/));
  expect(screen.getByRole('link', { name: 'GitHub issue' })).toHaveAttribute('href', 'https://github.com/Paradox2102/ParadoxDiagram/issues/new');
});

test('About says the site saves no identifying information and keeps only daily totals', async () => {
  render(<Header {...props()} />);
  await userEvent.click(screen.getByRole('button', { name: 'About' }));
  const box = screen.getByRole('dialog');
  expect(box).toHaveTextContent('saves no identifying information');
  expect(box).toHaveTextContent('daily totals');
});

test('the Labels switch shows and hides every label', async () => {
  const onLabels = vi.fn();
  render(<Header {...props({ labels: true, onLabels })} />);
  const sw = screen.getByRole('button', { name: 'Labels' });
  expect(sw).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(sw);
  expect(onLabels).toHaveBeenCalledWith(false);
});

test('Share makes a link and shows it with its length', async () => {
  const onShare = vi.fn(async () => 'https://x.test/#share=abc');
  render(<Header {...props({ onShare })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(onShare).toHaveBeenCalled();
  const box = await screen.findByRole('dialog', { name: 'Share link' });
  expect(box).toHaveTextContent('25 characters');
  expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue('https://x.test/#share=abc');
});

test('a failed share shows the error', async () => {
  render(<Header {...props({ onShare: async () => { throw new Error('no CompressionStream'); } })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no CompressionStream');
});

test('Share and each Export kind count one use', async () => {
  const count = vi.spyOn(usage, 'track').mockImplementation(() => {});
  render(<Header {...props()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Share' }));
  await screen.findByRole('dialog', { name: 'Share link' });
  expect(count.mock.calls).toEqual([['share']]);
  count.mockClear();
  const kinds = 4;
  for (let i = 0; i < kinds; i++) {
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(screen.getAllByRole('menuitem')[i]);
  }
  expect(count.mock.calls).toEqual(Array(kinds).fill(['export']));
  count.mockRestore();
});

test('Check shows the count, lists the problems, and a click picks the devices and closes the list', async () => {
  const onPick = vi.fn();
  const problems = [
    { code: 'can-duplicate' as const, message: 'CAN ID 3 is used twice on bus S1: Front left, Front right', ids: ['d1', 'd2'] },
    { code: 'no-power' as const, message: 'Intake has a power port and no power wire', ids: ['d5'] },
  ];
  render(<Header {...props({ problems, onPick })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Check (2)' }));
  const items = screen.getAllByRole('menuitem');
  expect(items.map((i) => i.textContent)).toEqual(problems.map((p) => p.message));
  await userEvent.click(items[0]);
  expect(onPick).toHaveBeenCalledWith(['d1', 'd2']);
  expect(screen.queryByRole('menuitem')).toBeNull();
});

test('Check with no problems says so', async () => {
  render(<Header {...props()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(screen.getByRole('menu')).toHaveTextContent('No problems found.');
});

test('Export offers the device table as CSV', async () => {
  const onExport = vi.fn();
  render(<Header {...props({ onExport })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Export' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Table (CSV)' }));
  expect(onExport).toHaveBeenCalledWith('csv');
});

test('New offers an empty diagram or the example robot', async () => {
  const onNew = vi.fn();
  render(<Header {...props({ onNew })} />);
  await userEvent.click(screen.getByRole('button', { name: 'New' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Example robot' }));
  await userEvent.click(screen.getByRole('button', { name: 'New' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Empty diagram' }));
  expect(onNew.mock.calls).toEqual([['example'], ['empty']]);
});
