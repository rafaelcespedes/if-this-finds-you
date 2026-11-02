// Tiny timing log so typing smoothness can be measured: window.__seedhandPerf.report()
type Sample = { name: string; ms: number };
const samples: Sample[] = [];

function time<T>(name: string, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  samples.push({ name, ms: performance.now() - t0 });
  if (samples.length > 400) samples.splice(0, samples.length - 400);
  return out;
}

function report() {
  const by = new Map<string, number[]>();
  for (const s of samples) {
    if (!by.has(s.name)) by.set(s.name, []);
    by.get(s.name)!.push(s.ms);
  }
  const out: Record<string, { n: number; median: number; p95: number; max: number }> = {};
  for (const [k, v] of by) {
    const a = [...v].sort((x, y) => x - y);
    const q = (f: number) => +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(2);
    out[k] = { n: a.length, median: q(0.5), p95: q(0.95), max: +a[a.length - 1].toFixed(2) };
  }
  return out;
}

export const perf = { time, report, samples, clear: () => samples.splice(0) };
(window as unknown as { __seedhandPerf: typeof perf }).__seedhandPerf = perf;
