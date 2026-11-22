// Invariant: no two source modules in one folder differ only by letter case (e.g. QR.tsx and qr.ts).
// On macOS's case-insensitive disk, `import './QR'` can resolve to `qr.ts`, which breaks the build
// there while Linux CI stays green.
import { readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;

function clashes(dir: string, found: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      clashes(path, found);
      continue;
    }
    if (!MODULE_EXT.test(entry.name)) continue;
    const stem = parse(entry.name).name;
    const other = seen.get(stem.toLowerCase());
    if (other !== undefined && other !== stem) found.push(`${dir}: ${other} vs ${stem}`);
    seen.set(stem.toLowerCase(), stem);
  }
  return found;
}

describe('source paths', () => {
  it('have no module names that differ only by case', () => {
    expect(clashes(join(__dirname, '..', 'src'))).toEqual([]);
  });
});
