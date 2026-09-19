// Cheap pseudo curl-noise field (layered sinusoids — no external noise dependency) used to
// advect sparkle particles. Returns a direction in radians for position (x, y) at time t (ms).
export function flowAngle(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.006 + t * 0.00035) * 1.6 +
    Math.cos(y * 0.005 - t * 0.00028) * 1.6 +
    Math.sin((x + y) * 0.003 + t * 0.0002)
  );
}
