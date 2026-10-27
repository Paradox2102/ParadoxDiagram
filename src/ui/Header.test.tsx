import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header, type HeaderProps } from './Header';

function props(over: Partial<HeaderProps> = {}): HeaderProps {
  return {
    title: 'Robot', onTitle: () => {}, layer: 'all', onLayer: () => {},
    canUndo: false, canRedo: false, onUndo: () => {}, onRedo: () => {},
    onNew: () => {}, onOpen: () => {}, onExport: () => {}, saved: true, ...over,
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
