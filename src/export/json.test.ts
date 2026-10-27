import { docToJson, fileBase } from './json';
import { emptyDoc } from '../model/types';

test('file names keep letters, digits, space, _ and -', () => {
  expect(fileBase('My robot: v2!')).toBe('My robot- v2-');
  expect(fileBase('   ')).toBe('diagram');
});

test('JSON export is the document with 2-space indent', () => {
  const text = docToJson(emptyDoc());
  expect(JSON.parse(text)).toEqual(emptyDoc());
  expect(text).toContain('\n  "format": "paradox-diagram"');
});
