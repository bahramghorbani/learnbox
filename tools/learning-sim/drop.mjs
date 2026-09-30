import { readFileSync } from 'node:fs';
const B = process.env.HOME + '/.hermes/cache/scratch/cp1/';
const L = (p) => JSON.parse(readFileSync(B + p, 'utf8')).results;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
for (const [name, main, drop] of [
  ['floor', 'out-floor', 'out-drop-floor'],
  ['orig', 'out', 'out-drop-orig'],
]) {
  const all = [...L(main + '/grid.json'), ...L(drop + '/grid.json')];
  console.log('\n==', name);
  for (const id of [
    'ENG-CLAMP/G3-180',
    'ENG-DROP/G3-180',
    'ENG-CLAMP/G3-365',
    'ENG-DROP/G3-365',
    'ENG-CLAMP/F21',
    'ENG-DROP/F21',
  ]) {
    const r = all.find((x) => x.cand === id);
    const dec = r.cells.filter((c) => c.kind === 'decay' && c.N === 35);
    const cst = r.cells.filter((c) => c.kind === 'const');
    const noChg =
      cst.reduce((t, c) => t + mean(c.unknownSame), 0) /
      cst.reduce((t, c) => t + mean(c.unknownTot), 0);
    console.log(
      id.padEnd(18),
      'K365',
      mean(dec.map((c) => mean(c.K365))).toFixed(3),
      'reviews365',
      mean(dec.map((c) => mean(c.reviews365))).toFixed(0),
      'recov',
      mean(dec.map((c) => mean(c.rec365))).toFixed(3),
      'Unknown-leaves-Box-unchanged (const cells, all boxes):',
      noChg.toFixed(3),
      'G2 unknownRaise',
      r.acc.transU.flat().length &&
        r.acc.transU.reduce((t, row, a) => t + row.reduce((u, v, b) => u + (b > a ? v : 0), 0), 0),
    );
  }
}
