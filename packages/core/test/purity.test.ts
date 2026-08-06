/**
 * The golden rule, checked mechanically (02-arquitectura §3.1).
 *
 * `@nanonogram/core` imports nothing: no npm package, no node builtin, no DOM.
 * That is not a style preference. It is the property that lets the Go server
 * reimplement the same rules against the same corpus, lets the Fase 4 Anbernic
 * client reuse the engine, and lets the whole engine be tested without a
 * browser. It is also one line of convenience away from being lost, which is
 * why it is a test and not a convention.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(CORE, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Every module specifier in a file, from static imports, exports and `import()`. */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) out.push(match[1]!);
  }
  return out;
}

describe('@nanonogram/core is dependency-free', () => {
  const files = sourceFiles(SRC);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('imports nothing but its own relative modules', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          offenders.push(`${relative(CORE, file)} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('declares no runtime dependencies in package.json', () => {
    const manifest = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest['dependencies']).toBeUndefined();
    expect(manifest['peerDependencies']).toBeUndefined();
    expect(manifest['optionalDependencies']).toBeUndefined();
  });

  it('touches no host globals', () => {
    // A blunt textual check, deliberately: it also catches globals reached
    // through `globalThis`, which the eslint rule does not.
    const forbidden = [
      'window',
      'document',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'XMLHttpRequest',
      'requestAnimationFrame',
      'setTimeout',
      'setInterval',
      'process.',
      'Date.now',
      'new Date',
      'Math.random',
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Strip comments so prose about the DOM does not trip the check.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const token of forbidden) {
        if (code.includes(token)) offenders.push(`${relative(CORE, file)} references ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is deterministic: no randomness and no ambient time', () => {
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, relative(CORE, file)).not.toMatch(/\bMath\.random\b/);
      expect(code, relative(CORE, file)).not.toMatch(/\bperformance\.now\b/);
    }
  });
});
