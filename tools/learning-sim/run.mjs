// LB-B35 CP1 — experiment runner (pre-registered grid). Usage: node run.mjs <outdir> [seeds]
// Deterministic: same seeds => same output. Parallel over candidates via worker_threads.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { candidates } from './policies.mjs';
import { runOne, CHECKPOINTS } from './sim.mjs';

const P_CONST = [0.5, 0.65, 0.75, 0.85, 0.95];
const DECAY = [];
for (const m of [0.5, 2]) for (const sigma of [0.5, 1.0]) for (const G of [1.5, 2.5, 4.0]) DECAY.push({ type: 'decay', m, sigma, G, pNew: 0.5, id: `m${m}_s${sigma}_G${G}` });
const CONST = P_CONST.map((p) => ({ type: 'const', p, id: `p${p}` }));
const ATT = ['A1', 'A2', 'A3'];
const VARIANT = process.env.LB_VARIANT || 'orig';
const UNC = VARIANT === 'floor-uncapped';
const NS = [35, 300];

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

function work(cand, seeds) {
  const cells = [];
  const acc = { maxInterval: 0, transK: null, transU: null };
  const add = (m, t) => { if (!m) return t.map((r) => r.slice()); return m.map((r, i) => r.map((v, j) => v + t[i][j])); };
  for (const [kind, models] of [['decay', DECAY], ['const', CONST]]) {
    for (const model of models) for (const att of ATT) for (const N of NS) {
      if (UNC && (att === 'A3' || kind === 'const')) continue;
      if (kind === 'const' && N !== 35) continue;
      const per = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const s = runOne(cand, model, att, N, seed, { variant: VARIANT });
        acc.maxInterval = Math.max(acc.maxInterval, s.maxInterval);
        if (kind === 'const') { acc.transK = add(acc.transK, s.transK); acc.transU = add(acc.transU, s.transU); }
        per.push(s);
      }
      const snap = (d, f) => per.map((s) => f(s.snapshots[d]));
      const out = { cand: cand.id, kind, model: model.id, att, N, seeds };
      for (const d of CHECKPOINTS) {
        out[`K${d}`] = snap(d, (x) => x.K);
        out[`reviews${d}`] = snap(d, (x) => x.reviews);
        out[`rec${d}`] = snap(d, (x) => (x.attended ? x.recovery / x.attended : 0));
        out[`p95_${d}`] = snap(d, (x) => x.p95);
        out[`dueNow${d}`] = snap(d, (x) => x.dueNow);
        out[`intro${d}`] = snap(d, (x) => x.introduced);
        out[`b4p${d}`] = snap(d, (x) => (x.boxes[4] + x.boxes[5]) / N);
        out[`b5p${d}`] = snap(d, (x) => x.boxes[5] / N);
        out[`ret${d}`] = snap(d, (x) => x.retention ?? NaN);
      }
      out.b5Reviews = per.map((s) => s.b5Reviews);
      out.b5CardDays = per.map((s) => s.b5CardDays);
      out.b5Unknown = per.map((s) => s.b5Unknown);
      out.b5Ret = per.map((s) => (s.b5Reviews ? s.b5RetSum / s.b5Reviews : NaN));
      out.knownSame = per.map((s) => s.knownSame);
      out.knownTot = per.map((s) => s.knownTot);
      out.unknownSame = per.map((s) => s.unknownSame);
      out.unknownTot = per.map((s) => s.unknownTot);
      out.drop2 = per.map((s) => s.drop2);
      out.unknownDrops = per.map((s) => s.unknownDrops);
      out.changes = per.map((s) => s.changes);
      out.reversals = per.map((s) => s.reversals);
      out.b5Int = mean(per.map((s) => (s.b5Intervals.length ? mean(s.b5Intervals) : NaN)).filter(Number.isFinite));
      cells.push(out);
    }
  }
  return { cand: cand.id, cells, acc };
}

if (isMainThread) {
  const outdir = process.argv[2]; const seeds = Number(process.argv[3] || 100);
  mkdirSync(outdir, { recursive: true });
  const all = candidates(); const results = []; let next = 0; let active = 0; const t0 = Date.now();
  const MAXW = 7;
  const launch = () => {
    while (active < MAXW && next < all.length) {
      const cand = all[next++]; active++;
      const w = new Worker(new URL(import.meta.url), { workerData: { cand, seeds } });
      w.on('message', (m) => { results.push(m); console.log('done', m.cand, ((Date.now() - t0) / 1000).toFixed(0) + 's'); });
      w.on('error', (e) => { console.error('ERR', cand.id, e); process.exit(1); });
      w.on('exit', () => { active--; if (next >= all.length && active === 0) finish(); else launch(); });
    }
  };
  const finish = () => {
    results.sort((a, b) => a.cand.localeCompare(b.cand));
    writeFileSync(`${outdir}/grid.json`, JSON.stringify({ seeds, checkpoints: CHECKPOINTS, results }));
    console.log('wrote grid.json', results.length, 'candidates');
  };
  launch();
} else {
  parentPort.postMessage(work(workerData.cand, workerData.seeds));
}
