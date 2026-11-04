import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanFa, parseFarhangLine, splitCompound } from '../scripts/dictionary/build-release.mjs';

test('farhang Persian is normalised and verb abbreviations are expanded', () => {
  assert.equal(cleanFa('.تُرمُز کَردَن، تَوَقُف ک'), 'ترمز کردن، توقف کردن');
  assert.equal(cleanFa('.دوراهه شُدَن، شاخه ش.، مُنشَعِب ش'), 'دوراهه شدن، شاخه شدن، منشعب شدن');
  assert.equal(cleanFa('تیکه وَرانى، ـ وَرونى، طَنز'), 'تیکه ورانی، ورونی، طنز');
  assert.equal(cleanFa('کیسهٔ صَفرا'), 'کیسهٔ صفرا');
  assert.equal(cleanFa('(plur.) (بعد (ابعاد'), 'بعد (ابعاد)');
  assert.equal(cleanFa('(plur.) مزرعه (مزارع)، کشتزار'), 'مزرعه (مزارع)، کشتزار');
  assert.equal(cleanFa('ذو القرنین) اسکندر)'), 'ذو القرنین (اسکندر)');
  assert.equal(cleanFa('مهره بازی (mere bāz?i)، عقیق'), 'مهره بازی، عقیق');
});

test('farhang lines split into headword and phrase', () => {
  assert.deepEqual(parseFarhangLine('Gabel (f); چَنگال'), {
    sub: false,
    de: 'Gabel (f)',
    fa: 'چنگال',
  });
  assert.deepEqual(parseFarhangLine('- Heugabel; چَنگال ِ چار شاخه'), {
    sub: true,
    de: 'Heugabel',
    fa: 'چنگال چار شاخه',
  });
  assert.equal(parseFarhangLine('no separator'), null);
});

test('compounds split only when the parts spell the word', () => {
  const ety = new Map([
    ['Haustürschlüssel', 'Determinativkompositum aus den Substantiven Haustür und Schlüssel'],
    ['Haustür', 'Determinativkompositum aus den Substantiven Haus und Tür'],
    ['Arbeitszimmer', 'Determinativkompositum aus Arbeit, Fugenelement -s und Zimmer'],
    ['Falsch', 'Determinativkompositum aus Haus und Tür'],
  ]);
  const head = (lemma, article, fa) => [lemma, { lemma, article, senses: [{ fa }] }];
  const heads = new Map([
    head('Haus', 'das', 'خانه'),
    head('Tür', 'die', 'در'),
    head('Schlüssel', 'der', 'کلید'),
    head('Arbeit', 'die', 'کار'),
    head('Zimmer', 'das', 'اتاق'),
  ]);
  const all = new Set([...heads.keys(), 'Haustür']);
  assert.deepEqual(
    splitCompound('Haustürschlüssel', ety, heads, all).map((p) => [p.text, p.lemma, p.article]),
    [
      ['Haus', 'Haus', 'das'],
      ['tür', 'Tür', 'die'],
      ['schlüssel', 'Schlüssel', 'der'],
    ],
  );
  assert.deepEqual(
    splitCompound('Arbeitszimmer', ety, heads, all).map((p) => p.text),
    ['Arbeits', 'zimmer'],
  );
  assert.equal(splitCompound('Falsch', ety, heads, all), null);
});
