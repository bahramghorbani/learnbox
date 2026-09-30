// LB-B35 CP1 A10 — return after an absence. N=35, M-decay m=2 sigma=.5 G=2.5, floor variant.
// Usage: node gap.mjs [seeds]. 60 daily days, absence of 14/30/90 days, then daily again.
import { candidates } from './policies.mjs';
import { runOne } from './sim.mjs';
const seeds = Number(process.argv[2] || 100);
const C = candidates().filter((c) => c.id === 'V1' || c.axis === 'G3-365');
const MODELS = {
  strong: { type: 'decay', m: 2, sigma: 0.5, G: 2.5, pNew: 0.5 },
  weak: { type: 'decay', m: 0.5, sigma: 1.0, G: 1.5, pNew: 0.5 },
};
const model = MODELS[process.argv[3] || 'strong'];
console.log('learner model:', process.argv[3] || 'strong', JSON.stringify(model));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
for (const G of [14, 30, 90]) {
  console.log(`\n== absence ${G} days (return on day ${60 + G})`);
  console.log(
    'cand              dueOnReturn recoverySessions sessionsToClear(<=7d) K@before K@return K@return+30',
  );
  for (const c of C) {
    const r = { due: [], rec: [], clear: [], k0: [], k1: [], k2: [] };
    for (let seed = 1; seed <= seeds; seed++) {
      const att = new Uint8Array(365);
      for (let d = 0; d < 60; d++) att[d] = 1;
      for (let d = 60 + G; d < 60 + G + 60; d++) att[d] = 1;
      const trace = [];
      const s = runOne(c, model, 'A1', 35, seed, {
        variant: 'floor',
        attendance: att,
        trace,
        snap: [59, 60 + G, 60 + G + 30],
      });
      const ret = trace.filter((t) => t.day >= 60 + G);
      r.due.push(ret[0].due);
      r.rec.push(ret.filter((t) => t.mode === 'recovery').length);
      const firstClear = ret.findIndex((t) => t.maxOver <= 7);
      r.clear.push(firstClear < 0 ? ret.length : firstClear + 1);
      r.k0.push(s.snapshots[59].K);
      r.k1.push(s.snapshots[60 + G].K);
      r.k2.push(s.snapshots[60 + G + 30].K);
    }
    console.log(
      c.id.padEnd(18),
      mean(r.due).toFixed(1).padStart(10),
      mean(r.rec).toFixed(1).padStart(15),
      mean(r.clear).toFixed(1).padStart(19),
      mean(r.k0).toFixed(3).padStart(9),
      mean(r.k1).toFixed(3).padStart(9),
      mean(r.k2).toFixed(3).padStart(11),
    );
  }
}
