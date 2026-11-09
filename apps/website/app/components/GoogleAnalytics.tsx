import Script from 'next/script';

// GA4 property shared with the marketing site; gtag ID is public, not a secret.
const GA_ID = 'G-WCY30E5YNQ';

export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== 'production') return null;
  return (
    <>
      <Script async src={`https://www.googletagmanager.com/gtm.js?id=${GA_ID}`} />
      <Script id="ga-init">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
