import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  productStoryInterfaceNote,
  productStoryStages,
} from '../app/components/landing/product-story-data.ts';

const appRoot = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const sourceExtensions = new Set(['.ts', '.tsx', '.css']);

function collectSource(directory) {
  if (!existsSync(directory)) return '';

  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSource(path);
      if (!sourceExtensions.has(extname(entry.name))) return '';
      return readFileSync(path, 'utf8');
    })
    .join('\n');
}

const landingSource = collectSource(join(appRoot, 'app'));
const themeSource = collectSource(join(appRoot, 'src', 'themes', 'summer'));
const allSource = `${landingSource}\n${themeSource}`;
const normalizedSource = allSource.replace(/\s+/g, ' ');
const productScreenRoot = join(appRoot, 'public', 'product', 'screens', 'v1');
const fictionalMockupSources = [
  join(appRoot, 'app', 'components', 'landing', 'LandingExperience.tsx'),
  join(appRoot, 'app', 'globals.css'),
]
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
const productStoryPath = join(appRoot, 'app', 'components', 'landing', 'ProductStory.tsx');
const motionOrchestratorSource = readFileSync(
  join(appRoot, 'app', 'components', 'MotionOrchestrator.tsx'),
  'utf8',
);
const globalCssSource = readFileSync(join(appRoot, 'app', 'globals.css'), 'utf8');

function renderProductStory() {
  const typescript = require('typescript');
  const originalTsLoader = Module._extensions['.ts'];
  const originalTsxLoader = Module._extensions['.tsx'];
  const transpile = (module, filename) => {
    const output = typescript.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        jsx: typescript.JsxEmit.ReactJSX,
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;

    module._compile(output, filename);
  };

  Module._extensions['.ts'] = transpile;
  Module._extensions['.tsx'] = transpile;

  try {
    const { ProductStory } = require(productStoryPath);
    const { renderToStaticMarkup } = require('react-dom/server');
    return renderToStaticMarkup(ProductStory());
  } finally {
    if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
    else delete Module._extensions['.ts'];
    if (originalTsxLoader) Module._extensions['.tsx'] = originalTsxLoader;
    else delete Module._extensions['.tsx'];
  }
}

function openingTags(markup, tagName) {
  return markup.match(new RegExp(`<${tagName}\\b[^>]*>`, 'g')) ?? [];
}

function waitForChromeEndpoint(chrome) {
  return new Promise((resolveEndpoint, rejectEndpoint) => {
    let stderr = '';
    const timeout = setTimeout(
      () => rejectEndpoint(new Error(`Chrome DevTools endpoint timed out:\n${stderr}`)),
      10_000,
    );

    chrome.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolveEndpoint({ browserWebSocketUrl: match[1], port: Number(match[2]) });
    });
    chrome.once('exit', (code) => {
      clearTimeout(timeout);
      rejectEndpoint(new Error(`Chrome exited before DevTools was ready (${code}):\n${stderr}`));
    });
  });
}

