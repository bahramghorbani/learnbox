import Image from 'next/image';
import type { SummerScene } from './tokens';

const scenes: Record<SummerScene, { src: string; position: string }> = {
  berlin: {
    src: '/themes/summer/backgrounds/berlin-summer-v3.jpg',
    position: '42% center',
  },
  rhine: {
    src: '/themes/summer/backgrounds/rhine-summer-v3.jpg',
    position: '38% center',
  },
};

type SummerBackdropProps = {
  scene?: SummerScene;
  priority?: boolean;
  className?: string;
};

export function SummerBackdrop({
  scene = 'berlin',
  priority = false,
  className = '',
}: SummerBackdropProps) {
  const image = scenes[scene];

  return (
    <div
      className={`summer-backdrop summer-backdrop--${scene} ${className}`}
      aria-hidden="true"
      data-summer-backdrop={scene}
    >
      <div className="summer-layer summer-layer--sky" data-summer-layer="sky">
        <Image
          src={image.src}
          alt=""
          fill
          priority={priority}
          sizes="100vw"
          quality={86}
          style={{ objectFit: 'cover', objectPosition: image.position }}
        />
      </div>
      <div className="summer-layer summer-layer--clouds" data-summer-layer="clouds">
        <span />
        <span />
        <span />
      </div>
      <div className="summer-layer summer-layer--architecture" data-summer-layer="architecture" />
      <div className="summer-layer summer-layer--light" data-summer-layer="light" />
      <div className="summer-layer summer-layer--foliage" data-summer-layer="foliage">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="summer-layer summer-layer--particles" data-summer-layer="particles">
        <b />
        <b />
        <b />
        <b />
      </div>
    </div>
  );
}
