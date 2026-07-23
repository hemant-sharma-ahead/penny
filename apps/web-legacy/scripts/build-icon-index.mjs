#!/usr/bin/env node
/**
 * Builds a slim, searchable index of Tabler icon names + tags for the category
 * icon picker. Reads the full @tabler/icons metadata (~1.9 MB) and emits a
 * compact `[{ n: name, t: [tags] }]` JSON into `public/`, fetched lazily only
 * when the picker's search box is used — so it never enters the app bundle or
 * the TypeScript program.
 *
 * Run: `npm run gen:icons`
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SRC = join(root, 'node_modules', '@tabler', 'icons', 'icons.json');
const OUT = join(root, 'public', 'tablerIconIndex.json');

const raw = JSON.parse(await readFile(SRC, 'utf8'));

const index = Object.values(raw)
  .filter((icon) => icon?.name && icon.styles?.outline) // outline icons map to `ti-{name}` webfont classes
  .map((icon) => ({
    n: icon.name,
    t: Array.from(
      new Set((icon.tags ?? []).map((tag) => String(tag).toLowerCase().trim()).filter((tag) => tag.length > 0))
    )
  }))
  .sort((a, b) => a.n.localeCompare(b.n));

await writeFile(OUT, JSON.stringify(index), 'utf8');
console.log(`Wrote ${index.length} icons → ${OUT}`);
