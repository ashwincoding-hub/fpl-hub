export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export const mae = (pred: number[], act: number[]) => mean(pred.map((p, i) => Math.abs(p - act[i])));

export const rmse = (pred: number[], act: number[]) =>
  Math.sqrt(mean(pred.map((p, i) => (p - act[i]) ** 2)));

export const brier = (prob: number[], outcome: boolean[]) =>
  mean(prob.map((p, i) => (p - (outcome[i] ? 1 : 0)) ** 2));

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation (Pearson correlation of average ranks, so ties are handled). */
export function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return NaN;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

/** How many of the predicted top-k are also in the actual top-k (ties in actual count as "in"). */
export function topKOverlap(pred: number[], act: number[], k = 20): number {
  const order = pred.map((p, i) => [p, i] as const).sort((x, y) => y[0] - x[0]);
  const cutoff = [...act].sort((x, y) => y - x)[k - 1] ?? -Infinity;
  return order.slice(0, k).filter(([, i]) => act[i] >= cutoff).length;
}

/** 1-based rank of a value within a list (1 = best), counting strictly higher values. */
export const rankOf = (value: number, all: number[]) => all.filter((x) => x > value).length + 1;
