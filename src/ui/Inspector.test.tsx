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
  expect(dispatch).toHaveBeenCalledWith({ type: 'resetRoute', id: 'w1' });
});

test('Delete removes the whole selection', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d1', 'd2']} dispatch={dispatch} />);
  expect(screen.getByRole('heading', { name: '2 selected' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'delete', ids: ['d1', 'd2'] });
});

test('a name typed and not yet blurred is kept when the selection changes', async () => {
  const dispatch = vi.fn();
  const d = doc();
  const { rerender } = render(<Inspector doc={d} catalog={catalog} selection={['d2']} dispatch={dispatch} />);
  await userEvent.type(screen.getByLabelText('Name'), 'Front Left');
  rerender(<Inspector doc={d} catalog={catalog} selection={[]} dispatch={dispatch} />);
  expect(dispatch).toHaveBeenCalledWith({ type: 'updateDevice', id: 'd2', patch: { name: 'Front Left' } });
  expect(dispatch).toHaveBeenCalledTimes(1);
});

test('Show label switches one device label off', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d2']} dispatch={dispatch} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Show label' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'setTagHidden', ids: ['d2'], hidden: true });
});

test('a multi-selection can hide all its labels', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d1', 'd2', 'w1']} dispatch={dispatch} />);
  await userEvent.click(screen.getByRole('button', { name: 'Hide labels' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'setTagHidden', ids: ['d1', 'd2'], hidden: true });
});

describe('several devices selected', () => {
  const moveOf = (dispatch: ReturnType<typeof vi.fn>, id: string) =>
    dispatch.mock.calls.map((c) => c[0]).find((a) => a.type === 'moveEach')?.moves.find((m: { id: string }) => m.id === id);

  test('Align left lines the left edges up in one step', async () => {
    const dispatch = vi.fn();
    render(<Inspector doc={doc()} catalog={catalog} selection={['d1', 'd2']} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Align left' }));
    expect(moveOf(dispatch, 'd2')).toEqual({ id: 'd2', dx: -200, dy: 0 });
  });

  test('a set gap packs the devices across from the first one', async () => {
    const dispatch = vi.fn();
    render(<Inspector doc={doc()} catalog={catalog} selection={['d1', 'd2']} dispatch={dispatch} />);
    await userEvent.clear(screen.getByLabelText('Gap (mm)'));
    await userEvent.type(screen.getByLabelText('Gap (mm)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Set gap across' }));
    // the PDH is 131 mm wide, so the Talon's left edge goes to 141
    expect(moveOf(dispatch, 'd2')).toEqual({ id: 'd2', dx: -59, dy: 0 });
  });

  test('even spacing needs three devices', () => {
    render(<Inspector doc={doc()} catalog={catalog} selection={['d1', 'd2']} dispatch={() => {}} />);
    expect(screen.getByRole('button', { name: 'Space evenly across' })).toBeDisabled();
  });
});

test('each wire end can be set to leave by a side, or back to Auto', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['w1']} dispatch={dispatch} />);
  await userEvent.click(screen.getByRole('button', { name: 'From end leaves down' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'setWireSide', id: 'w1', end: 'from', side: 'down' });
  expect(screen.getByRole('button', { name: 'To end leaves automatically' })).toHaveAttribute('aria-pressed', 'true');
});

test('a device shows its icon description under the short name', () => {
  const d = apply(emptyDoc(), { type: 'addDevice', slug: 'frc-battery', name: '', x: 0, y: 0 });
  render(<Inspector doc={d} catalog={catalog} selection={['d1']} dispatch={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Battery (6AWG - SB50)' })).toBeTruthy();
  expect(screen.getByText(/12 V 18 Ah sealed lead-acid/)).toBeTruthy();
});
