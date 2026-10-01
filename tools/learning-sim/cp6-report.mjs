// LB-B35 CP6 — tables from the CP6 grid. Paired (same seeds/attendance/learners) against ENG-DROP; no interpretation.
// Usage: node cp6-report.mjs <grid.json>
import { readFileSync } from 'node:fs';
const grid = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const R = Object.fromEntries(grid.results.map((r) => [r.cand, r]));
const IDS = ['ENG-DROP/G3-180', 'GR-1.8/G3-180', 'GR-2.5/G3-180', 'GR-3/G3-180', 'LAD-B/G3-180'];
const BASE = 'ENG-DROP/G3-180';
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1));
};
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const cells = (id, pred) => R[id].cells.filter(pred);
// per-seed value = mean over the selected cells; returns array over seeds
const perSeed = (id, pred, get) => {
  const cs = cells(id, pred);
  const n = cs[0].seeds;
  return Array.from({ length: n }, (_, s) => mean(cs.map((c) => get(c)[s])));
};
const pair = (id, pred, get) => {
  const a = perSeed(id, pred, get),
    b = perSeed(BASE, pred, get);
  const d = a.map((x, i) => x - b[i]);
  return { m: mean(a), diff: mean(d), half: (1.96 * sd(d)) / Math.sqrt(d.length) };
};
const row = (label, id, pred, get, d = 3) => {
  const p = pair(id, pred, get);
  return id === BASE
    ? `${f(p.m, d)}`
    : `${f(p.m, d)} (Δ ${p.diff >= 0 ? '+' : ''}${f(p.diff, d)} ±${f(p.half, d)})`;
};
const out = [];
const decay = (att, N) => (c) => c.kind === 'decay' && c.att === att && c.N === N;
for (const [att, N] of [
  ['A2', 35],
  ['A1', 35],
  ['A3', 35],
  ['A2', 300],
]) {
  out.push(
    `\n#### Decay model, attendance ${att}, N=${N}: mean over the 12 learner models x 100 seeds; Δ vs ENG-DROP with 95% CI (paired)\n`,
  );
  out.push(
    '| candidate | K90 | K180 | K365 | reviews d90 | reviews d365 | recovery share d365 | Box4+ d365 | Box5 d365 | mean retention at review d365 | due-but-unserved d365 |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const id of IDS) {
    const P = decay(att, N);
    out.push(
      `| ${id.replace('/G3-180', '')} | ${row('', id, P, (c) => c.K90)} | ${row('', id, P, (c) => c.K180)} | ${row('', id, P, (c) => c.K365)} | ${row('', id, P, (c) => c.reviews90, 0)} | ${row('', id, P, (c) => c.reviews365, 0)} | ${row('', id, P, (c) => c.rec365)} | ${row('', id, P, (c) => c.b4p365)} | ${row('', id, P, (c) => c.b5p365)} | ${row('', id, P, (c) => c.ret365)} | ${row('', id, P, (c) => c.dueNow365, 0)} |`,
    );
  }
}
// worst/best learner model for K365 (A2, N=35)
out.push(
  '\n#### K365 by learner model (A2, N=35, mean over seeds), model = half-life multiplier m, spread sigma, growth-per-Known G\n',
);
const models = [...new Set(R[BASE].cells.filter((c) => c.kind === 'decay').map((c) => c.model))];
out.push('| model | ' + IDS.map((i) => i.replace('/G3-180', '')).join(' | ') + ' |');
out.push('|---|' + IDS.map(() => '---').join('|') + '|');
for (const m of models)
  out.push(
    `| ${m} | ` +
      IDS.map((id) =>
        f(
          mean(
            cells(id, (c) => c.kind === 'decay' && c.model === m && c.att === 'A2' && c.N === 35)[0]
              .K365,
          ),
        ),
      ).join(' | ') +
      ' |',
  );
// visible-progress metrics
out.push('\n#### Visible progression (decay models, A2, N=35)\n');
out.push(
  '| candidate | Known answers leaving the Box unchanged (below Box 5) | Box changes per learner-year | Box reversals per Box change | Unknown from Box>=2 dropping >1 Box | Box-5 mean interval (d) | Box-5 retention at review | Box-5 Unknown share |',
);
out.push('|---|---|---|---|---|---|---|---|');
for (const id of IDS) {
  const P = decay('A2', 35);
  const cs = cells(id, P);
  const ks = mean(cs.map((c) => mean(c.knownSame) / Math.max(1, mean(c.knownTot))));
  const ch = mean(cs.map((c) => mean(c.changes)));
  const rv = mean(cs.map((c) => mean(c.reversals) / Math.max(1, mean(c.changes))));
  const d2 = mean(cs.map((c) => mean(c.drop2)));
  const b5i = mean(cs.map((c) => c.b5Int).filter(Number.isFinite));
  const b5r = mean(cs.map((c) => mean(c.b5Ret.filter(Number.isFinite))).filter(Number.isFinite));
  const b5u = mean(cs.map((c) => mean(c.b5Unknown) / Math.max(1, mean(c.b5Reviews))));
  out.push(
    `| ${id.replace('/G3-180', '')} | ${f(ks * 100, 1)}% | ${f(ch, 1)} | ${f(rv, 2)} | ${f(d2, 1)} | ${f(b5i, 0)} | ${f(b5r)} | ${f(b5u * 100, 1)}% |`,
  );
}
// constant-recall sensitivity
out.push(
  '\n#### Constant recall probability p (N=35), sensitivity to repeated Unknown; mean over attendance A1-A3 and 100 seeds\n',
);
out.push(
  '| p | candidate | reviews d365 | recovery share d365 | Box4+ d365 | Box5 d365 | Known unchanged (<Box5) | max interval (d) |',
);
out.push('|---|---|---|---|---|---|---|---|');
for (const p of [0.5, 0.65, 0.75, 0.85, 0.95])
  for (const id of IDS) {
    const cs = cells(id, (c) => c.kind === 'const' && c.model === `p${p}`);
    const g = (k) => mean(cs.map((c) => mean(c[k])));
    out.push(
      `| ${p} | ${id.replace('/G3-180', '')} | ${f(g('reviews365'), 0)} | ${f(g('rec365'))} | ${f(g('b4p365'))} | ${f(g('b5p365'))} | ${f(100 * mean(cs.map((c) => mean(c.knownSame) / Math.max(1, mean(c.knownTot)))), 1)}% | ${f(R[id].acc.maxInterval, 0)} |`,
    );
  }
console.log(out.join('\n'));