async function openChromePage(port, url, viewport, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, {
    method: 'PUT',
  });
  assert.equal(response.status, 200);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const networkFailures = [];
  const networkErrorResponses = [];
  const consoleIssues = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
        networkFailures.push({
          errorText: message.params.errorText,
          type: message.params.type,
        });
      }
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
        networkErrorResponses.push({
          status: message.params.response.status,
          type: message.params.type,
          url: message.params.response.url,
        });
      }
      if (
        message.method === 'Runtime.consoleAPICalled' &&
        ['error', 'warning'].includes(message.params.type)
      ) {
        consoleIssues.push({
          type: message.params.type,
          text: message.params.args
            .map((argument) => argument.value ?? argument.description)
            .join(' '),
        });
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleIssues.push({
          type: 'exception',
          text:
            message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text,
        });
      }
      return;
    }
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolveRequest, rejectRequest) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  };

  await send('Page.enable');
  await send('DOM.enable');
  await send('Page.bringToFront');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', viewport);
  if (options.javaScriptDisabled) {
    await send('Emulation.setScriptExecutionDisabled', { value: true });
  }
  await send('Emulation.setEmulatedMedia', {
    features: [
      {
        name: 'prefers-reduced-motion',
        value: options.reducedMotion ? 'reduce' : 'no-preference',
      },
    ],
  });
  await send('Page.navigate', { url });
  let documentReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await send('Runtime.evaluate', {
      expression: `location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`,
      returnByValue: true,
    }).catch(() => null);
    if (ready?.result?.value) {
      documentReady = true;
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  assert.ok(documentReady, `Chrome did not finish navigating to ${url}`);
  if (!options.javaScriptDisabled) {
    await evaluate(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
    );
  }

  return {
    evaluate,
    getMarkup: async () => {
      const { root } = await send('DOM.getDocument', { depth: 0 });
      const { outerHTML } = await send('DOM.getOuterHTML', { nodeId: root.nodeId });
      return outerHTML;
    },
    getConsoleIssues: () => [...consoleIssues],
    getNetworkErrorResponses: () => [...networkErrorResponses],
    getNetworkFailures: () => [...networkFailures],
    setReducedMotion: async (reducedMotion) => {
      await send('Emulation.setEmulatedMedia', {
        features: [
          {
            name: 'prefers-reduced-motion',
            value: reducedMotion ? 'reduce' : 'no-preference',
          },
        ],
      });
    },
    setViewport: async (viewport) => {
      await send('Emulation.setDeviceMetricsOverride', viewport);
    },
    captureScreenshot: async (path) => {
      const { data } = await send('Page.captureScreenshot', {
        captureBeyondViewport: false,
        format: 'png',
        fromSurface: true,
      });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    pressTab: async () => {
      const event = {
        code: 'Tab',
        key: 'Tab',
        nativeVirtualKeyCode: 9,
        windowsVirtualKeyCode: 9,
      };
      await send('Input.dispatchKeyEvent', { ...event, type: 'keyDown' });
      await send('Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
    },
    close: () => socket.close(),
  };
}

const canonicalBuBuHashes = {
  'cards-recovery-v3.png': 'fbe865ab977b9f1388c7713854cb11bb828fa5a51efb5666035502bc16ed1453',
  'finale-invite-v3.png': 'a95193a4fb843d41c5139366eabe9f9038e9ce3e995ae4730d9bead825b2c43a',
  'hero-wave-v3.png': '6a2caa8ad1421398df407aa60549c67df7e528f033fa34851e7c1f89cbd1887c',
  'learning-focus-v3.png': 'ae65486a2341f3efac15f8b73809119ec3181b8a383586a48dba71f18cfe9085',
  'progress-celebrate-v3.png': '06b57dee703c6660c0a2f334e8531ae2240a278266d3c43e3e984a6b397b4a8c',
};

const themedBuBuAssets = [
  {
    filename: 'hero-traveler.png',
    alt: 'BuBu، همراه سفر تابستانی LearnBox، در برلین',
    sizes: '(max-width: 720px) 64vw, 510px',
    loading: 'auto',
    fetchPriority: 'high',
  },
  {
    filename: 'card-organizer.png',
    alt: 'BuBu در حال مرتب‌کردن کارت‌های مرور فراموش‌شده',
    sizes: '(max-width: 720px) 64vw, 410px',
    loading: 'lazy',
    fetchPriority: 'auto',
  },
  {
    filename: 'language-coach.png',
    alt: 'نمای نزدیک BuBu، مربی واژه و تلفظ آلمانی',
    sizes: '260px',
    loading: 'lazy',
    fetchPriority: 'auto',
  },
  {
    filename: 'progress-achiever.png',
    alt: 'BuBu در حال جشن‌گرفتن نشان پیشرفت روزانه',
    sizes: '(max-width: 720px) 62vw, 360px',
    loading: 'lazy',
    fetchPriority: 'auto',
  },
  {
    filename: 'journey-companion.png',
    alt: 'BuBu، همراه مسیر، با نقشهٔ تاشده در حال دعوت به شروع یادگیری',
    sizes: '(max-width: 720px) 68vw, 420px',
    loading: 'lazy',
    fetchPriority: 'auto',
  },
];

test('keeps five versioned themed BuBu files without changing canonical assets', () => {
  const themedRoot = join(appRoot, 'public', 'themes', 'summer', 'bubu-themed', 'v1');
  for (const { filename } of themedBuBuAssets) {
    assert.ok(existsSync(join(themedRoot, filename)), `Missing themed BuBu asset: ${filename}`);
  }

  const bubuRoot = join(appRoot, 'public', 'themes', 'summer', 'bubu');
  for (const [filename, expectedHash] of Object.entries(canonicalBuBuHashes)) {
    const actualHash = createHash('sha256')
      .update(readFileSync(join(bubuRoot, filename)))
      .digest('hex');
    assert.equal(actualHash, expectedHash, `Canonical BuBu asset changed: ${filename}`);
  }
});

test('locks the truthful product-story contract and versioned assets', () => {
  assert.deepEqual(
    productStoryStages.map(({ id }) => id),
    ['start', 'today', 'return', 'progress'],
  );
  assert.equal(new Set(productStoryStages.map(({ image }) => image.src)).size, 4);

  for (const stage of productStoryStages) {
    assert.equal(stage.image.width, 1080);
    assert.equal(stage.image.height, 1920);
    assert.match(stage.image.alt, /LearnBox/);
    assert.ok(
      existsSync(join(appRoot, 'public', stage.image.src)),
      `Missing product screen: ${stage.image.src}`,
    );
    assert.doesNotMatch(
      `${stage.eyebrow} ${stage.title} ${stage.description}`,
      /منتشر شده|هم‌اکنون دانلود|بازار|مایکت|App Store|اپ[‌ ]?استور/,
      `Unsupported marketplace or release claim in ${stage.id}`,
    );
  }

  for (const filename of [
    'start-journey.jpeg',
    'today.jpeg',
    'calm-return.jpeg',
    'progress.jpeg',
  ]) {
    assert.ok(
      existsSync(join(productScreenRoot, filename)),
      `Missing versioned screen: ${filename}`,
    );
  }

  const bubuRoot = join(appRoot, 'public', 'themes', 'summer', 'bubu');
  for (const [filename, expectedHash] of Object.entries(canonicalBuBuHashes)) {
    const actualHash = createHash('sha256')
      .update(readFileSync(join(bubuRoot, filename)))
      .digest('hex');
    assert.equal(actualHash, expectedHash, `Canonical BuBu asset changed: ${filename}`);
  }
});

test('renders four accessible product stages with truthful copy and passive screenshots', () => {
  assert.ok(existsSync(productStoryPath), 'ProductStory component must exist');
  const markup = renderProductStory();
  const section = openingTags(markup, 'section').find((tag) => tag.includes('id="product"'));
  const stageArticles = openingTags(markup, 'article').filter((tag) =>
    tag.includes('data-product-stage='),
  );
  const screenFigures = openingTags(markup, 'figure').filter((tag) =>
    tag.includes('data-product-screen='),
  );
  const device = openingTags(markup, 'div').find((tag) => tag.includes('data-product-device'));

  assert.match(section ?? '', /data-motion="product-story"/);
  assert.match(section ?? '', /aria-labelledby="product-story-title"/);
  assert.deepEqual(
    stageArticles.map((tag) => tag.match(/data-product-stage="([^"]+)"/)?.[1]),
    ['start', 'today', 'return', 'progress'],
  );
  assert.match(stageArticles[0], /aria-current="true"/);
  assert.ok(
    stageArticles.slice(1).every((tag) => !tag.includes('aria-current=')),
    'Only the first server-rendered stage may be current before deferred motion loads',
  );
  assert.deepEqual(
    screenFigures.map((tag) => tag.match(/data-product-screen="([^"]+)"/)?.[1]),
    ['start', 'today', 'return', 'progress'],
  );
  assert.match(device ?? '', /role="group"/);
  assert.match(device ?? '', /aria-label="[^"]*LearnBox[^"]*"/);
  assert.match(markup, new RegExp(productStoryInterfaceNote));
  assert.doesNotMatch(markup, /app-screen--(?:back|middle|front)/);

  for (const stage of productStoryStages) {
    assert.equal(
      markup.split(stage.title).length - 1,
      1,
      `Stage title must render once: ${stage.id}`,
    );
    assert.equal(
      markup.split(stage.description).length - 1,
      1,
      `Stage description must render once: ${stage.id}`,
    );
  }
});

test('renders responsive screenshot dimensions with only the first image prioritized', () => {
  const markup = renderProductStory();
  const images = openingTags(markup, 'img');

  assert.equal(images.length, 4);
  for (const image of images) {
    assert.match(image, /width="1080"/);
    assert.match(image, /height="1920"/);
    assert.match(image, /sizes="\(max-width: 720px\) 86vw, \(max-width: 1100px\) 44vw, 420px"/);
  }
  assert.doesNotMatch(images[0], /loading="lazy"/);
  assert.ok(
    images.slice(1).every((image) => image.includes('loading="lazy"')),
    'Only the first product screenshot may load eagerly',
  );
});

test('removes every fictional app-screen source', () => {
  assert.doesNotMatch(
    `${fictionalMockupSources}\n${motionOrchestratorSource}`,
    /(?:\.product-scene|\.app-screen--(?:back|middle|front))/,
  );
});

const browserLayoutUrl = process.env.LEARNBOX_BROWSER_LAYOUT_URL;
test(
  'keeps the phone viewport-sticky on desktop and renders four unpinned mobile cards',
  { skip: browserLayoutUrl ? false : 'set LEARNBOX_BROWSER_LAYOUT_URL to a built local preview' },
  async (t) => {
    const chromePath =
      process.env.LEARNBOX_CHROME_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    assert.ok(existsSync(chromePath), `Chrome binary is missing: ${chromePath}`);
    const profile = mkdtempSync(join(tmpdir(), 'learnbox-layout-chrome-'));
    const chrome = spawn(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--remote-debugging-port=0',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    t.after(async () => {
      if (chrome.exitCode === null && chrome.signalCode === null) {
        const exited = new Promise((resolveExit) => chrome.once('exit', resolveExit));
        chrome.kill('SIGTERM');
        await exited;
      }
      rmSync(profile, { force: true, recursive: true });
    });

    const { port } = await waitForChromeEndpoint(chrome);
    const preview = await fetch(browserLayoutUrl);
    assert.equal(preview.status, 200, `Preview URL is not ready: ${browserLayoutUrl}`);
    const browserSurfaces = [];

    const desktop = await openChromePage(port, browserLayoutUrl, {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    t.after(desktop.close);
    browserSurfaces.push({ label: 'desktop 1440x1000', page: desktop });
    const themedBubuBrowser = await desktop.evaluate(`(async () => {
      const expected = ${JSON.stringify(themedBuBuAssets)};
      const details = [];
      document.documentElement.style.scrollBehavior = 'auto';
      for (const asset of expected) {
        const image = Array.from(document.images).find(
          (candidate) =>
            candidate.src.includes(asset.filename) ||
            candidate.srcset.includes(asset.filename)
        );
        if (!image) {
          details.push({ filename: asset.filename, missing: true });
          continue;
        }
        image.scrollIntoView({ block: 'center', behavior: 'instant' });
        await image.decode();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        details.push({
          filename: asset.filename,
          missing: false,
          src: decodeURIComponent(image.getAttribute('src') ?? ''),
          srcset: decodeURIComponent(image.getAttribute('srcset') ?? ''),
          currentSrc: decodeURIComponent(image.currentSrc),
          alt: image.alt,
          width: image.getAttribute('width'),
          height: image.getAttribute('height'),
          sizes: image.sizes,
          loading: image.loading,
          fetchPriority: image.fetchPriority,
          decoding: image.decoding,
          decodeSucceeded: true,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          requested: performance
            .getEntriesByType('resource')
            .some((entry) => entry.name === image.currentSrc)
        });
      }
      return details;
    })()`);
    assert.equal(themedBubuBrowser.length, 5);
    for (const expected of themedBuBuAssets) {
      const image = themedBubuBrowser.find(({ filename }) => filename === expected.filename);
      assert.equal(image?.missing, false, `Rendered themed BuBu is missing: ${expected.filename}`);
      const publicPath = `/themes/summer/bubu-themed/v1/${expected.filename}`;
      assert.match(image.src, new RegExp(publicPath));
      assert.match(image.srcset, new RegExp(publicPath));
      assert.match(image.currentSrc, new RegExp(publicPath));
      assert.equal(image.alt, expected.alt);
      assert.equal(image.width, '1024');
      assert.equal(image.height, '1536');
      assert.equal(image.sizes, expected.sizes);
      assert.equal(image.loading, expected.loading);
      assert.equal(image.fetchPriority, expected.fetchPriority);
      assert.equal(image.decoding, 'async');
      assert.equal(
        image.decodeSucceeded,
        true,
        `Themed BuBu failed to decode: ${expected.filename}`,
      );
      assert.equal(image.complete, true);
      assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0);
      assert.equal(image.requested, true, `No successful image request: ${expected.filename}`);
    }
    assert.equal(
      themedBubuBrowser.filter(({ loading }) => loading === 'lazy').length,
      4,
      'Exactly four secondary themed BuBu images must be lazy-loaded',
    );
    t.diagnostic(`themed BuBu browser contract: ${JSON.stringify(themedBubuBrowser)}`);

    const desktopLayout = await desktop.evaluate(`(async () => {
      const settle = () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      const story = document.querySelector('#product');
      const device = story.querySelector('[data-product-device]');
      const wrapper = document.querySelector('.site-v3');
      document.documentElement.style.scrollBehavior = 'auto';
      const storyTop = story.getBoundingClientRect().top + scrollY;
      const lastScroll = storyTop + story.offsetHeight - innerHeight - 100;
      const firstScroll = Math.min(storyTop + 260, lastScroll - 900);
      const secondScroll = Math.min(firstScroll + 800, lastScroll);
      scrollTo({ top: firstScroll, behavior: 'instant' });
      await settle();
      const actualFirstScroll = scrollY;
      const firstTop = device.getBoundingClientRect().top;
      scrollTo({ top: secondScroll, behavior: 'instant' });
      await settle();
      const actualSecondScroll = scrollY;
      const secondTop = device.getBoundingClientRect().top;
      const wrapperStyle = getComputedStyle(wrapper);
      return {
        firstScroll,
        secondScroll,
        actualFirstScroll,
        actualSecondScroll,
        firstTop,
        secondTop,
        position: getComputedStyle(device).position,
        wrapperOverflowX: wrapperStyle.overflowX,
        wrapperOverflowY: wrapperStyle.overflowY
      };
    })()`);
    assert.equal(desktopLayout.position, 'sticky');
    assert.ok(desktopLayout.secondScroll - desktopLayout.firstScroll >= 700);
    assert.ok(
      desktopLayout.firstTop >= 23 && desktopLayout.firstTop <= 89,
      `Desktop phone did not reach its viewport sticky inset: ${JSON.stringify(desktopLayout)}`,
    );
    assert.ok(
      Math.abs(desktopLayout.secondTop - desktopLayout.firstTop) <= 2,
      `Desktop phone moved ${desktopLayout.secondTop - desktopLayout.firstTop}px over an ${
        desktopLayout.secondScroll - desktopLayout.firstScroll
      }px page scroll: ${JSON.stringify(desktopLayout)}`,
    );
    t.diagnostic(`desktop 1440x1000: ${JSON.stringify(desktopLayout)}`);

    const desktopStageSync = await desktop.evaluate(`(async () => {
      const settle = (duration = 620) =>
        new Promise((resolve) => setTimeout(resolve, duration));
      const ids = ['start', 'today', 'return', 'progress'];
      let motionReady = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (document.querySelector('[data-product-screen].is-product-screen-active')) {
          motionReady = true;
          break;
        }
        await settle(100);
      }

      const visit = async (id) => {
        const stage = document.querySelector('[data-product-stage="' + id + '"]');
        const top = stage.getBoundingClientRect().top + scrollY - innerHeight * 0.32;
        scrollTo({ top, behavior: 'instant' });
        await settle();
        const current = document.querySelector('[data-product-stage][aria-current="true"]');
        const activeScreen = document.querySelector(
          '[data-product-screen].is-product-screen-active'
        );
        const activeStyle = activeScreen ? getComputedStyle(activeScreen) : null;
        const currentStyle = current ? getComputedStyle(current) : null;
        const inactiveStage = Array.from(
          document.querySelectorAll('[data-product-stage]')
        ).find((candidate) => candidate !== current);
        const inactiveStyle = inactiveStage ? getComputedStyle(inactiveStage) : null;
        return {
          requested: id,
          current: current?.dataset.productStage ?? null,
          activeScreen: activeScreen?.dataset.productScreen ?? null,
          activeOpacity: activeStyle ? Number(activeStyle.opacity) : null,
          activeTransform: activeStyle?.transform ?? null,
          activeShadow: activeStyle?.boxShadow ?? null,
          currentOpacity: currentStyle ? Number(currentStyle.opacity) : null,
          currentShadow: currentStyle?.boxShadow ?? null,
          inactiveStageOpacity: inactiveStyle ? Number(inactiveStyle.opacity) : null,
          activeScreens: document.querySelectorAll(
            '[data-product-screen].is-product-screen-active'
          ).length,
          currentStages: document.querySelectorAll(
            '[data-product-stage][aria-current="true"]'
          ).length
        };
      };

      const down = [];
      for (const id of ids) down.push(await visit(id));
      const up = [];
      for (const id of ids.slice(0, -1).reverse()) up.push(await visit(id));
      return { motionReady, down, up };
    })()`);
    assert.equal(desktopStageSync.motionReady, true);
    for (const state of [...desktopStageSync.down, ...desktopStageSync.up]) {
      assert.equal(state.current, state.requested);
      assert.equal(state.activeScreen, state.requested);
      assert.equal(state.activeScreens, 1);
      assert.equal(state.currentStages, 1);
      assert.ok(state.activeOpacity >= 0.99);
      assert.notEqual(state.activeTransform, 'none');
      assert.notEqual(state.activeShadow, 'none');
      assert.equal(state.currentOpacity, 1);
      assert.ok(state.inactiveStageOpacity <= 0.69);
      assert.notEqual(state.currentShadow, 'none');
    }
    t.diagnostic(`desktop stage sync: ${JSON.stringify(desktopStageSync)}`);

    const readResponsiveMotionState = async () =>
      desktop.evaluate(`(() => {
        const device = document.querySelector('[data-product-device]');
        const stages = Array.from(document.querySelectorAll('[data-product-stage]'));
        const screens = Array.from(document.querySelectorAll('[data-product-screen]'));
        const styleOf = (element) => {
          const style = getComputedStyle(element);
          return {
            opacity: Number(style.opacity),
            position: style.position,
            transform: style.transform,
            visibility: style.visibility
          };
        };
        return {
          profile: document.documentElement.dataset.motionProfile,
          deviceDisplay: getComputedStyle(device).display,
          devicePosition: getComputedStyle(device).position,
          activeScreens: screens.filter((screen) =>
            screen.classList.contains('is-product-screen-active')
          ).length,
          hiddenScreens: screens.filter((screen) => screen.hasAttribute('aria-hidden')).length,
          screenStyles: screens.map(styleOf),
          stageStyles: stages.map(styleOf)
        };
      })()`);

    await desktop.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    const resizedMobileState = await readResponsiveMotionState();
    assert.equal(resizedMobileState.profile, 'mobile');
    assert.equal(resizedMobileState.deviceDisplay, 'contents');
    assert.equal(resizedMobileState.activeScreens, 0);
    assert.equal(resizedMobileState.hiddenScreens, 0);
    for (const state of resizedMobileState.screenStyles) {
      assert.equal(state.position, 'relative');
      assert.equal(state.opacity, 1);
      assert.equal(state.transform, 'none');
      assert.equal(state.visibility, 'visible');
    }
    t.diagnostic(`same-page desktop to mobile: ${JSON.stringify(resizedMobileState)}`);

    await desktop.setViewport({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 1700));
    const restoredDesktopState = await desktop.evaluate(`(async () => {
      const stage = document.querySelector('[data-product-stage="today"]');
      const top = stage.getBoundingClientRect().top + scrollY - innerHeight * 0.32;
      scrollTo({ top, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 700));
      return {
        profile: document.documentElement.dataset.motionProfile,
        activeScreen: document.querySelector(
          '[data-product-screen].is-product-screen-active'
        )?.dataset.productScreen ?? null,
        currentStage: document.querySelector(
          '[data-product-stage][aria-current="true"]'
        )?.dataset.productStage ?? null,
        hiddenScreens: document.querySelectorAll('[data-product-screen][aria-hidden]').length
      };
    })()`);
    assert.equal(restoredDesktopState.profile, 'full');
    assert.equal(restoredDesktopState.activeScreen, 'today');
    assert.equal(restoredDesktopState.currentStage, 'today');
    assert.equal(restoredDesktopState.hiddenScreens, 4);
    t.diagnostic(`same-page mobile to desktop: ${JSON.stringify(restoredDesktopState)}`);

    await desktop.setReducedMotion(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const toggledReducedState = await readResponsiveMotionState();
    assert.equal(toggledReducedState.profile, 'reduced');
    assert.equal(toggledReducedState.devicePosition, 'static');
    assert.equal(toggledReducedState.activeScreens, 0);
    assert.equal(toggledReducedState.hiddenScreens, 0);
    for (const state of [...toggledReducedState.stageStyles, ...toggledReducedState.screenStyles]) {
      assert.equal(state.position, 'static');
      assert.equal(state.opacity, 1);
      assert.equal(state.transform, 'none');
      assert.equal(state.visibility, 'visible');
    }
    t.diagnostic(`same-page reduced motion enabled: ${JSON.stringify(toggledReducedState)}`);

    await desktop.setReducedMotion(false);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    const restoredFullMotionState = await desktop.evaluate(`(() => ({
      profile: document.documentElement.dataset.motionProfile,
      activeScreens: document.querySelectorAll(
        '[data-product-screen].is-product-screen-active'
      ).length,
      hiddenScreens: document.querySelectorAll('[data-product-screen][aria-hidden]').length
    }))()`);
    assert.equal(restoredFullMotionState.profile, 'full');
    assert.equal(restoredFullMotionState.activeScreens, 1);
    assert.equal(restoredFullMotionState.hiddenScreens, 4);
    t.diagnostic(`same-page full motion restored: ${JSON.stringify(restoredFullMotionState)}`);

    await desktop.evaluate(`scrollTo({ top: 0, behavior: 'instant' })`);
    const keyboardTrail = [];
    for (let index = 0; index < 22; index += 1) {
      await desktop.pressTab();
      keyboardTrail.push(
        await desktop.evaluate(`(() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          return {
            focusVisible: element.matches(':focus-visible'),
            href: element.getAttribute('href'),
            label: (element.getAttribute('aria-label') || element.textContent || '')
              .trim()
              .replace(/\\s+/g, ' '),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            scrollY,
            tagName: element.tagName
        };
        })()`),
      );
    }
    t.diagnostic(`keyboard trail: ${JSON.stringify(keyboardTrail)}`);
    const keyboardTargets = keyboardTrail.filter((focus) =>
      ['A', 'BUTTON'].includes(focus.tagName),
    );
    for (const focus of keyboardTargets) {
      assert.ok(focus.label.length > 0, `Keyboard target lacks an accessible name: ${focus.href}`);
      assert.equal(
        focus.focusVisible,
        true,
        `Keyboard target is not focus-visible: ${focus.label}`,
      );
      assert.notEqual(focus.outlineStyle, 'none');
      assert.notEqual(focus.outlineWidth, '0px');
    }
    for (const href of [
      '#main-story',
      '#method',
      '#paths',
      '#product',
      '#download',
      'https://t.me/learnboxapp',
      '/privacy',
      '/terms',
      'mailto:hi@learnboxapp.com',
    ]) {
      assert.ok(
        keyboardTrail.some((focus) => focus.href === href),
        `Keyboard navigation never reached ${href}`,
      );
    }
    assert.ok(keyboardTrail.at(-1).scrollY > 0, 'Keyboard traversal never reached the footer');

    const mobile = await openChromePage(port, browserLayoutUrl, {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    t.after(mobile.close);
    browserSurfaces.push({ label: 'mobile 390x844', page: mobile });
    const mobileLayout = await mobile.evaluate(`(async () => {
      const settle = () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      const device = document.querySelector('[data-product-device]');
      const screens = Array.from(document.querySelectorAll('[data-product-screen]'));
      const container = document.querySelector('.product-story__layout');
      document.documentElement.style.scrollBehavior = 'auto';
      const details = screens.map((screen) => {
        const id = screen.dataset.productScreen;
        const article = document.querySelector('[data-product-stage="' + id + '"]');
        const screenRect = screen.getBoundingClientRect();
        const articleRect = article.getBoundingClientRect();
        const style = getComputedStyle(screen);
        return {
          id,
          documentTop: screenRect.top + scrollY,
          documentBottom: screenRect.bottom + scrollY,
          articleTop: articleRect.top + scrollY,
          articleBottom: articleRect.bottom + scrollY,
          articleLeft: articleRect.left,
          articleRight: articleRect.right,
          screenLeft: screenRect.left,
          screenRight: screenRect.right,
          position: style.position,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          width: screenRect.width,
          height: screenRect.height
        };
      });
      const first = screens[0];
      const firstDocumentTop = first.getBoundingClientRect().top + scrollY;
      scrollTo({ top: firstDocumentTop - 120, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await settle();
      const firstTop = first.getBoundingClientRect().top;
      scrollBy({ top: 120, behavior: 'instant' });
      await settle();
      const secondTop = first.getBoundingClientRect().top;
      const containerRect = container.getBoundingClientRect();
      return {
        viewportWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        containerLeft: containerRect.left,
        containerRight: containerRect.right,
        deviceDisplay: getComputedStyle(device).display,
        details,
        scrollDelta: 120,
        firstTop,
        secondTop,
        motionProfile: document.documentElement.dataset.motionProfile,
        activeScreens: document.querySelectorAll(
          '[data-product-screen].is-product-screen-active'
        ).length,
        runtimeHiddenScreens: screens.filter((screen) => screen.hasAttribute('aria-hidden')).length
      };
    })()`);

    assert.equal(mobileLayout.motionProfile, 'mobile');
    assert.equal(mobileLayout.activeScreens, 0);
    assert.equal(mobileLayout.runtimeHiddenScreens, 0);
    assert.equal(mobileLayout.deviceDisplay, 'contents');
    assert.ok(
      mobileLayout.pageScrollWidth <= mobileLayout.viewportWidth + 1,
      `Mobile page overflows horizontally: ${JSON.stringify(mobileLayout)}`,
    );
    assert.equal(mobileLayout.details.length, 4);
    assert.deepEqual(
      mobileLayout.details.map(({ id }) => id),
      ['start', 'today', 'return', 'progress'],
    );
    for (const detail of mobileLayout.details) {
      assert.equal(detail.position, 'relative');
      assert.equal(detail.visibility, 'visible');
      assert.equal(detail.opacity, 1);
      assert.ok(detail.width > 0 && detail.height > 0);
      assert.ok(
        detail.articleLeft >= Math.max(0, mobileLayout.containerLeft) - 1 &&
          detail.articleRight <=
            Math.min(mobileLayout.viewportWidth, mobileLayout.containerRight) + 1,
        `Mobile stage ${detail.id} escapes its container or viewport: ${JSON.stringify(detail)}`,
      );
      assert.ok(
        detail.screenLeft >= Math.max(0, mobileLayout.containerLeft) - 1 &&
          detail.screenRight <=
            Math.min(mobileLayout.viewportWidth, mobileLayout.containerRight) + 1,
        `Mobile screen ${detail.id} escapes its container or viewport: ${JSON.stringify(detail)}`,
      );
      assert.ok(
        detail.documentTop >= detail.articleBottom - 1,
        `Mobile screen ${detail.id} must follow its matching stage: ${JSON.stringify(detail)}`,
      );
    }
    for (let index = 1; index < mobileLayout.details.length; index += 1) {
      assert.ok(
        mobileLayout.details[index - 1].documentBottom <=
          mobileLayout.details[index].articleTop + 1,
        `Mobile stage/screen pairs overlap or render out of order: ${JSON.stringify(
          mobileLayout.details,
        )}`,
      );
    }
    assert.ok(
      Math.abs(mobileLayout.secondTop - mobileLayout.firstTop + mobileLayout.scrollDelta) <= 2,
      `Mobile screenshot is pinned instead of scrolling in flow: ${JSON.stringify(mobileLayout)}`,
    );
    if (process.env.LEARNBOX_CAPTURE_MOBILE_EVIDENCE) {
      await mobile.evaluate(`(async () => {
        document.querySelector('[data-product-stage="start"]').scrollIntoView({ block: 'start' });
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
        );
      })()`);
      await mobile.captureScreenshot(process.env.LEARNBOX_CAPTURE_MOBILE_EVIDENCE);
    }
    t.diagnostic(`mobile 390x844: ${JSON.stringify(mobileLayout)}`);

    const leitnerContrast = await mobile.evaluate(`(() => {
      const luminance = (rgb) => {
        const channels = rgb.match(/[\\d.]+/g).slice(0, 3).map((value) => Number(value) / 255);
        const linear = channels.map((value) =>
          value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
        );
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      return Array.from(document.querySelectorAll('.leitner-card')).flatMap((card) => {
        const background = getComputedStyle(card).backgroundColor;
        return Array.from(card.querySelectorAll('small, strong')).map((text) => {
          const foreground = getComputedStyle(text).color;
          const light = Math.max(luminance(background), luminance(foreground));
          const dark = Math.min(luminance(background), luminance(foreground));
          return {
            card: card.className,
            element: text.tagName,
            ratio: (light + 0.05) / (dark + 0.05)
          };
        });
      });
    })()`);
    for (const result of leitnerContrast) {
      assert.ok(
        result.ratio >= 4.5,
        `Leitner text contrast is below 4.5:1: ${JSON.stringify(result)}`,
      );
    }
    t.diagnostic(`mobile Leitner contrast: ${JSON.stringify(leitnerContrast)}`);

    const reduced = await openChromePage(
      port,
      browserLayoutUrl,
      {
        width: 1440,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      },
      { reducedMotion: true },
    );
    t.after(reduced.close);
    browserSurfaces.push({ label: 'reduced motion 1440x1000', page: reduced });
    const reducedLayout = await reduced.evaluate(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const stages = Array.from(document.querySelectorAll('[data-product-stage]'));
      const screens = Array.from(document.querySelectorAll('[data-product-screen]'));
      const device = document.querySelector('[data-product-device]');
      const computed = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          position: style.position,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          transform: style.transform,
          width: rect.width,
          height: rect.height
        };
      };
      return {
        motionProfile: document.documentElement.dataset.motionProfile,
        device: computed(device),
        stages: stages.map(computed),
        screens: screens.map(computed),
        activeScreens: document.querySelectorAll(
          '[data-product-screen].is-product-screen-active'
        ).length,
        runtimeHiddenScreens: screens.filter((screen) => screen.hasAttribute('aria-hidden')).length
      };
    })()`);
    assert.equal(reducedLayout.motionProfile, 'reduced');
    assert.equal(reducedLayout.device.position, 'static');
    assert.equal(reducedLayout.device.transform, 'none');
    assert.equal(reducedLayout.activeScreens, 0);
    assert.equal(reducedLayout.runtimeHiddenScreens, 0);
    for (const detail of [...reducedLayout.stages, ...reducedLayout.screens]) {
      assert.equal(detail.position, 'static');
      assert.equal(detail.visibility, 'visible');
      assert.equal(detail.opacity, 1);
      assert.equal(detail.transform, 'none');
      assert.ok(detail.width > 0 && detail.height > 0);
    }
    t.diagnostic(`reduced motion 1440x1000: ${JSON.stringify(reducedLayout)}`);

    for (const route of ['/privacy', '/terms']) {
      const legalUrl = new URL(route, browserLayoutUrl).href;
      const legal = await openChromePage(
        port,
        legalUrl,
        {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        },
        { javaScriptDisabled: true },
      );
      t.after(legal.close);
      browserSurfaces.push({
        allowDisabledScriptAbort: true,
        label: `JavaScript-disabled ${route}`,
        page: legal,
      });
      const legalMarkup = await legal.getMarkup();
      assert.match(legalMarkup, /<html[^>]*lang="fa"[^>]*dir="rtl"/);
      assert.match(
        legalMarkup,
        new RegExp(`<link rel="canonical" href="https://learnboxapp\\.com${route}">`),
      );
      assert.match(legalMarkup, /href="mailto:hi@learnboxapp\.com"/);
      assert.match(legalMarkup, /<main\b[^>]*>[\s\S]{500,}<\/main>/);
      assert.match(legalMarkup, /<h1\b[^>]*>[^<]+<\/h1>/);
      t.diagnostic(`JavaScript-disabled ${route}: ${legalMarkup.length} bytes of static HTML`);
    }

    for (const { allowDisabledScriptAbort = false, label, page } of browserSurfaces) {
      assert.deepEqual(
        page.getConsoleIssues(),
        [],
        `${label} emitted unexpected console warnings/errors/exceptions: ${JSON.stringify(
          page.getConsoleIssues(),
        )}`,
      );
      const unexpectedNetworkFailures = page
        .getNetworkFailures()
        .filter(
          ({ errorText, type }) =>
            !(allowDisabledScriptAbort && type === 'Script' && errorText === ''),
        );
      assert.deepEqual(
        unexpectedNetworkFailures,
        [],
        `${label} accumulated failed network requests: ${JSON.stringify(
          unexpectedNetworkFailures,
        )}`,
      );
      assert.deepEqual(
        page.getNetworkErrorResponses(),
        [],
        `${label} received HTTP responses with status >= 400: ${JSON.stringify(
          page.getNetworkErrorResponses(),
        )}`,
      );
    }
  },
);

const exactCopy = [
  'کلمه‌ها را فقط حفظ نکن؛ برای همیشه یاد بگیر.',
  'LearnBox با مرور هوشمند، جعبه لایتنر و تمرین‌های کوتاه روزانه کمک می‌کند واژه‌های آلمانی را بهتر یاد بگیری و درست در زمانی که لازم است، دوباره مرورشان کنی.',
  'یادگیری را شروع کن',
  'ببین LearnBox چطور کار می‌کند',
  'چرا کلمه‌هایی که یاد می‌گیریم، خیلی زود فراموش می‌شوند؟',
  'وقتی واژه‌ها بدون برنامه و فقط یک‌بار مرور شوند، حتی کلمه‌های مهم هم بعد از چند روز از ذهن دور می‌شوند. LearnBox زمان مناسب مرور هر واژه را پیدا می‌کند تا پیش از فراموش‌شدن، دوباره آن را ببینی.',
  'هر کلمه، در زمان مناسب دوباره برمی‌گردد.',
  'واژه‌های دشوار زودتر مرور می‌شوند و واژه‌هایی که بهتر یاد گرفته‌ای، با فاصله بیشتری بازمی‌گردند. به این شکل، وقتت را بیشتر روی چیزهایی می‌گذاری که واقعاً به تمرین نیاز دارند.',
  'مرور فاصله‌دار',
  'تمرکز روی واژه‌های دشوار',
  'برنامه مرور روزانه',
  'کاهش فراموشی',
  'کلمه را در متن، تصویر و صدا یاد بگیر.',
  'فقط دیدن ترجمه برای یادگیری عمیق کافی نیست. تلفظ، مثال کاربردی، تصویر و اطلاعات مهم هر واژه کمک می‌کنند آن را بهتر به خاطر بسپاری و در مکالمه راحت‌تر استفاده کنی.',
  'مسیر یادگیری را با هدف خودت هماهنگ کن.',
  'چه برای مهاجرت کاری و تحصیلی آماده می‌شوی، چه می‌خواهی در مکالمه روزمره پیشرفت کنی، مسیرهای LearnBox کمک می‌کنند از واژه‌هایی شروع کنی که به هدف واقعی تو نزدیک‌ترند.',
  'مهاجرت کاری',
  'مهاجرت تحصیلی',
  'مکالمه روزمره',
  'زبان عمومی',
  'آمادگی آزمون',
  'هر روز کمی جلو برو، اما متوقف نشو.',
  'هدف‌های روزانه، امتیازها، نشان‌ها و همراهی BuBu کمک می‌کنند مرور واژه‌ها به بخشی ساده و لذت‌بخش از برنامه روزانه‌ات تبدیل شود.',
  'یادگیری ساده، منظم و همیشه در دسترس.',
  'مرورهای امروز، میزان پیشرفت و واژه‌هایی که به تمرین بیشتری نیاز دارند، همه در یک محیط روشن و قابل‌فهم در اختیار تو هستند.',
  'از همین امروز یادگیری را شروع کن.',
  'پیوندهای رسمی انتشار LearnBox هنوز اعلام نشده‌اند.',
  'دانلود از کافه‌بازار',
  'ورود به نسخه وب',
  'بیرون از اپ هم کنار LearnBox بمان.',
  'خبرهای محصول، محتوای آموزشی، نکته‌های یادگیری و مسیر توسعه LearnBox را از شبکه‌های رسمی دنبال کن.',
  'اولین کلمه، شروع یک مسیر تازه است.',
  'BuBu آماده است تا در مرورهای روزانه همراهت باشد. تو فقط کافی است اولین قدم را برداری.',
  'یادگیری را با BuBu شروع کن',
];

test('contains every approved V3 copy line', () => {
  for (const copy of exactCopy) {
    assert.ok(
      normalizedSource.includes(copy.replace(/\s+/g, ' ')),
      `Missing approved copy: ${copy}`,
    );
  }
});

test('has a modular summer theme contract', () => {
  const summerRoot = join(appRoot, 'src', 'themes', 'summer');
  for (const file of ['tokens.ts', 'SummerBackdrop.tsx', 'summer-theme.css', 'index.ts']) {
    assert.ok(existsSync(join(summerRoot, file)), `Missing summer theme file: ${file}`);
  }
});

test('keeps all focused comparison variants noindex', () => {
  for (const variant of ['a', 'b', 'c']) {
    const route = join(appRoot, 'app', 'dev', `landing-variant-${variant}`, 'page.tsx');
    assert.ok(existsSync(route), `Missing variant route: ${variant}`);
    const source = readFileSync(route, 'utf8');
    assert.match(source, /robots\s*:/, `Variant ${variant} needs robots metadata`);
    assert.match(source, /index\s*:\s*false/, `Variant ${variant} must be noindex`);
    assert.match(source, /follow\s*:\s*false/, `Variant ${variant} must be nofollow`);
  }
});

test('is explicitly a German-learning landing without an App Store claim', () => {
  assert.match(allSource, /lang=["']de["']/);
  assert.match(allSource, /(Berlin|برلین|Brandenburg|کلن|Rhine|راین)/);
  assert.doesNotMatch(allSource, /App Store|اپ‌استور|اپ استور/);
});

test('defers scroll motion and keeps compact CSS interaction motion with reduced-motion fallbacks', () => {
  assert.match(allSource, /import\(['"]gsap['"]\)/);
  assert.match(allSource, /import\(['"]gsap\/ScrollTrigger['"]\)/);
  assert.doesNotMatch(
    allSource,
    /import\s+\{\s*gsap\s*\}\s+from\s+['"]gsap['"]/,
    'GSAP must stay out of the initial client bundle',
  );
  assert.doesNotMatch(allSource, /from ['"]motion\/react['"]/);
  assert.match(allSource, /mobile-nav--enter/);
  assert.match(allSource, /path-copy--enter/);
  assert.match(allSource, /@keyframes mobile-nav-enter/);
  assert.match(allSource, /@keyframes path-copy-enter/);
  assert.match(allSource, /\.hero-shell > \.landing-header/);
  assert.match(allSource, /requestIdleCallback/);
  assert.match(allSource, /ScrollTrigger/);
  assert.match(allSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(allSource, /reducedMotion/);
});

test('keeps product-story motion deferred and defines a complete reduced-motion fallback', () => {
  assert.match(motionOrchestratorSource, /import\(['"]gsap['"]\)/);
  assert.match(motionOrchestratorSource, /import\(['"]gsap\/ScrollTrigger['"]\)/);
  assert.doesNotMatch(motionOrchestratorSource, /import\s+\{\s*gsap\s*\}\s+from\s+['"]gsap['"]/);
  assert.doesNotMatch(motionOrchestratorSource, /from ['"]motion\/react['"]/);
  assert.match(
    motionOrchestratorSource,
    /matchMedia\(['"]\(prefers-reduced-motion: reduce\)['"]\)/,
  );
  for (const selector of [
    '[data-motion="product-story"]',
    '[data-product-stage]',
    '[data-product-screen]',
    '[data-product-device]',
  ]) {
    assert.ok(
      motionOrchestratorSource.includes(selector),
      `Deferred orchestrator must consume ${selector}`,
    );
  }

  const reducedMotionCss = globalCssSource.slice(
    globalCssSource.indexOf('@media (prefers-reduced-motion: reduce)'),
  );
  assert.match(reducedMotionCss, /\.product-story__stage[\s\S]*?\[data-product-screen\]/);
  assert.match(reducedMotionCss, /position:\s*static\s*!important/);
  assert.match(reducedMotionCss, /opacity:\s*1\s*!important/);
  assert.match(reducedMotionCss, /transform:\s*none\s*!important/);
  assert.match(reducedMotionCss, /\[data-product-device\][\s\S]*?position:\s*static/);
});

test('gives every landing segment a layered German scroll chapter', () => {
  for (const chapter of [
    'station',
    'rail',
    'street',
    'map',
    'park',
    'harbor',
    'square',
    'garden',
  ]) {
    assert.match(allSource, new RegExp(`chapter=["']${chapter}["']`));
  }

  for (const layer of ['far', 'mid', 'route', 'near', 'accent']) {
    assert.match(allSource, new RegExp(`data-chapter-layer=["']${layer}["']`));
  }

  assert.match(allSource, /data-chapter-backdrop/);
  assert.match(allSource, /chapterBackdrops/);
  assert.doesNotMatch(
    allSource,
    /filter:\s*['"]brightness/,
    'Scroll-linked chapter motion must avoid paint-heavy brightness filters',
  );
});

test('uses recognizable German landmarks without sacrificing copy legibility', () => {
  for (const landmark of [
    'u-bahn',
    'fernsehturm',
    'deutschland-map',
    'olympiapark',
    'elbphilharmonie',
    'brandenburg-gate',
    'garden-sign',
  ]) {
    assert.match(allSource, new RegExp(`data-chapter-landmark=["']${landmark}["']`));
  }

  assert.match(allSource, /chapter-heading-veil/);
  assert.match(allSource, /chapterLandmark/);
});
