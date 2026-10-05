// Small Poisson helpers used by the projection model.

function pmfSeries(lambda: number): number[] {
  const max = Math.ceil(lambda + 10 * Math.sqrt(lambda) + 15);
  const out: number[] = new Array(max + 1);
  let p = Math.exp(-lambda);
  out[0] = p;
  for (let k = 1; k <= max; k++) {
    p = (p * lambda) / k;
    out[k] = p;
  }
  return out;
}

/** P(X = 0) for X ~ Poisson(lambda). */
export function pZero(lambda: number): number {
  return Math.exp(-Math.max(0, lambda));
}

/** P(X >= t) for X ~ Poisson(lambda). */
export function pAtLeast(lambda: number, t: number): number {
  if (t <= 0) return 1;
  if (lambda <= 0) return 0;
  const pmf = pmfSeries(lambda);
  let below = 0;
  for (let k = 0; k < t && k < pmf.length; k++) below += pmf[k];
  return Math.min(1, Math.max(0, 1 - below));
}

/** E[floor(X / d)] for X ~ Poisson(lambda) — e.g. points for "every 3 saves" or "every 2 goals conceded". */
export function expectedFloorDiv(lambda: number, d: number): number {
  if (lambda <= 0) return 0;
  const pmf = pmfSeries(lambda);
  let e = 0;
  for (let k = d; k < pmf.length; k++) e += Math.floor(k / d) * pmf[k];
  return e;
}
