import Image from 'next/image';
import { GermanyChapterBackdrop } from '../../../src/themes/summer';
import {
  productStoryInterfaceNote,
  productStoryStages,
  type ProductStoryStage as ProductStoryStageData,
} from './product-story-data';

const productImageSizes = '(max-width: 720px) 86vw, (max-width: 1100px) 44vw, 420px';

type ProductStoryStageProps = {
  stage: ProductStoryStageData;
  index: number;
};

function ProductStoryStage({ stage, index }: ProductStoryStageProps) {
  const titleId = `product-stage-${stage.id}-title`;

  return (
    <article
      id={`product-stage-${stage.id}`}
      className="product-story__stage"
      data-product-stage={stage.id}
      data-product-place={stage.place}
      aria-labelledby={titleId}
      aria-current={index === 0 ? 'true' : undefined}
    >
      <p className="product-story__eyebrow">{stage.eyebrow}</p>
      <h3 id={titleId}>{stage.title}</h3>
      <p>{stage.description}</p>
    </article>
  );
}

export function ProductStory(): React.JSX.Element {
  return (
    <section
      id="product"
      className="scene product-story"
      data-motion="product-story"
      data-scene
      aria-labelledby="product-story-title"
    >
      <GermanyChapterBackdrop chapter="harbor" />
      <div className="wrap product-story__layout">
        <div className="product-story__copy">
          <header className="product-story__header chapter-heading-veil">
            <span>محیط واقعی یادگیری</span>
            <h2 id="product-story-title">یادگیری ساده، منظم و همیشه در دسترس.</h2>
            <p>
              مرورهای امروز، میزان پیشرفت و واژه‌هایی که به تمرین بیشتری نیاز دارند، همه در یک محیط
              روشن و قابل‌فهم در اختیار تو هستند.
            </p>
          </header>

          {productStoryStages.map((stage, index) => (
            <ProductStoryStage key={stage.id} stage={stage} index={index} />
          ))}

          <p className="product-story__disclosure">{productStoryInterfaceNote}</p>
        </div>

        <div data-product-device role="group" aria-label="چهار نمای واقعی از مسیر یادگیری LearnBox">
          <span className="product-story__speaker" aria-hidden="true" />
          {productStoryStages.map((stage, index) => (
            <figure key={stage.id} data-product-screen={stage.id} data-product-place={stage.place}>
              <Image
                src={stage.image.src}
                alt={stage.image.alt}
                width={1080}
                height={1920}
                sizes={productImageSizes}
                priority={index === 0}
                loading={index === 0 ? undefined : 'lazy'}
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
