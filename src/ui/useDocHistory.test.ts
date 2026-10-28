import { act, renderHook } from '@testing-library/react';
import { useDocHistory } from './useDocHistory';
import { apply } from '../model/actions';
import { emptyDoc } from '../model/types';

test('a drag previews many documents and leaves one undo step', () => {
  const start = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: '', x: 0, y: 0 });
  const { result } = renderHook(() => useDocHistory(start));
  let base = start;
  act(() => { base = result.current.begin(); });
  for (const dx of [5, 10, 15]) {
    act(() => result.current.preview(apply(base, { type: 'moveDevices', ids: ['d1'], dx, dy: 0 })));
  }
  act(() => result.current.end(base));
  expect(result.current.doc.devices[0].x).toBe(15);
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(result.current.doc).toBe(start);
  expect(result.current.canUndo).toBe(false);
});

test('a gesture that changed nothing adds no undo step', () => {
  const { result } = renderHook(() => useDocHistory(emptyDoc()));
  act(() => {
    const base = result.current.begin();
    result.current.end(base);
  });
  expect(result.current.canUndo).toBe(false);
});

test('change commits and redo comes back after undo', () => {
  const { result } = renderHook(() => useDocHistory(emptyDoc()));
  act(() => result.current.change({ type: 'setTitle', title: 'A' }));
  act(() => result.current.undo());
  expect(result.current.doc.title).toBe('Untitled diagram');
  act(() => result.current.redo());
  expect(result.current.doc.title).toBe('A');
});

test('begin right after change returns the changed document', () => {
  const { result } = renderHook(() => useDocHistory(emptyDoc()));
  let base = emptyDoc();
  act(() => {
    result.current.change({ type: 'setTitle', title: 'Typed' });
    base = result.current.begin();
  });
  expect(base.title).toBe('Typed');
});

test('a lazy first document is built once, not on every render', () => {
  const init = vi.fn(emptyDoc);
  const { result, rerender } = renderHook(() => useDocHistory(init));
  rerender();
  act(() => result.current.change({ type: 'setTitle', title: 'x' }));
  rerender();
  expect(init).toHaveBeenCalledTimes(1);
});

describe('live mode', () => {
  const start = () => {
    let d = apply(emptyDoc(), { type: 'addDevice', id: 'a', slug: 'rev-pdh', name: 'A', x: 0, y: 0 });
    return apply(d, { type: 'addDevice', id: 'b', slug: 'rev-pdh', name: 'B', x: 300, y: 0 });
  };
  const rename = (d: ReturnType<typeof start>, id: string, name: string) => apply(d, { type: 'updateDevice', id, patch: { name } });

  test('onLocal gets each local change and not remote ones', () => {
    const onLocal = vi.fn();
    const s = start();
    const { result } = renderHook(() => useDocHistory(s, { onLocal }));
    act(() => result.current.change({ type: 'setTitle', title: 'T' }));
    expect(onLocal).toHaveBeenCalledTimes(1);
    expect(onLocal.mock.calls[0][0]).toBe(s);
    expect(onLocal.mock.calls[0][1].title).toBe('T');
    act(() => result.current.remote(rename(result.current.doc, 'b', 'AI')));
    expect(onLocal).toHaveBeenCalledTimes(1);
    expect(result.current.doc.devices[1].name).toBe('AI');
  });

  test('remote during a gesture waits for end and keeps the drag', () => {
    const onLocal = vi.fn();
    const { result } = renderHook(() => useDocHistory(start(), { onLocal }));
    act(() => result.current.setLive(true));
    let base = start();
    act(() => { base = result.current.begin(); });
    act(() => result.current.preview(apply(base, { type: 'moveDevices', ids: ['a'], dx: 50, dy: 0 })));
    act(() => result.current.remote(rename(base, 'b', 'AI')));
    expect(result.current.doc.devices[1].name).toBe('B');
    expect(result.current.doc.devices[0].x).toBe(50);
    act(() => result.current.end(base));
    expect(result.current.doc.devices[0].x).toBe(50);
    expect(result.current.doc.devices[1].name).toBe('AI');
    expect(onLocal).toHaveBeenCalledTimes(1);
    expect(onLocal.mock.calls[0][1].devices[0].x).toBe(50);
  });

  test('live undo reverses only the local step', () => {
    const onLocal = vi.fn();
    const { result } = renderHook(() => useDocHistory(start(), { onLocal }));
    act(() => result.current.setLive(true));
    act(() => result.current.change({ type: 'moveDevices', ids: ['a'], dx: 50, dy: 0 }));
    act(() => result.current.remote(rename(result.current.doc, 'b', 'AI')));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.doc.devices[0].x).toBe(0);
    expect(result.current.doc.devices[1].name).toBe('AI');
    expect(onLocal).toHaveBeenCalledTimes(2);
    expect(onLocal.mock.calls[1][1].devices[0].x).toBe(0);
  });

  test('live redo', () => {
    const { result } = renderHook(() => useDocHistory(start()));
    act(() => result.current.setLive(true));
    act(() => result.current.change({ type: 'moveDevices', ids: ['a'], dx: 50, dy: 0 }));
    act(() => result.current.remote(rename(result.current.doc, 'b', 'AI')));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.doc.devices[0].x).toBe(50);
    expect(result.current.doc.devices[1].name).toBe('AI');
  });

  test('setLive clears the stacks', () => {
    const { result } = renderHook(() => useDocHistory(start()));
    act(() => result.current.change({ type: 'setTitle', title: 'T' }));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.setLive(true));
    expect(result.current.live).toBe(true);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.change({ type: 'setTitle', title: 'U' }));
    act(() => result.current.setLive(false));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.doc.title).toBe('U');
  });
});
