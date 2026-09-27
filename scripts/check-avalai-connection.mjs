import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const localEnvPath = resolve('.env.avalai.local');

function getAvalaiKey() {
  if (process.env.AVALAI_API_KEY?.trim()) {
    return process.env.AVALAI_API_KEY.trim();
  }
  if (!existsSync(localEnvPath)) {
    return undefined;
  }

  const line = readFileSync(localEnvPath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('AVALAI_API_KEY='));
  const value = line?.slice('AVALAI_API_KEY='.length).trim();
  return value && value !== 'PASTE_YOUR_KEY_HERE' ? value : undefined;
}

const apiKey = getAvalaiKey();
if (!apiKey) {
  console.error(
    'کلید AvalAI وارد نشده است. فایل .env.avalai.local را فقط روی همین دستگاه تکمیل کنید.',
  );
  process.exitCode = 1;
} else {
  const response = await fetch('https://api.avalai.ir/user/v1/credit', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    console.error(
      `اتصال AvalAI ناموفق بود (HTTP ${response.status}). کلید یا وضعیت حساب را بررسی کنید.`,
    );
    process.exitCode = 1;
  } else {
    const payload = await response.json();
    const credit = typeof payload === 'object' && payload !== null ? payload : {};
    console.log('اتصال AvalAI برقرار است.');
    if ('credit' in credit) {
      console.log(`اعتبار قابل استفاده: ${String(credit.credit)}`);
    }
  }
}
