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

describe('copy, paste and duplicate', () => {
  function clipKeys(handled: boolean) {
    const k = {
      undo: vi.fn(), redo: vi.fn(), remove: vi.fn(), rotate: vi.fn(), nudge: vi.fn(),
      copy: vi.fn(() => handled), paste: vi.fn(() => handled), duplicate: vi.fn(() => handled),
    };
    renderHook(() => useKeys(k));
    return k;
  }

  test('Ctrl/Cmd+C, V and D call copy, paste and duplicate and stop the browser action', () => {
    const k = clipKeys(true);
    const c = new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(c);
    press('v', { ctrlKey: true });
    const d = new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(d);
    expect([k.copy, k.paste, k.duplicate].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(c.defaultPrevented).toBe(true);
    expect(d.defaultPrevented).toBe(true);
  });

  test('when nothing is copied (no device selected), the browser keeps its own copy', () => {
    clipKeys(false);
    const c = new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(false);
  });

  test('with page text selected (the email in About), Cmd+C copies the text, not the devices', () => {
    const k = clipKeys(true);
    const p = document.createElement('p');
    p.textContent = 'nickfoote@team2102.org';
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const c = new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(c);
    expect(k.copy).not.toHaveBeenCalled();
    expect(c.defaultPrevented).toBe(false);
    window.getSelection()!.removeAllRanges();
    p.remove();
  });

  test('while a dialog is open (About, Share), the editor keys do nothing', () => {
    const k = clipKeys(true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    press('d', { metaKey: true });
    press('v', { metaKey: true });
    press('Delete');
    expect(k.duplicate).not.toHaveBeenCalled();
    expect(k.paste).not.toHaveBeenCalled();
    expect(k.remove).not.toHaveBeenCalled();
    dialog.remove();
  });

  test('in a text field the keys copy and paste text', () => {
    const k = clipKeys(true);
    const input = document.createElement('input');
    document.body.append(input);
    press('c', { metaKey: true }, input);
    press('v', { metaKey: true }, input);
    expect(k.copy).not.toHaveBeenCalled();
    expect(k.paste).not.toHaveBeenCalled();
    input.remove();
  });
});
