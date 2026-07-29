const definitions = [
  {
    id: 'webApp',
    env: 'NEXT_PUBLIC_WEB_APP_URL',
    label: 'نسخه وب',
    protocols: ['https:'],
  },
  {
    id: 'cafeBazaar',
    env: 'NEXT_PUBLIC_CAFE_BAZAAR_URL',
    label: 'کافه‌بازار',
    protocols: ['https:'],
    hosts: ['cafebazaar.ir'],
  },
  {
    id: 'telegram',
    env: 'NEXT_PUBLIC_TELEGRAM_URL',
    label: 'Telegram',
    protocols: ['https:'],
    hosts: ['t.me', 'telegram.me'],
    defaultValue: 'https://t.me/learnboxapp',
  },
  {
    id: 'instagram',
    env: 'NEXT_PUBLIC_INSTAGRAM_URL',
    label: 'Instagram',
    protocols: ['https:'],
    hosts: ['instagram.com', 'www.instagram.com'],
  },
  {
    id: 'linkedin',
    env: 'NEXT_PUBLIC_LINKEDIN_URL',
    label: 'LinkedIn',
    protocols: ['https:'],
    hosts: ['linkedin.com', 'www.linkedin.com'],
  },
  {
    id: 'pinterest',
    env: 'NEXT_PUBLIC_PINTEREST_URL',
    label: 'Pinterest',
    protocols: ['https:'],
    hosts: ['pinterest.com', 'www.pinterest.com'],
  },
  {
    id: 'privacy',
    env: 'NEXT_PUBLIC_PRIVACY_URL',
    label: 'حریم خصوصی',
    protocols: ['https:'],
    defaultValue: 'https://learnboxapp.com/privacy',
  },
  {
    id: 'terms',
    env: 'NEXT_PUBLIC_TERMS_URL',
    label: 'شرایط استفاده',
    protocols: ['https:'],
    defaultValue: 'https://learnboxapp.com/terms',
  },
  {
    id: 'contact',
    env: 'NEXT_PUBLIC_CONTACT_URL',
    label: 'ارتباط با LearnBox',
    protocols: ['https:', 'mailto:'],
    defaultValue: 'mailto:hi@learnboxapp.com',
  },
];

export const destinationDefinitions = Object.freeze(definitions);

export function resolveDestination(definition, value) {
  const suppliedValue = value === undefined ? definition.defaultValue : value;
  const normalized = suppliedValue?.trim();
  if (!normalized && value === undefined && definition.defaultValue === undefined) {
    return {
      id: definition.id,
      label: definition.label,
      status: 'unavailable',
      url: null,
    };
  }

  if (!normalized) {
    return {
      id: definition.id,
      label: definition.label,
      status: 'invalid',
      url: null,
    };
  }

  try {
    const url = new URL(normalized);
    const allowedProtocol = definition.protocols.includes(url.protocol);
    const allowedHost =
      !definition.hosts ||
      definition.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));

    if (!allowedProtocol || !allowedHost) throw new Error('Destination is not approved.');

    return {
      id: definition.id,
      label: definition.label,
      status: 'available',
      url: url.toString(),
    };
  } catch {
    return {
      id: definition.id,
      label: definition.label,
      status: 'invalid',
      url: null,
    };
  }
}

export function buildSiteConfig(environment) {
  return {
    siteUrl: environment.NEXT_PUBLIC_SITE_URL?.trim() || 'https://learnboxapp.com',
    destinations: Object.fromEntries(
      destinationDefinitions.map((definition) => [
        definition.id,
        resolveDestination(definition, environment[definition.env]),
      ]),
    ),
  };
}

export const siteConfig = buildSiteConfig({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_WEB_APP_URL: process.env.NEXT_PUBLIC_WEB_APP_URL,
  NEXT_PUBLIC_CAFE_BAZAAR_URL: process.env.NEXT_PUBLIC_CAFE_BAZAAR_URL,
  NEXT_PUBLIC_TELEGRAM_URL: process.env.NEXT_PUBLIC_TELEGRAM_URL,
  NEXT_PUBLIC_INSTAGRAM_URL: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
  NEXT_PUBLIC_LINKEDIN_URL: process.env.NEXT_PUBLIC_LINKEDIN_URL,
  NEXT_PUBLIC_PINTEREST_URL: process.env.NEXT_PUBLIC_PINTEREST_URL,
  NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL,
  NEXT_PUBLIC_TERMS_URL: process.env.NEXT_PUBLIC_TERMS_URL,
  NEXT_PUBLIC_CONTACT_URL: process.env.NEXT_PUBLIC_CONTACT_URL,
});
