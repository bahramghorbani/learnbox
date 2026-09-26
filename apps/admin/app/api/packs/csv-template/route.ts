export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const csv = `lemma,article,part_of_speech,cefr,meanings,example_de,example_fa
der Koffer,der,noun,A1,چمدان|ساک,Ich packe meinen Koffer.,من چمدانم را جمع می‌کنم.
reisen,,verb,A1,سفر کردن|مسافرت کردن,Wir reisen nach Berlin.,ما به برلین سفر می‌کنیم.
schnell,,adjective,A1,سریع|تند,Der Zug ist sehr schnell.,قطار خیلی سریع است.
die Fahrkarte,die,noun,A1,بلیط,Ich brauche eine Fahrkarte.,من یک بلیط لازم دارم.
ankommen,,verb,A2,رسیدن|وارد شدن,Wann kommen wir an?,کی می‌رسیم؟
`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="learnbox-pack-template.csv"',
    },
  });
}
