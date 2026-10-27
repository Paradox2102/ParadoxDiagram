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
