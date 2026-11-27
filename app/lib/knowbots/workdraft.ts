/** 规范 JSON（键排序）：比较两份是否一样。 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

export function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}
