import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const assets = [
  {
    source: 'apps/website/public/fonts/IRANSansX-Regular.woff2',
    target: 'apps/mobile/assets/fonts/IRANSansX-Regular.woff2',
    sha256: '989d0b33c3f9c36e2967ceb982165f6ebcc36eaa8007056a2d7a94a68f0b1d42',
  },
  {
    source: 'apps/website/public/fonts/IRANSansX-Bold.woff2',
    target: 'apps/mobile/assets/fonts/IRANSansX-Bold.woff2',
    sha256: 'ee7a4dc0bdbb8c364677e02af2d8d51d6c69e4d51c70089a5ec3fff478aa2c41',
  },
  {
    source: 'apps/website/public/images/bobo/encourage-v2.png',
    target: 'apps/mobile/assets/bobo/encourage-v2.png',
    sha256: 'a95193a4fb843d41c5139366eabe9f9038e9ce3e995ae4730d9bead825b2c43a',
  },
  {
    source: 'apps/website/public/images/bobo/celebrate-v2.png',
    target: 'apps/mobile/assets/bobo/celebrate-v2.png',
    sha256: '06b57dee703c6660c0a2f334e8531ae2240a278266d3c43e3e984a6b397b4a8c',
  },
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

for (const asset of assets) {
  for (const [label, path] of [
    ['source', asset.source],
    ['target', asset.target],
  ]) {
    const actual = sha256(await readFile(path));
    if (actual !== asset.sha256) {
      throw new Error(`${label} asset checksum mismatch: ${path}`);
    }
  }
}

console.log(`Verified ${assets.length} approved mobile visual assets.`);
