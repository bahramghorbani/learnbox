import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..', 'app');

test('privacy page covers the approved plain-language topics', async () => {
  const privacySource = await readFile(resolve(appRoot, 'privacy/page.tsx'), 'utf8');

  for (const phrase of [
    'داده‌های روی دستگاه',
    'رضایت',
    'نگهداری',
    'حذف',
    'فروش اطلاعات شخصی',
    'hi@learnboxapp.com',
  ]) {
    assert.match(privacySource, new RegExp(phrase));
  }
});

test('terms page covers the approved plain-language topics', async () => {
  const termsSource = await readFile(resolve(appRoot, 'terms/page.tsx'), 'utf8');

  for (const phrase of [
    'نسخهٔ پیش‌انتشار',
    'استفادهٔ مجاز',
    'مالکیت فکری',
    'هدف آموزشی',
    'حقوق غیرقابل اسقاط',
    'hi@learnboxapp.com',
  ]) {
    assert.match(termsSource, new RegExp(phrase));
  }
});
