import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const publicRoot = path.join(root, 'public');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);

const wowBase = 'https://wow.zamimg.com/images/wow/icons/large';
const gameIconsBase = 'https://game-icons.net/icons';
const wowExts = ['jpg', 'png'];
const gameIconPalettes = ['ffffff/transparent', 'ffffff/000000'];
const swappableAuthors = new Set(['lorc', 'delapouite', 'skoll', 'willdabeast', 'darkzaitzev']);
const gameIconAliases = new Map([
  ['lorc/beheading', ['lorc/executioner-hood', 'delapouite/guillotine']],
  ['lorc/chain-mail', ['delapouite/chain-mail']],
  ['delapouite/slimy-muddiness', ['delapouite/dripping-goo']],
  ['delapouite/vial', ['lorc/fizzing-flask']],
  ['lorc/beaker-vial', ['delapouite/vial']],
  ['lorc/hand-clench', ['lorc/fist']],
  ['lorc/lightning-glow', ['lorc/lightning-storm']],
  ['lorc/magma-creature', ['lorc/burning-embers']],
  ['lorc/raptor-tail', ['delapouite/stegosaurus-scales']],
  ['lorc/shamanic-flask', ['delapouite/fizzing-flask']],
  ['lorc/smoke-bomb', ['delapouite/smoke-bomb']],
  ['lorc/sprouting-seed', ['delapouite/seedling']],
  ['lorc/spore-flask', ['delapouite/bubbling-flask']],
  ['lorc/stone-altar', ['delapouite/star-altar']],
  ['lorc/sunder-armor', ['delapouite/broken-shield']],
  ['lorc/vicar', ['delapouite/pope-crown']],
  ['delapouite/high-priest', ['delapouite/pope-crown']],
]);

const wowIcons = new Set();
const gameIcons = new Map();

function normalizeSlash(value) {
  return value.replaceAll('\\', '/');
}

function collectFromString(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  if (normalized.startsWith('wow/')) {
    const icon = normalized.slice(4);
    if (/^[a-z0-9_]+$/.test(icon)) wowIcons.add(icon);
    return;
  }
  const parts = normalized.split('/');
  if (parts.length !== 2) return;
  const [author, icon] = parts;
  if (!/^[a-z0-9-]+$/.test(author)) return;
  if (!/^[a-z0-9-]+$/.test(icon)) return;
  const key = `${author}/${icon}`;
  if (!gameIcons.has(key)) gameIcons.set(key, { author, icon });
}

const iconAssignmentPatterns = [
  /\biconPath\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
  /\bicon\s*:\s*["'`]([^"'`]+)["'`]/gi,
  /\bbossIcon\s*:\s*["'`]([^"'`]+)["'`]/gi,
  /\bcardIcon\s*:\s*["'`]([^"'`]+)["'`]/gi,
  /\bLOCKED_DUNGEON_ICON\s*=\s*["'`]([^"'`]+)["'`]/gi,
];

function collectIconsFromCode(content) {
  for (const pattern of iconAssignmentPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) collectFromString(match[1]);
    }
  }
}

function collectIconsFromJsonValue(value, parentKey = '') {
  if (typeof value === 'string') {
    if (parentKey.toLowerCase().includes('icon')) collectFromString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIconsFromJsonValue(item, parentKey);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    collectIconsFromJsonValue(nested, key);
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(fullPath);
      files.push(...nested);
      continue;
    }
    if (exts.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

async function collectIcons() {
  const files = await walk(srcRoot);
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (path.extname(file) === '.json') {
      const parsed = JSON.parse(content);
      collectIconsFromJsonValue(parsed);
      continue;
    }
    collectIconsFromCode(content);
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function downloadWowIcon(icon) {
  const dir = path.join(publicRoot, 'icons', 'wow');
  await mkdir(dir, { recursive: true });
  for (const ext of wowExts) {
    const outPath = path.join(dir, `${icon}.${ext}`);
    if (await exists(outPath)) return true;
    const data = await fetchBuffer(`${wowBase}/${icon}.${ext}`);
    if (!data) continue;
    await writeFile(outPath, data);
    return true;
  }
  return false;
}

function resolveGameIconUrls(author, icon) {
  const slugCandidates = [`${author}/${icon}`, ...(gameIconAliases.get(`${author}/${icon}`) ?? [])];
  const urls = [];
  const attempted = new Set();

  for (const slug of slugCandidates) {
    const [baseAuthor, baseIcon] = slug.split('/', 2);
    if (!baseAuthor || !baseIcon) continue;

    const authorCandidates = [baseAuthor];
    if (swappableAuthors.has(baseAuthor)) {
      const swappables = ['lorc', 'delapouite', 'skoll', 'willdabeast', 'darkzaitzev'];
      for (const sw of swappables) {
        if (sw !== baseAuthor) authorCandidates.push(sw);
      }
    }

    for (const candidateAuthor of authorCandidates) {
      const attemptKey = `${candidateAuthor}/${baseIcon}`;
      if (attempted.has(attemptKey)) continue;
      attempted.add(attemptKey);

      for (const palette of gameIconPalettes) {
        urls.push(`${gameIconsBase}/${palette}/1x1/${candidateAuthor}/${baseIcon}.png`);
      }
    }
  }
  return urls;
}

async function downloadGameIcon(author, icon) {
  const dir = path.join(publicRoot, 'icons', 'game-icons', author);
  const outPath = path.join(dir, `${icon}.png`);
  if (await exists(outPath)) return true;

  const urls = resolveGameIconUrls(author, icon);
  for (const url of urls) {
    const data = await fetchBuffer(url);
    if (data) {
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, data);
      return true;
    }
  }

  return false;
}

async function cleanGameIconsDir() {
  const dir = path.join(publicRoot, 'icons', 'game-icons');
  await rm(dir, { recursive: true, force: true });
}

async function runQueue(items, worker, concurrency) {
  const queue = [...items];
  const failures = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      const ok = await worker(item);
      if (!ok) failures.push(item);
    }
  });
  await Promise.all(workers);
  return failures;
}

async function main() {
  await collectIcons();
  const wowList = [...wowIcons].sort();
  const gameList = [...gameIcons.values()].sort((a, b) => `${a.author}/${a.icon}`.localeCompare(`${b.author}/${b.icon}`));

  await cleanGameIconsDir();

  const wowFailures = await runQueue(
    wowList,
    (icon) => downloadWowIcon(icon),
    10,
  );
  const gameFailures = await runQueue(
    gameList,
    ({ author, icon }) => downloadGameIcon(author, icon),
    10,
  );

  const total = wowList.length + gameList.length;
  const downloaded = total - wowFailures.length - gameFailures.length;
  console.log(`Icon download complete: ${downloaded}/${total}`);

  if (wowFailures.length || gameFailures.length) {
    for (const icon of wowFailures) console.error(`Missing wow icon: wow/${normalizeSlash(icon)}`);
    for (const entry of gameFailures) console.error(`Missing game icon: ${normalizeSlash(`${entry.author}/${entry.icon}`)}`);
    console.warn(`Icon download warnings: ${wowFailures.length + gameFailures.length} unresolved icon(s).`);
  }
}

main();
