// One-time / maintenance utility: strip embedded C2PA manifests and the
// c2pa namespace declaration from every SVG under logo/.
//
// The original hand-made MKPONG SVGs carry a base64 C2PA manifest inside a
// <metadata> block (~5 KB of bloat per file) plus xmlns:c2pa. That data is
// not part of the artwork, is not needed by any consumer, and makes the files
// hard to diff or read. This script removes it and leaves the artwork intact.
//
// Usage:  node scripts/strip-c2pa.mjs [path ...]
//         (no arguments = every *.svg under logo/, except logo/dist)

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (/\.svg$/i.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function stripC2pa(source) {
  let out = source;
  // Remove the whole <metadata> ... </metadata> block (greedy-safe, non-greedy).
  out = out.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '');
  // Remove any remaining metadata element that is empty / self-closing.
  out = out.replace(/<metadata\b[^>]*\/>/gi, '');
  // Drop the c2pa namespace declaration and any leftover c2pa elements.
  out = out.replace(/\s+xmlns:c2pa="[^"]*"/gi, '');
  out = out.replace(/<c2pa:[^>]*\/?>/gi, '');
  out = out.replace(/<\/c2pa:[^>]*>/gi, '');
  return out;
}

const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : walk(join(ROOT, 'logo'));

let changed = 0;
for (const file of targets) {
  if (!statSync(file).isFile()) continue;
  const before = readFileSync(file, 'utf8');
  const after = stripC2pa(before);
  if (after === before) {
    console.log(`keep   ${relative(ROOT, file)}${sep} (no C2PA)`);
    continue;
  }
  writeFileSync(file, after, 'utf8');
  changed++;
  const saved = before.length - after.length;
  console.log(`strip  ${relative(ROOT, file)} (-${saved} bytes)`);
}
console.log(`\nC2PA stripped from ${changed} file(s).`);
