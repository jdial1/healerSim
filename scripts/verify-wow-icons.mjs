import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);
const iconPattern = /(?<!\/)wow\/([a-z0-9_]+)/gi;
const wowBase = 'https://wow.zamimg.com/images/wow/icons/large';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (exts.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

async function collectIcons() {
  const files = await walk(root);
  const usage = new Map();
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    let match;
    while ((match = iconPattern.exec(content)) !== null) {
      const icon = match[1].toLowerCase();
      const rel = path.relative(root, file).replaceAll('\\', '/');
      const refs = usage.get(icon) ?? new Set();
      refs.add(rel);
      usage.set(icon, refs);
    }
  }
  return usage;
}

async function checkIcon(icon) {
  for (const ext of ['jpg', 'png']) {
    const url = `${wowBase}/${icon}.${ext}`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return { ok: true, url };
    } catch {}
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) return { ok: true, url };
    } catch {}
  }
  return { ok: false };
}

async function main() {
  const usage = await collectIcons();
  const icons = [...usage.keys()].sort();
  if (!icons.length) {
    console.log('No wow/ icons found.');
    process.exit(0);
  }

  const failures = [];
  const queue = [...icons];
  const concurrency = 10;
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const icon = queue.shift();
      if (!icon) return;
      const result = await checkIcon(icon);
      if (!result.ok) failures.push(icon);
    }
  });
  await Promise.all(workers);

  console.log(`Checked ${icons.length} unique wow icons.`);
  if (!failures.length) {
    console.log('All referenced wow icons exist on wow.zamimg.');
    process.exit(0);
  }

  console.error(`Missing icons: ${failures.length}`);
  for (const icon of failures.sort()) {
    const refs = [...(usage.get(icon) ?? [])].sort().join(', ');
    console.error(`- wow/${icon} (${refs})`);
  }
  process.exit(1);
}

main();
