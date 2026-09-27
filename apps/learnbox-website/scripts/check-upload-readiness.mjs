import { buildSiteConfig, destinationDefinitions } from '../src/config/site.mjs';

const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArgument?.split('=')[1];

if (!['preview', 'production'].includes(mode)) {
  console.error('Use --mode=preview or --mode=production.');
  process.exitCode = 1;
} else {
  const issues = [];
  const config = buildSiteConfig(process.env);

  try {
    const siteUrl = new URL(config.siteUrl);
    if (siteUrl.protocol !== 'https:') issues.push('NEXT_PUBLIC_SITE_URL must use HTTPS.');
  } catch {
    issues.push('NEXT_PUBLIC_SITE_URL must be a valid URL.');
  }

  if (mode === 'production') {
    for (const definition of destinationDefinitions) {
      const destination = config.destinations[definition.id];
      if (destination.status !== 'available') {
        issues.push(`${definition.env} is missing or invalid.`);
      }
    }

    if (process.env.LEARNBOX_PRODUCT_SCREEN_STATUS !== 'approved') {
      issues.push('LEARNBOX_PRODUCT_SCREEN_STATUS must be approved.');
    }

    if (process.env.LEARNBOX_QR_STATUS !== 'approved') {
      issues.push('LEARNBOX_QR_STATUS must be approved.');
    }

    if (process.env.LEARNBOX_OG_STATUS !== 'approved') {
      issues.push('LEARNBOX_OG_STATUS must be approved.');
    }

    if (process.env.LEARNBOX_LEGAL_REVIEW_STATUS !== 'approved') {
      issues.push('LEARNBOX_LEGAL_REVIEW_STATUS must be approved.');
    }
  }

  if (issues.length > 0) {
    console.error(`Upload readiness blocked (${mode}):\n- ${issues.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(mode === 'preview' ? 'PREVIEW UPLOAD READY' : 'PRODUCTION UPLOAD READY');
  }
}
