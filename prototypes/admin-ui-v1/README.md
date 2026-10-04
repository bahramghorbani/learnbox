# LearnBox Admin — نمونهٔ طراحی رابط کاربری (v1)

نمونهٔ بصری ایستا برای ارزیابی زبان طراحی Admin. **کد محصول نیست.**

## اجرا

```bash
cd prototypes/admin-ui-v1
python3 -m http.server 4173 --bind 127.0.0.1
# http://127.0.0.1:4173/index.html
```

با `file://` هم باز می‌شود (همهٔ اسکریپت‌ها کلاسیک‌اند، بدون ماژول).

## صفحات

| فایل | صفحه |
|---|---|
| `index.html` | اتاق کنترل (داشبورد) — بازتولید تصویر مرجع |
| `content.html` | محتوا و بسته‌ها |
| `users.html` | کاربران |
| `store.html` | فروشگاه |
| `learning.html` | یادگیری |
| `presentation.html` | نمایش اپ (اسپلش و اسلایدر) |
| `access.html` | نشست‌ها و دسترسی |
| `ops.html` | عملیات |
| `settings.html` | تنظیمات |
| `login.html` | ورود مدیر |
| `empty.html` | الگوی حالت خالی |
| `error.html` | الگوی حالت خطا |

## مرزها

- هیچ درخواست شبکه‌ای، هیچ اتصال به پایگاه داده، هیچ منطق دامنه‌ای.
- دادهٔ `assets/js/data.js` ایستا و نمایشی است — نه staging، نه Production.
- دکمه‌ها فقط پیام «در نمونهٔ طراحی غیرفعال است» نشان می‌دهند.
- کد `apps/admin` دست‌نخورده است؛ این پوشه کاملاً ایزوله است.

## منابع واقعی استفاده‌شده

- فونت: `IRANSansX` (Regular, Bold) — از `apps/website/public/fonts`
- Bobo: `welcome-v2.png` — دارایی رسمی موجود، بازسازی نشده
- رنگ‌ها: از `apps/admin/app/globals.css` (`--purple: #6b42df` و هم‌خانواده‌ها)

## مغایرت‌ها با تصویر مرجع

در `DEVIATIONS.md` ثبت شده است.
