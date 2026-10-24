/**
 * The 15 motivational reminder sentences shown to the owner for approval before this feature
 * shipped. One is picked at random per send so a learner doesn't see the exact same line every
 * day. Keep each short — these are push-notification BODY text, not a paragraph.
 */
export const DAILY_REMINDER_SENTENCES: readonly string[] = [
  'وقت مرور کلمات امروزته! چند دقیقه کافیه.',
  'زبان آلمانی رو فراموش نکن، همین الان یه نگاه بنداز.',
  'هر روز کمی تمرین، نتیجه‌ی بزرگ فردا.',
  'کلمات امروزت منتظرتن، بیا مرورشون کنیم.',
  '۵ دقیقه امروز، یک قدم نزدیک‌تر به تسلط بر آلمانی.',
  'پیوستگی رمز موفقیته؛ امروز رو از دست نده.',
  'یادت نره! مرور امروز رو انجام بده تا یادگیریت قوی بمونه.',
  'وقتشه دوباره با کلمات آلمانی آشنا شی!',
  'یه فنجون چای و چند کلمه‌ی جدید، چطوره؟',
  'هر کلمه‌ای که امروز مرور کنی، فردا راحت‌تر یادت می‌مونه.',
  'زنجیره‌ی یادگیریت رو نشکن، همین حالا برگرد به اپ.',
  'وقت کوتاهیه برای مرور، نتیجه‌اش طولانی‌مدته.',
  'بیا ببینیم امروز چقدر پیشرفت می‌کنی!',
  'کلماتت دلتنگتن! وقتشه برگردی و مرورشون کنی.',
  'هر روز یه قدم، تا رسیدن به تسلط کامل بر آلمانی.',
];

export function pickRandomSentence(random: () => number = Math.random): string {
  const index = Math.floor(random() * DAILY_REMINDER_SENTENCES.length);
  return DAILY_REMINDER_SENTENCES[Math.min(index, DAILY_REMINDER_SENTENCES.length - 1)];
}
