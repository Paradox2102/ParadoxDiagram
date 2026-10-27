import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Palette } from './Palette';
import { catalog } from '../test/fixtures';
import { parseCatalog } from '../catalog/catalog';

const small = parseCatalog({
  types: catalog.types,
  icons: ['rev-pdh', 'kraken-x60-powerpole', 'ctre-pdp'].map((s) => catalog.bySlug.get(s)),
});

test('groups icons by type and filters on every search word', async () => {
  render(<Palette catalog={small} error={null} onAdd={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Power' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Motors' })).toBeInTheDocument();
  await userEvent.type(screen.getByRole('searchbox'), 'kraken');
  expect(screen.getAllByRole('button', { name: /kraken/i })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /Power Distribution Hub/ })).toBeNull();
});

test('legacy icons show only with Show legacy', async () => {
  render(<Palette catalog={small} error={null} onAdd={() => {}} />);
  expect(screen.queryByRole('button', { name: /Power Distribution Panel/ })).toBeNull();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Show legacy' }));
  expect(screen.getByRole('button', { name: /Power Distribution Panel/ })).toBeInTheDocument();
});

test('a click on an icon adds it', async () => {
  const onAdd = vi.fn();
  render(<Palette catalog={small} error={null} onAdd={onAdd} />);
  await userEvent.click(screen.getByRole('button', { name: /Power Distribution Hub/ }));
  expect(onAdd).toHaveBeenCalledWith('rev-pdh');
});

test('a catalog error shows in the panel', () => {
  render(<Palette catalog={null} error="icons/index.json: HTTP 404" onAdd={() => {}} />);
  expect(screen.getByRole('alert')).toHaveTextContent('icons/index.json: HTTP 404');
});
