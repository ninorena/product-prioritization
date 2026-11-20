// x: 0 = Harder, 1 = Easier. y: 0 = Less important, 1 = More important.
export function quadrant(p: { x: number; y: number }): string {
  const imp = p.y > 0.5 ? 'More important' : 'Less important';
  const ease = p.x > 0.5 ? 'Easier' : 'Harder';
  return `${imp}, ${ease}`;
}

// No note sits on a line. A value on the middle line moves a little off it.
export function offLine(v: number): number {
  const c = Math.min(0.99, Math.max(0.01, v));
  if (Math.abs(c - 0.5) < 0.01) return c < 0.5 ? 0.49 : 0.51;
  return c;
}
