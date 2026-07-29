export type GermanyChapter =
  'station' | 'rail' | 'street' | 'map' | 'park' | 'harbor' | 'square' | 'garden';

const chapterMeta: Record<
  GermanyChapter,
  { city: string; context: string; route: string; skyline: string }
> = {
  station: {
    city: 'Berlin · Alexanderplatz',
    context: 'U-Bahn',
    route: 'M28 208C164 110 301 273 506 128S802 106 972 194',
    skyline: 'M0 244V138h76v-38h66v54h82V82h54v62h98V60h68v112h84V104h74v76h92V76h62v94h106v74Z',
  },
  rail: {
    city: 'Berlin → Leipzig → München',
    context: 'Regionalbahn',
    route: 'M18 176C142 72 247 221 391 122S693 88 982 166',
    skyline: 'M0 246V174h108v-36h82v42h96v-78h54v70h120v-44h92v58h88v-92h74v80h128v72Z',
  },
  street: {
    city: 'Berlin · Prenzlauer Berg',
    context: 'die Wohnung',
    route: 'M20 190C222 152 320 215 512 166S786 128 980 178',
    skyline: 'M0 246V86h138v34h36V70h166v64h38V92h174v44h42V58h170v74h42V84h174v162Z',
  },
  map: {
    city: 'Deutschland',
    context: 'dein Weg',
    route: 'M116 216C188 166 240 204 306 148S420 94 492 124 604 202 686 136 822 62 936 104',
    skyline:
      'M0 246V196h94v-42h78v38h110v-68h60v62h112v-34h86v48h112v-78h76v64h110v-52h82v62h80v50Z',
  },
  park: {
    city: 'München · Olympiapark',
    context: 'jeden Tag',
    route: 'M30 206C206 204 250 42 440 118s262 116 526 34',
    skyline:
      'M0 246V212c98-48 172-44 250 0 86-76 180-90 276-12 104-62 212-60 312 4 58-34 108-36 162-6v48Z',
  },
  harbor: {
    city: 'Hamburg · HafenCity',
    context: 'LearnBox UI',
    route: 'M18 184C174 150 310 222 470 170s326-32 510 20',
    skyline:
      'M0 246V190h92v-46h58v50h82v-82h48v76h98v-52h58v58h82v-108h42v104h100v-68h54v70h102v-42h70v96Z',
  },
  square: {
    city: 'Berlin · Stadtmitte',
    context: 'verbunden',
    route: 'M62 190C204 82 324 236 492 134s310-32 450 70',
    skyline:
      'M0 246V152h112v-48h62v54h104v-90h54v82h116V96h60v62h110v-76h52v68h124v-40h70v44h136v92Z',
  },
  garden: {
    city: 'Deutschland · ein neuer Weg',
    context: 'der Anfang',
    route: 'M118 246C196 180 256 218 354 156S548 104 632 144 770 202 912 82',
    skyline:
      'M0 246V220c106-54 190-42 276 0 76-72 174-92 270-12 106-82 228-80 328 4 48-26 86-28 126-10v44Z',
  },
};

export function GermanyChapterBackdrop({ chapter }: { chapter: GermanyChapter }) {
  const meta = chapterMeta[chapter];

  return (
    <div
      className={`germany-chapter germany-chapter--${chapter}`}
      data-chapter-backdrop={chapter}
      aria-hidden="true"
    >
      <div className="chapter-layer chapter-layer--far" data-chapter-layer="far">
        <span className="chapter-sun" />
        <span className="chapter-cloud chapter-cloud--one" />
        <span className="chapter-cloud chapter-cloud--two" />
        <svg viewBox="0 0 1000 260" preserveAspectRatio="none">
          <path d={meta.skyline} />
        </svg>
      </div>

      <div className="chapter-layer chapter-layer--mid" data-chapter-layer="mid">
        <div className="chapter-architecture">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="chapter-train">
          <b />
          <b />
          <b />
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="chapter-layer chapter-layer--route" data-chapter-layer="route">
        <svg viewBox="0 0 1000 280" preserveAspectRatio="none">
          <path className="chapter-route-path" data-chapter-route d={meta.route} />
          <circle cx="118" cy="208" r="8" />
          <circle cx="492" cy="134" r="8" />
          <circle cx="912" cy="104" r="8" />
        </svg>
      </div>

      <div className="chapter-layer chapter-layer--near" data-chapter-layer="near">
        <span className="chapter-plant chapter-plant--one" />
        <span className="chapter-plant chapter-plant--two" />
        <span className="chapter-platform" />
      </div>

      <div className="chapter-layer chapter-layer--accent" data-chapter-layer="accent">
        <span className="chapter-location">{meta.city}</span>
        <span className="chapter-context" lang="de">
          {meta.context}
        </span>
        <i className="chapter-signal chapter-signal--one" />
        <i className="chapter-signal chapter-signal--two" />
        <i className="chapter-signal chapter-signal--three" />
      </div>
    </div>
  );
}
