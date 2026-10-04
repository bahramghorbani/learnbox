/* Static representative prototype data.
   Explicitly allowed by the directive: visual/UX evaluation only.
   NOT connected to staging or Production. No canonical business logic here. */
var DATA = (function () {

  var users = [
    { id: 12438, name: 'سارا رحیمی', latin: 'Sara Rahimi', mail: 'sara.rahimi@gmail.com', status: 'active', seen: '۲ دقیقه پیش', joined: '۱۴۰۴/۰۴/۱۲', packs: 4, reviews: 3120, known: 742 },
    { id: 12437, name: 'علی محمدی', latin: 'Ali Mohammadi', mail: 'ali.mohammadi@gmail.com', status: 'active', seen: '۱۲ دقیقه پیش', joined: '۱۴۰۴/۰۴/۱۰', packs: 2, reviews: 1480, known: 390 },
    { id: 12436, name: 'مینا کریمی', latin: 'Mina Karimi', mail: 'mina.karimi@yahoo.com', status: 'active', seen: '۳۴ دقیقه پیش', joined: '۱۴۰۴/۰۴/۰۸', packs: 6, reviews: 5260, known: 1310 },
    { id: 12435, name: 'رضا احمدی', latin: 'Reza Ahmadi', mail: 'reza.ahmadi@gmail.com', status: 'inactive', seen: '۱ ساعت پیش', joined: '۱۴۰۴/۰۳/۲۹', packs: 1, reviews: 210, known: 48 },
    { id: 12434, name: 'ندا فرشاد', latin: 'Neda Farshad', mail: 'neda.farshad@gmail.com', status: 'active', seen: '۲ ساعت پیش', joined: '۱۴۰۴/۰۳/۲۱', packs: 3, reviews: 2045, known: 588 },
    { id: 12433, name: 'حسین مرادی', latin: 'Hossein Moradi', mail: 'h.moradi@gmail.com', status: 'active', seen: '۵ ساعت پیش', joined: '۱۴۰۴/۰۳/۱۵', packs: 2, reviews: 980, known: 265 },
    { id: 12432, name: 'زهرا نیک‌پور', latin: 'Zahra Nikpour', mail: 'z.nikpour@gmail.com', status: 'suspended', seen: '۳ روز پیش', joined: '۱۴۰۴/۰۲/۳۰', packs: 1, reviews: 120, known: 22 },
    { id: 12431, name: 'امیر صادقی', latin: 'Amir Sadeghi', mail: 'amir.sadeghi@gmail.com', status: 'active', seen: '۱ روز پیش', joined: '۱۴۰۴/۰۲/۱۸', packs: 5, reviews: 4110, known: 1022 }
  ];

  var packs = [
    { id: 'p1', name: '۵۰۰ واژه ضروری برای تحصیل', lvl: 'B1-B2', cards: 500, state: 'review', progress: 75, price: 0, paid: false, cat: 'تحصیلی', featured: true, sold: 0, cover: '#7c5cff' },
    { id: 'p2', name: 'اصطلاحات مصاحبه کاری', lvl: 'A2-B1', cards: 300, state: 'review', progress: 40, price: 149000, paid: true, cat: 'شغلی', featured: false, sold: 212, cover: '#5b8def' },
    { id: 'p3', name: 'واژگان سفر و گردشگری', lvl: 'A1-A2', cards: 250, state: 'draft', progress: 18, price: 99000, paid: true, cat: 'عمومی', featured: false, sold: 0, cover: '#f0a33c' },
    { id: 'p4', name: 'لغات روزمره — سطح A1', lvl: 'A1', cards: 200, state: 'published', progress: 100, price: 0, paid: false, cat: 'عمومی', featured: true, sold: 1240, cover: '#38b47f' },
    { id: 'p5', name: 'مکالمه روزمره', lvl: 'A2', cards: 380, state: 'published', progress: 100, price: 189000, paid: true, cat: 'مکالمه', featured: true, sold: 864, cover: '#8b5cf6' },
    { id: 'p6', name: 'افعال پرکاربرد آلمانی', lvl: 'A2-B1', cards: 420, state: 'published', progress: 100, price: 159000, paid: true, cat: 'گرامر', featured: false, sold: 531, cover: '#e8657f' },
    { id: 'p7', name: 'آزمون Goethe B1 — بخش واژگان', lvl: 'B1', cards: 460, state: 'published', progress: 100, price: 229000, paid: true, cat: 'آزمون', featured: false, sold: 318, cover: '#4ba3c7' },
    { id: 'p8', name: 'واژگان پزشکی مقدماتی', lvl: 'B2', cards: 310, state: 'archived', progress: 100, price: 199000, paid: true, cat: 'تخصصی', featured: false, sold: 76, cover: '#9aa0b4' }
  ];

  var cards = [
    { de: 'der Apfel', pl: 'die Äpfel', fa: 'سیب', ipa: '/ˈapfəl/', img: true, audioW: true, audioS: true, state: 'approved' },
    { de: 'das Haus', pl: 'die Häuser', fa: 'خانه', ipa: '/haʊs/', img: true, audioW: true, audioS: true, state: 'approved' },
    { de: 'die Arbeit', pl: 'die Arbeiten', fa: 'کار', ipa: '/ˈaʁbaɪt/', img: true, audioW: true, audioS: false, state: 'review' },
    { de: 'der Bahnhof', pl: 'die Bahnhöfe', fa: 'ایستگاه قطار', ipa: '/ˈbaːnhoːf/', img: false, audioW: true, audioS: false, state: 'review' },
    { de: 'die Wohnung', pl: 'die Wohnungen', fa: 'آپارتمان', ipa: '/ˈvoːnʊŋ/', img: true, audioW: false, audioS: false, state: 'draft' },
    { de: 'das Gespräch', pl: 'die Gespräche', fa: 'گفت‌وگو', ipa: '/ɡəˈʃpʁɛːç/', img: false, audioW: false, audioS: false, state: 'draft' },
    { de: 'der Termin', pl: 'die Termine', fa: 'قرار ملاقات', ipa: '/tɛʁˈmiːn/', img: true, audioW: true, audioS: true, state: 'approved' },
    { de: 'die Rechnung', pl: 'die Rechnungen', fa: 'صورتحساب', ipa: '/ˈʁɛçnʊŋ/', img: true, audioW: true, audioS: true, state: 'approved' }
  ];

  var activity = [
    { ic: 'plus', tint: 't-purple', t: 'بستهٔ «۵۰۰ واژه ضروری» ایجاد شد', s: 'توسط بهرام قربانی', time: '۱۰ دقیقه پیش' },
    { ic: 'image', tint: 't-blue', t: 'اسپلش جدید فعال شد', s: 'مناسبت: پاییز ۱۴۰۴', time: '۴۵ دقیقه پیش' },
    { ic: 'cart', tint: 't-amber', t: 'خرید بستهٔ «مکالمه روزمره»', s: 'سارا رحیمی', time: '۱ ساعت پیش' },
    { ic: 'userPlus', tint: 't-green', t: 'کاربر جدید ثبت‌نام کرد', s: 'mohammad.reza@gmail.com', time: '۲ ساعت پیش' },
    { ic: 'checkCircle', tint: 't-green', t: 'بستهٔ «اصطلاحات کاری» به انتشار رسید', s: 'توسط بهرام قربانی', time: '۳ ساعت پیش' }
  ];

  var growth = [1180, 1210, 1190, 1260, 1240, 1320, 1290, 1380, 1420, 1390,
                1460, 1510, 1480, 1560, 1610, 1590, 1680, 1720, 1700, 1790,
                1840, 1880, 1860, 1950, 2010, 2060, 2120, 2180, 2240, 2310];

  var sales = [
    [42, 78], [55, 96], [38, 62], [61, 110], [49, 84], [72, 128], [58, 101],
    [80, 142], [66, 118], [91, 160], [74, 132], [103, 182], [88, 155], [117, 205]
  ];

  var sessionsAdmin = [
    { who: 'بهرام قربانی', role: 'Super Admin', dev: 'macOS · Safari', ip: '127.0.0.1', last: 'هم‌اکنون', cur: true },
    { who: 'بهرام قربانی', role: 'Super Admin', dev: 'macOS · Chrome', ip: '127.0.0.1', last: '۲ ساعت پیش', cur: false }
  ];

  var admins = [
    { who: 'بهرام قربانی', mail: 'owner@learnbox.app', role: 'Super Admin', keys: 1, state: 'active' },
    { who: 'تعریف‌نشده', mail: '—', role: 'Content Manager', keys: 0, state: 'empty' },
    { who: 'تعریف‌نشده', mail: '—', role: 'Content Reviewer', keys: 0, state: 'empty' },
    { who: 'تعریف‌نشده', mail: '—', role: 'Support', keys: 0, state: 'empty' },
    { who: 'تعریف‌نشده', mail: '—', role: 'Operations', keys: 0, state: 'empty' }
  ];

  var audit = [
    { t: 'ورود موفق مدیر با Passkey', s: 'بهرام قربانی · Super Admin', time: 'امروز ۱۸:۴۲', kind: 'ok' },
    { t: 'بستهٔ «اصطلاحات کاری» منتشر شد', s: 'بهرام قربانی', time: 'امروز ۱۵:۱۰', kind: 'ok' },
    { t: 'نشست کاربر ۱۲۴۳۵ باطل شد', s: 'بهرام قربانی', time: 'دیروز ۲۱:۰۵', kind: 'warn' },
    { t: 'تلاش ناموفق ورود مدیر', s: 'رمز bootstrap نامعتبر', time: 'دیروز ۲۰:۳۳', kind: 'bad' },
    { t: 'نقش Content Reviewer تخصیص یافت', s: 'بهرام قربانی', time: '۳ روز پیش', kind: 'ok' }
  ];

  var jobs = [
    { name: 'تولید تصویر — بستهٔ B1-B2', total: 500, done: 375, state: 'running' },
    { name: 'تولید صدای واژه — بستهٔ A2-B1', total: 300, done: 300, state: 'done' },
    { name: 'تولید جملهٔ نمونه — بستهٔ A1-A2', total: 250, done: 44, state: 'failed' },
    { name: 'درون‌ریزی CSV — واژگان سفر', total: 250, done: 250, state: 'done' }
  ];

  var slides = [
    { title: 'بستهٔ مکالمه روزمره', text: 'با ۳۸۰ کارت گفت‌وگوی واقعی', cta: 'مشاهدهٔ بسته', dest: 'pack', destName: 'مکالمه روزمره', from: '۱۴۰۴/۰۴/۰۱', to: '۱۴۰۴/۰۵/۰۱', on: true, bg: 'linear-gradient(135deg,#6b42df,#9b6cff)' },
    { title: 'تخفیف پاییزی', text: 'تا ۳۰٪ روی بسته‌های آزمون', cta: 'فروشگاه', dest: 'store', destName: 'فروشگاه', from: '۱۴۰۴/۰۴/۱۰', to: '۱۴۰۴/۰۴/۳۱', on: true, bg: 'linear-gradient(135deg,#e8820f,#f3b24a)' },
    { title: 'راهنمای شروع', text: 'در ۵ دقیقه یادگیری را شروع کن', cta: 'بیشتر', dest: 'link', destName: 'learnboxapp.com/start', from: '۱۴۰۴/۰۳/۰۱', to: '—', on: false, bg: 'linear-gradient(135deg,#1f9d63,#4cc48c)' }
  ];

  return {
    users: users, packs: packs, cards: cards, activity: activity,
    growth: growth, sales: sales, sessionsAdmin: sessionsAdmin,
    admins: admins, audit: audit, jobs: jobs, slides: slides
  };
})();
