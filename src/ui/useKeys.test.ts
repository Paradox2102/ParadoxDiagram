import { renderHook } from '@testing-library/react';
import { useKeys } from './useKeys';

function keys() {
  const k = { undo: vi.fn(), redo: vi.fn(), remove: vi.fn(), rotate: vi.fn(), nudge: vi.fn() };
  renderHook(() => useKeys(k));
  return k;
}
const press = (key: string, opts: KeyboardEventInit = {}, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));

test('arrow keys nudge 1 mm, and 5 mm with Shift', () => {
  const k = keys();
  press('ArrowRight');
  press('ArrowUp', { shiftKey: true });
  expect(k.nudge.mock.calls).toEqual([[1, 0], [0, -5]]);
});

test('arrow keys in a text field move the cursor, not the devices', () => {
  const k = keys();
  const input = document.createElement('input');
  document.body.append(input);
  press('ArrowLeft', {}, input);
  expect(k.nudge).not.toHaveBeenCalled();
  input.remove();
});
