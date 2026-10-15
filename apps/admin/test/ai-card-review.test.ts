import { describe, expect, it } from 'vitest';

import {
  buildQualityReport,
  buildRepairPrompt,
  buildReviewPrompt,
  parseRepairReply,
  parseReviewReply,
  REVIEWER_SYSTEM_PROMPT,
  stateAfterReview,
  type GeneratedRow,
} from '../lib/server/ai-card-review';

describe('independent AI card review contract', () => {
  const row: GeneratedRow = {
    lemma: 'Haus',
    part_of_speech: 'noun',
    article: 'das',
    essential_inflection: 'die Häuser',
    cefr: 'A1',
    persian_meanings: 'خانه',
    example_german: 'Das Haus ist groß.',
    example_persian: 'خانه بزرگ است.',
  };

  it('gives the reviewer card fields and learning context, but no generation prompt or provenance', () => {
    const prompt = buildReviewPrompt({
      packTitle: 'German homes',
      cefr: 'A1',
      cards: [{ index: 0, row }],
    });

    expect(prompt).toContain('German homes');
    expect(prompt).toContain('"lemma":"Haus"');
    expect(prompt).not.toContain('generator');
    expect(prompt).not.toContain('apiKey');
    expect(REVIEWER_SYSTEM_PROMPT).toContain('Standard German');
    expect(REVIEWER_SYSTEM_PROMPT).toContain('Persian meaning');
    expect(REVIEWER_SYSTEM_PROMPT).toContain('CEFR');
  });

  it('parses a critical semantic finding as blocking, with its reason and repair suggestion intact', () => {
    const reviews = parseReviewReply(
      {
        reviews: [
          {
            index: 0,
            findings: [
              {
                field: 'article',
                severity: 'critical',
                reason: 'حرف تعریف با اسم هماهنگ نیست.',
                suggestion: 'برای Haus از das استفاده کنید.',
              },
            ],
          },
        ],
      },
      [0],
    );
    expect(reviews?.get(0)).toEqual([
      expect.objectContaining({ field: 'article', severity: 'critical', source: 'reviewer' }),
    ]);
    expect(stateAfterReview(reviews?.get(0) ?? [], 0, 2)).toBe('needs_repair');
    expect(stateAfterReview(reviews?.get(0) ?? [], 2, 2)).toBe('unresolved');
  });

  it('does not permit an invented repair response to replace a card', () => {
    const prompt = buildRepairPrompt({
      packTitle: 'German homes',
      cefr: 'A1',
      cards: [
        {
          index: 0,
          row: {
            ...row,
            _review: {
              state: 'needs_repair',
              findings: [
                {
                  field: 'persianMeaning',
                  severity: 'major',
                  reason: 'ترجمه طبیعی نیست.',
                  suggestion: 'معادل طبیعی فارسی را بنویسید.',
                  source: 'reviewer',
                },
              ],
              repairRounds: 0,
              repaired: false,
            },
          },
        },
      ],
    });
    expect(prompt).toContain('ترجمه طبیعی نیست.');
    expect(parseRepairReply({ cards: [{ index: 0, card: { cefr: 'A1' } }] }, [0])).toBeUndefined();
  });

  it('reports unresolved cards and never lowers the planned target to hide a shortfall', () => {
    const report = buildQualityReport(
      [
        { ...row, _review: { state: 'passed', findings: [], repairRounds: 0, repaired: false } },
        {
          ...row,
          lemma: 'falsch',
          _review: {
            state: 'unresolved',
            findings: [
              {
                field: 'persianMeaning',
                severity: 'critical',
                reason: 'خطای معنایی',
                suggestion: 'اصلاح شود',
                source: 'reviewer',
              },
            ],
            repairRounds: 2,
            repaired: true,
          },
        },
      ],
      ['new', 'new'],
      4,
    );

    expect(report.ready).toBe(1);
    expect(report.withIssues).toBe(1);
    expect(report.target).toBe(4);
    expect(report.shortfall).toBe(3);
  });
});
