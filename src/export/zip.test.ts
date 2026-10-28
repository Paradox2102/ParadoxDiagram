import { crc32, zipFiles } from './zip';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Read a stored ZIP back through its central directory, as an unzip tool does. */
function unzip(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const files = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, dec.decode(data));
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return files;
}

test('crc32 matches the standard check value', () => {
  expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array())).toBe(0);
});

test('files come back out of the ZIP with their paths and text', () => {
  const zip = zipFiles([
    { path: 'icons/LICENSE.md', data: enc.encode('CC0 1.0') },
    { path: 'icons/power/rev/rev-pdh.svg', data: enc.encode('<svg/>') },
    { path: 'icons/ñame.txt', data: enc.encode('UTF-8 name') },
  ]);
  expect([...unzip(zip)]).toEqual([
    ['icons/LICENSE.md', 'CC0 1.0'],
    ['icons/power/rev/rev-pdh.svg', '<svg/>'],
    ['icons/ñame.txt', 'UTF-8 name'],
  ]);
});

test('the same files always make the same bytes', () => {
  const files = () => [{ path: 'a.svg', data: enc.encode('<svg/>') }];
  expect(zipFiles(files())).toEqual(zipFiles(files()));
});

test('an empty ZIP is only the end record', () => {
  expect(zipFiles([]).length).toBe(22);
});
