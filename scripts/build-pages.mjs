#!/usr/bin/env node
// Build a self-contained static site in dist/ for GitHub Pages preview.
// Copies ONLY player code, slice.json, and approved stills/videos referenced by slice.json.
// Never copies .env, .git, .venv, raw voice masters, or unreferenced inbox files.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const staticFiles = [
  'index.html',
  'public/styles.css',
  'src/core/runtime.mjs',
  'src/storage/save-store.mjs',
  'src/player/bgm-engine.mjs',
  'src/player/voice-engine.mjs',
  'src/player/controller.mjs',
  'src/player/app.mjs',
  'episodes/01/slice.json',
  'episodes/01/music-cues.json'
];

const slice = JSON.parse(readFileSync(path.join(ROOT, 'episodes/01/slice.json'), 'utf8'));
const mediaSet = new Set();
for (const scene of slice.scenes) {
  for (const field of ['src', 'poster']) {
    const val = scene.media?.[field];
    if (typeof val === 'string' && val.startsWith('./assets/')) {
      mediaSet.add(val.slice(2));
    }
  }
  for (const beat of scene.beats ?? []) {
    if (typeof beat.audio === 'string' && beat.audio.startsWith('./assets/')) {
      mediaSet.add(beat.audio.slice(2));
    }
  }
}

const cueSheetPath = path.join(ROOT, 'episodes/01/music-cues.json');
if (existsSync(cueSheetPath)) {
  const cueSheet = JSON.parse(readFileSync(cueSheetPath, 'utf8'));
  for (const cue of cueSheet.cues ?? []) {
    if (typeof cue.asset_path === 'string' && cue.asset_path.startsWith('./assets/')) {
      mediaSet.add(cue.asset_path.slice(2));
    } else if (typeof cue.asset_path === 'string' && cue.asset_path.startsWith('assets/')) {
      mediaSet.add(cue.asset_path);
    }
  }
}

let totalBytes = 0;
for (const rel of [...staticFiles, ...mediaSet]) {
  const src = path.join(ROOT, rel);
  if (!existsSync(src)) throw new Error(`Missing required Pages asset: ${rel}`);
  const dst = path.join(DIST, rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(src, dst);
  totalBytes += statSync(dst).size;
}

// Add .nojekyll so GitHub Pages serves everything cleanly
import { writeFileSync } from 'node:fs';
writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`Built Pages bundle in dist/: ${staticFiles.length} code/story files + ${mediaSet.size} approved media files (${(totalBytes / 1024 / 1024).toFixed(2)} MiB total).`);
