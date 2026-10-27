/** The next free id with this prefix: one above the highest `<prefix><n>` in use. */
export function nextId(prefix: 'd' | 'w', used: { id: string }[]): string {
  let max = 0;
  for (const { id } of used) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}
