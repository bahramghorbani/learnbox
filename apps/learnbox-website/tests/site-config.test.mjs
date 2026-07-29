import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSiteConfig } from '../src/config/site.mjs';

test('empty environment activates only the four owner-verified destinations', () => {
  const config = buildSiteConfig({});

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(config.destinations).map(([id, destination]) => [
        id,
        { status: destination.status, url: destination.url },
      ]),
    ),
    {
      webApp: { status: 'unavailable', url: null },
      cafeBazaar: { status: 'unavailable', url: null },
      telegram: { status: 'available', url: 'https://t.me/learnboxapp' },
      instagram: { status: 'unavailable', url: null },
      linkedin: { status: 'unavailable', url: null },
      pinterest: { status: 'unavailable', url: null },
      privacy: { status: 'available', url: 'https://learnboxapp.com/privacy' },
      terms: { status: 'available', url: 'https://learnboxapp.com/terms' },
      contact: { status: 'available', url: 'mailto:hi@learnboxapp.com' },
    },
  );
});

test('explicit invalid hosted destination override fails closed', () => {
  const destination = buildSiteConfig({
    NEXT_PUBLIC_TELEGRAM_URL: 'https://example.com/learnboxapp',
  }).destinations.telegram;

  assert.deepEqual(
    { status: destination.status, url: destination.url },
    { status: 'invalid', url: null },
  );
});

test('explicit invalid legal destination override fails closed', () => {
  const destination = buildSiteConfig({
    NEXT_PUBLIC_PRIVACY_URL: 'javascript:alert(1)',
  }).destinations.privacy;

  assert.deepEqual(
    { status: destination.status, url: destination.url },
    { status: 'invalid', url: null },
  );
});

test('explicit invalid contact destination override fails closed', () => {
  const destination = buildSiteConfig({
    NEXT_PUBLIC_CONTACT_URL: 'tel:+98123456789',
  }).destinations.contact;

  assert.deepEqual(
    { status: destination.status, url: destination.url },
    { status: 'invalid', url: null },
  );
});
