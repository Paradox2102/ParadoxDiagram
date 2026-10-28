import { markOutline } from './iconText';

test('the first stroked shape is marked as the outline, once', () => {
  const body = '<title>x</title><rect x="0" fill="#3a3f47"/><rect x="1" fill="#3a3f47" stroke="#1f2328"/><circle r="2" stroke="#1f2328"/>';
  expect(markOutline(body)).toBe(
    '<title>x</title><rect x="0" fill="#3a3f47"/><rect class="device-outline" x="1" fill="#3a3f47" stroke="#1f2328"/><circle r="2" stroke="#1f2328"/>',
  );
  expect(markOutline('<text>no shapes</text>')).toBe('<text>no shapes</text>');
});
