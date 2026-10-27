import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inspector } from './Inspector';
import { apply } from '../model/actions';
import { emptyDoc, type Doc } from '../model/types';
import { catalog } from '../test/fixtures';

function doc(): Doc {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'talon-fxs', name: '', x: 200, y: 0 });
  return apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'vbat_pos' } });
}

test('a device name and CAN ID commit when the field loses focus', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d2']} dispatch={dispatch} />);
  await userEvent.type(screen.getByLabelText('Name'), 'Shooter');
  await userEvent.tab();
  expect(dispatch).toHaveBeenCalledWith({ type: 'updateDevice', id: 'd2', patch: { name: 'Shooter' } });
  await userEvent.type(screen.getByLabelText('CAN ID'), '12');
  await userEvent.tab();
  expect(dispatch).toHaveBeenCalledWith({ type: 'updateDevice', id: 'd2', patch: { canId: 12 } });
});

test('an empty CAN ID clears it', async () => {
  const dispatch = vi.fn();
  const d = apply(doc(), { type: 'updateDevice', id: 'd2', patch: { canId: 5 } });
  render(<Inspector doc={d} catalog={catalog} selection={['d2']} dispatch={dispatch} />);
  await userEvent.clear(screen.getByLabelText('CAN ID'));
  await userEvent.tab();
  expect(dispatch).toHaveBeenCalledWith({ type: 'updateDevice', id: 'd2', patch: { canId: null } });
});

test('a device shows its PDH channel from the wires', () => {
  render(<Inspector doc={doc()} catalog={catalog} selection={['d2']} dispatch={() => {}} />);
  expect(screen.getByText('PDH 4')).toBeInTheDocument();
});

test('Reset route clears the bends of the selected wire', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['w1']} dispatch={dispatch} />);
  expect(screen.getByRole('heading', { name: 'Power wire' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Reset route' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'setBends', id: 'w1', bends: [] });
});

test('Delete removes the whole selection', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d1', 'd2']} dispatch={dispatch} />);
  expect(screen.getByRole('heading', { name: '2 selected' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'delete', ids: ['d1', 'd2'] });
});
