import Image from 'next/image';

type BoboExpression = 'welcome' | 'encourage' | 'celebrate' | 'recovery' | 'focus';

const boboAssets: Record<BoboExpression, { alt: string; src: string }> = {
  welcome: { alt: 'بوبو با دست‌های باز به تو خوش‌آمد می‌گوید', src: '/images/bobo/welcome-v1.png' },
  encourage: { alt: 'بوبو با لبخند تو را تشویق می‌کند', src: '/images/bobo/encourage-v1.png' },
  celebrate: { alt: 'بوبو موفقیت تو را جشن می‌گیرد', src: '/images/bobo/celebrate-v1.png' },
  recovery: { alt: 'بوبو برای ادامه‌دادن همراه تو است', src: '/images/bobo/recovery-v1.png' },
  focus: { alt: 'بوبو با تمرکز در کنار تو است', src: '/images/bobo/focus-v1.png' },
};

interface BoboProps {
  expression: BoboExpression;
  className?: string;
  priority?: boolean;
}

export function Bobo({ expression, className, priority = false }: BoboProps) {
  const asset = boboAssets[expression];

  return (
    <Image
      className={className}
      src={asset.src}
      alt={asset.alt}
      width={310}
      height={580}
      priority={priority}
      sizes="(max-width: 520px) 33vw, 170px"
    />
  );
}
