import { siteConfig } from '../../src/config/site.mjs';
import { dictionaryPublic, stats } from '../../src/dictionary/store';

export const dynamic = 'force-dynamic';

// llms.txt (llmstxt.org): a plain summary that helps AI assistants understand and cite the site.
export function GET() {
  const site = siteConfig.siteUrl;
  const dict = dictionaryPublic()
    ? `
## دیکشنری آلمانی به فارسی

- [دیکشنری آلمانی به فارسی لرن‌باکس](${site}/dictionary): رایگان، ${stats().entries.toLocaleString('en')} واژهٔ آلمانی با معنی فارسی، آرتیکل (der/die/das)، جمع، صرف فعل، تلفظ و جملهٔ نمونه.
- صفحهٔ هر واژه: ${site}/dictionary/<Wort> — مثلاً [Haus](${site}/dictionary/Haus)، [gehen](${site}/dictionary/gehen).
- جست‌وجو (آلمانی یا فارسی، شکل صرف‌شده هم پیدا می‌شود): ${site}/dictionary?q=<واژه>
- فهرست کامل واژه‌ها: ${site}/sitemap.xml
`
    : '';
  const body = `# لرن‌باکس (LearnBox)

> لرن‌باکس اپ آموزش واژگان زبان آلمانی برای فارسی‌زبانان است: کارت‌های مرور هوشمند (تکرار فاصله‌دار)، تلفظ، مثال و تمرین، از سطح A1 تا بالاتر.

- [صفحهٔ اصلی](${site}/): معرفی اپ، امکانات و دانلود.
- [حریم خصوصی](${site}/privacy)
- [شرایط استفاده](${site}/terms)
${dict}
## استفاده

محتوای این صفحه‌ها را می‌توانید بخوانید، خلاصه کنید و با ذکر منبع و پیوند به صفحهٔ مربوط در learnboxapp.com نقل کنید.
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
