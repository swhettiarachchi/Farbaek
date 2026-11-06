/** Whether `latest` is newer than `current`, for versions like 0.10.0. Anything unreadable isn't newer, so nobody is nagged by mistake. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => (/^\d+(\.\d+){1,3}$/.test(v) ? v.split(".").map(Number) : null);
  const [a, b] = [parse(latest), parse(current)];
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (x !== y) return x > y;
  }
  return false;
}
