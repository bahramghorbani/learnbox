'use client';

import { useEffect, useState } from 'react';

import { Bobo } from './Bobo';

const dismissedKey = 'learnbox-install-banner-dismissed-v1';

// ponytail: in-app webviews (Instagram/Telegram/etc) can't install PWAs reliably —
// no upgrade path, this is a platform wall, not a thing to detect harder.
const inAppWebviewPattern = /Instagram|FBAN|FBAV|Line\/|MicroMessenger|Telegram/i;

type Platform = 'android' | 'ios' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

export function InstallAppBanner() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(dismissedKey)) return;
    if (isStandalone()) return;
    if (inAppWebviewPattern.test(navigator.userAgent)) return;

    const detected = detectPlatform(navigator.userAgent);
    if (!detected) return;
    setPlatform(detected);

    if (detected === 'ios') {
      // iOS has no install API at all — Safari never fires beforeinstallprompt,
      // so the instructional variant is shown as soon as we know the platform.
      setVisible(true);
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(dismissedKey, '1');
    setVisible(false);
  };

  const handleInstall = () => {
    if (!deferredPrompt) return;
    void deferredPrompt.prompt().then(() => {
      // ponytail: outcome isn't branched on — accepted or dismissed, the native
      // prompt already told the user; our banner's job here is done either way.
      window.localStorage.setItem(dismissedKey, '1');
      setVisible(false);
    });
  };

  if (!visible || !platform) return null;

  return (
    <aside className="install-app-banner" dir="rtl" role="complementary" aria-label="نصب لرن‌باکس">
      <button
        className="install-app-banner-close"
        type="button"
        onClick={dismiss}
        aria-label="بستن"
      >
        ×
      </button>
      <Bobo
        expression="encourage"
        animation="wiggle"
        size={64}
        className="install-app-banner-bobo"
      />
      <div className="install-app-banner-copy">
        <strong>لرن‌باکس رو به گوشیت اضافه کن!</strong>
        {platform === 'android' ? (
          <>
            <p>با یک لمس، لرن‌باکس رو مثل یک اپ واقعی روی گوشیت نصب کن.</p>
            <button className="install-app-banner-cta" type="button" onClick={handleInstall}>
              نصب کن
            </button>
          </>
        ) : (
          <p className="install-app-banner-ios-steps">
            دکمهٔ{' '}
            <span className="install-app-banner-icon" aria-hidden="true">
              ⬆️
            </span>{' '}
            اشتراک‌گذاری رو بزن، بعد «Add to Home Screen» رو انتخاب کن.
          </p>
        )}
      </div>
    </aside>
  );
}
