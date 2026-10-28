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

test('the label side buttons move the label of the selected devices', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d2']} dispatch={dispatch} />);
  expect(screen.getByRole('button', { name: 'Label bottom' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Label left' }).textContent).toBe('←');
  await userEvent.click(screen.getByRole('button', { name: 'Label left' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'setTagSide', ids: ['d2'], side: 'left' });
});

test('the rotate button is an arrow icon named for screen readers', async () => {
  const dispatch = vi.fn();
  render(<Inspector doc={doc()} catalog={catalog} selection={['d2']} dispatch={dispatch} />);
  const rotate = screen.getByRole('button', { name: 'Rotate 90°' });
  expect(rotate.textContent).toBe('');
  expect(rotate.querySelector('svg')).not.toBeNull();
  await userEvent.click(rotate);
  expect(dispatch).toHaveBeenCalledWith({ type: 'rotateDevices', ids: ['d2'] });
});

describe('new fields', () => {
  function rig(): Doc {
    let d = emptyDoc();
    for (const [id, slug] of [['sc', 'systemcore'], ['radio', 'vh-109'], ['m', 'kraken-x60-powerpole'], ['pdh', 'rev-pdh']]) {
      d = apply(d, { type: 'addDevice', id, slug, name: '', x: 0, y: 0 });
    }
    d = apply(d, { type: 'addWire', id: 'can1', layer: 'can', from: { device: 'sc', port: 'can_s1' }, to: { device: 'm', port: 'can_a' } });
    return apply(d, { type: 'addWire', id: 'p1', layer: 'power', from: { device: 'pdh', port: 'ch4' }, to: { device: 'm', port: 'power' } });
  }

  test('IP shows for a radio and not for a motor', () => {
    const { unmount } = render(<Inspector doc={rig()} catalog={catalog} selection={['radio']} dispatch={() => {}} />);
    expect(screen.getByLabelText('IP address')).toBeInTheDocument();
    unmount();
    render(<Inspector doc={rig()} catalog={catalog} selection={['m']} dispatch={() => {}} />);
    expect(screen.queryByLabelText('IP address')).toBeNull();
  });

  test('a good IP commits and a bad IP is not saved and shows the hint', async () => {
    const dispatch = vi.fn();
    render(<Inspector doc={rig()} catalog={catalog} selection={['radio']} dispatch={dispatch} />);
    const ip = screen.getByLabelText('IP address');
    await userEvent.type(ip, '10.21.2');
    await userEvent.tab();
    expect(dispatch).not.toHaveBeenCalled();
    expect(ip).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use 10.TE.AM.x or DHCP')).toBeInTheDocument();
    await userEvent.type(ip, '.1');
    await userEvent.tab();
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateDevice', id: 'radio', patch: { ip: '10.21.2.1' } });
  });

  test('the CAN bus placeholder shows the found bus', () => {
    render(<Inspector doc={rig()} catalog={catalog} selection={['m']} dispatch={() => {}} />);
    expect(screen.getByLabelText('CAN bus')).toHaveAttribute('placeholder', 'S1');
  });

  test('add, edit and remove a custom field', async () => {
    const dispatch = vi.fn();
    const { rerender } = render(<Inspector doc={rig()} catalog={catalog} selection={['m']} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateDevice', id: 'm', patch: { fields: [{ label: 'Field', value: '' }] } });
    const d = apply(rig(), dispatch.mock.lastCall![0]);
    rerender(<Inspector doc={d} catalog={catalog} selection={['m']} dispatch={dispatch} />);
    await userEvent.type(screen.getByLabelText('Value of field 1'), '25.1');
    await userEvent.tab();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateDevice', id: 'm', patch: { fields: [{ label: 'Field', value: '25.1' }] } });
    await userEvent.click(screen.getByRole('button', { name: 'Remove field Field' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateDevice', id: 'm', patch: { fields: null } });
  });

  test('On label sets onLabel', async () => {
    const dispatch = vi.fn();
    const d = apply(rig(), { type: 'updateDevice', id: 'm', patch: { fields: [{ label: 'Gear', value: '9:1' }] } });
    render(<Inspector doc={d} catalog={catalog} selection={['m']} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show Gear on the label' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateDevice', id: 'm', patch: { fields: [{ label: 'Gear', value: '9:1', onLabel: true }] } });
  });

  test('fuse and gauge show only for a power wire, and commit numbers', async () => {
    const dispatch = vi.fn();
    const { unmount } = render(<Inspector doc={rig()} catalog={catalog} selection={['can1']} dispatch={dispatch} />);
    expect(screen.queryByLabelText('Fuse / breaker (A)')).toBeNull();
    unmount();
    render(<Inspector doc={rig()} catalog={catalog} selection={['p1']} dispatch={dispatch} />);
    await userEvent.type(screen.getByLabelText('Fuse / breaker (A)'), '40');
    await userEvent.tab();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateWire', id: 'p1', patch: { fuseA: 40 } });
    await userEvent.type(screen.getByLabelText('Gauge (AWG)'), '12.5');
    await userEvent.tab();
    expect(screen.getByText('A whole number from 4 to 30')).toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
