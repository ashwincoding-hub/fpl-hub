// Disk cache for raw API/CSV responses (git-ignored `.cache/`), so backtests are fast
// and polite to the FPL servers.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), ".cache");
const USER_AGENT = "fpl-hub/0.1 (personal non-commercial project)";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fresh(file: string, ttlHours: number) {
  try {
    const s = await stat(file);
    return Date.now() - s.mtimeMs < ttlHours * 3600_000;
  } catch {
    return false;
  }
}

export async function cachedText(url: string, key: string, ttlHours: number): Promise<string> {
  const file = path.join(ROOT, key);
  if (await fresh(file, ttlHours)) return readFile(file, "utf8");
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const text = await res.text();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
      return text;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function cachedJson<T>(url: string, key: string, ttlHours: number): Promise<T> {
  const text = await cachedText(url, key, ttlHours);
  if (!text.startsWith("{") && !text.startsWith("[")) {
    throw new Error(`Non-JSON response for ${url} (FPL may be updating)`);
  }
  return JSON.parse(text) as T;
}

/** Run `fn` over items with limited concurrency and a small delay between requests. */
export async function throttledMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  { concurrency = 4, delayMs = 120, label = "" } = {},
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      done++;
      if (label && done % 100 === 0) console.log(`  ${label}: ${done}/${items.length}`);
      await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/** Minimal RFC-4180 CSV parser (handles quoted fields with commas and escaped quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
