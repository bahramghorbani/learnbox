import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Regression: the Admin CSP omitted 'unsafe-eval', which `next dev` requires for its eval-based
// module runtime. Hydration threw EvalError on the first chunk, so every page froze on its
// server-rendered shell — the sign-in button never appeared and no admin could ever log in.
// Production builds contain no eval, so the deployed CSP must stay strict.

const CONFIG_PATH = path.join(process.cwd(), 'next.config.mjs');

// Importing next.config.mjs through vitest caches the module against a single NODE_ENV, so the
// policy is rebuilt here from the config's own source instead of re-importing it per environment.
function cspFor(nodeEnv: string): string {
  const source = readFileSync(CONFIG_PATH, 'utf8');

  const scriptSrcBranches = source.match(/\?\s*("script-src[^"]*")\s*:\s*("script-src[^"]*")/);
  if (!scriptSrcBranches) throw new Error('next.config.mjs no longer branches on script-src');
  const [, productionScriptSrc, developmentScriptSrc] = scriptSrcBranches;

  const template = source.match(/value:\s*\n?\s*`([^`]*)`/);
  if (!template) throw new Error('next.config.mjs no longer builds the CSP from a template');

  const scriptSrc = nodeEnv === 'production' ? productionScriptSrc : developmentScriptSrc;
  return template[1].replace('${scriptSrc}', scriptSrc.slice(1, -1));
}

describe('admin content security policy', () => {
  it('allows unsafe-eval in development so the dev server can hydrate', () => {
    expect(cspFor('development')).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it('never ships unsafe-eval in production', () => {
    const production = cspFor('production');
    expect(production).not.toContain('unsafe-eval');
    expect(production).toContain("script-src 'self' 'unsafe-inline'");
  });

  it('keeps the remaining directives identical across environments', () => {
    const stripScriptSrc = (policy: string) =>
      policy
        .split(';')
        .map((directive) => directive.trim())
        .filter((directive) => !directive.startsWith('script-src'))
        .join('; ');

    expect(stripScriptSrc(cspFor('production'))).toEqual(stripScriptSrc(cspFor('development')));
  });

  it('keeps the production policy locked to its reviewed value', () => {
    expect(cspFor('production')).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; " +
        "base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
  });
});
