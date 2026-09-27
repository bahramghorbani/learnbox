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

function ChapterLandmark({ chapter }: { chapter: GermanyChapter }) {
  if (chapter === 'station') {
    return (
      <svg className="chapter-landmark" data-chapter-landmark="u-bahn" viewBox="0 0 240 220">
        <circle cx="86" cy="84" r="55" />
        <rect x="45" y="43" width="82" height="82" rx="12" />
        <text x="86" y="102" textAnchor="middle">
          U
        </text>
        <path d="M158 40v142M133 182h52M158 66l22 13-22 13-22-13Z" />
      </svg>
    );
  }

  if (chapter === 'rail') {
    return (
      <svg className="chapter-landmark" data-chapter-landmark="bahn-platform" viewBox="0 0 260 220">
        <path d="M28 182h208M54 182V62h150v120M38 62h182" />
        <rect x="82" y="82" width="96" height="48" rx="8" />
        <circle cx="130" cy="106" r="16" />
        <path d="M130 106V94M130 106l10 7M72 148h116" />
      </svg>
    );
  }

  if (chapter === 'street') {
    return (
      <svg className="chapter-landmark" data-chapter-landmark="fernsehturm" viewBox="0 0 220 260">
        <path d="M108 238 97 94h22l-8 144M108 20v48" />
        <circle cx="108" cy="86" r="31" />
        <path d="M78 86h60M91 71h34M92 101h32M70 238h78" />
      </svg>
    );
  }

  if (chapter === 'map') {
    return (
      <svg
        className="chapter-landmark"
        data-chapter-landmark="deutschland-map"
        viewBox="0 0 220 260"
      >
        <path d="m104 18 28 21 27-3 9 26-11 23 18 20-9 26 14 25-26 17-3 33-25 5-21 31-31-13-4-28-22-19 15-31-11-29 21-18-5-34 23-9Z" />
        <circle cx="116" cy="74" r="7" />
        <circle cx="91" cy="145" r="7" />
        <circle cx="126" cy="202" r="7" />
        <path d="M116 74C78 105 136 121 91 145s9 48 35 57" />
      </svg>
    );
  }

  if (chapter === 'park') {
    return (
      <svg className="chapter-landmark" data-chapter-landmark="olympiapark" viewBox="0 0 300 220">
        <path d="M18 180h264M34 178 90 52l58 126L208 38l58 140M49 145c48-48 95-44 142-3 27 23 51 26 75 9M76 80l145 12M112 104l108-36" />
      </svg>
    );
  }

  if (chapter === 'harbor') {
    return (
      <svg
        className="chapter-landmark"
        data-chapter-landmark="elbphilharmonie"
        viewBox="0 0 300 220"
      >
        <path d="M24 188h252V97c-34 24-64-34-96-4-28 27-53-33-79-7-26 27-52-8-77 17Z" />
        <path d="M24 188v-50h252v50M58 142v42M96 142v42M134 142v42M172 142v42M210 142v42M248 142v42" />
      </svg>
    );
  }

  if (chapter === 'square') {
    return (
      <svg
        className="chapter-landmark"
        data-chapter-landmark="brandenburg-gate"
        viewBox="0 0 300 220"
      >
        <path d="M24 188h252M48 176V82h204v94M36 82h228l-20-28H58ZM72 82v94M111 82v94M150 82v94M189 82v94M228 82v94" />
        <path d="M128 54V36h44v18M139 36l11-17 11 17" />
      </svg>
    );
  }

  return (
    <svg className="chapter-landmark" data-chapter-landmark="garden-sign" viewBox="0 0 260 230">
      <path d="M128 214V48M98 214h60" />
      <path d="M48 64h126l32 24-32 24H48ZM214 124H88l-32 24 32 24h126Z" />
      <text x="111" y="94" textAnchor="middle">
        LERNEN
      </text>
      <text x="151" y="154" textAnchor="middle">
        START
      </text>
    </svg>
  );
}

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
        <ChapterLandmark chapter={chapter} />
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
