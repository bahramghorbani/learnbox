export type ProductStoryStageId = 'start' | 'today' | 'return' | 'progress';

export type ProductStoryStage = {
  id: ProductStoryStageId;
  eyebrow: string;
  title: string;
  description: string;
  image: {
    src: string;
    alt: string;
    width: 1080;
    height: 1920;
  };
  place: 'berlin' | 'transit' | 'park' | 'rhine';
};

export const productStoryStages: readonly ProductStoryStage[] = [
  {
    id: 'start',
    eyebrow: 'شروع مسیر',
    title: 'اولین قدم برای ساختن عادت یادگیری',
    description: 'صفحهٔ آغاز LearnBox، شروع مسیر و ورود به برنامه را نشان می‌دهد.',
    image: {
      src: '/product/screens/v1/start-journey.jpeg',
      alt: 'صفحهٔ آغاز LearnBox برای شروع مسیر یادگیری',
      width: 1080,
      height: 1920,
    },
    place: 'berlin',
  },
  {
    id: 'today',
    eyebrow: 'امروز',
    title: 'مرورهای امروز، روشن و در دسترس',
    description: 'صفحهٔ امروز LearnBox مرورهای آماده و مسیر ادامه‌دادن را نشان می‌دهد.',
    image: {
      src: '/product/screens/v1/today.jpeg',
      alt: 'صفحهٔ امروز LearnBox با مرورهای آماده',
      width: 1080,
      height: 1920,
    },
    place: 'transit',
  },
  {
    id: 'return',
    eyebrow: 'بازگشت آرام',
    title: 'بعد از وقفه، از همان‌جا ادامه بده',
    description: 'صفحهٔ بازگشت LearnBox ادامهٔ مسیر را با یک قدم آرام پیش می‌برد.',
    image: {
      src: '/product/screens/v1/calm-return.jpeg',
      alt: 'صفحهٔ بازگشت آرام LearnBox برای ادامهٔ یادگیری',
      width: 1080,
      height: 1920,
    },
    place: 'park',
  },
  {
    id: 'progress',
    eyebrow: 'پیشرفت',
    title: 'تغییر مسیر را در طول زمان ببین',
    description: 'صفحهٔ پیشرفت LearnBox نمایی از روند یادگیری و دستاوردهای مسیر است.',
    image: {
      src: '/product/screens/v1/progress.jpeg',
      alt: 'صفحهٔ پیشرفت LearnBox در مسیر یادگیری',
      width: 1080,
      height: 1920,
    },
    place: 'rhine',
  },
];

export const productStoryInterfaceNote =
  'شمارها و وضعیت‌های دیده‌شده در این تصویرها، نمونه‌ای از حالت رابط کاربری هستند.';
