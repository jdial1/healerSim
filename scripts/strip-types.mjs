import { transformSync } from 'esbuild';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DELETE_FILES = [
  path.join(ROOT, 'src', 'types.ts'),
  path.join(ROOT, 'src', 'vite-env.d.ts'),
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.github', '.vscode']);

function walkTsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsFiles(full, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function toJsPath(tsPath) {
  if (tsPath.endsWith('.tsx')) return tsPath.slice(0, -4) + '.jsx';
  if (tsPath.endsWith('.ts')) return tsPath.slice(0, -3) + '.js';
  return tsPath;
}

function rewriteImportPaths(code) {
  let out = code
    .replace(/from\s+(['"])([^'"]+)\.tsx\1/g, 'from $1$2.jsx$1')
    .replace(/from\s+(['"])([^'"]+)\.ts\1/g, 'from $1$2.js$1')
    .replace(/import\s+(['"])([^'"]+)\.tsx\1/g, 'import $1$2.jsx$1')
    .replace(/import\s+(['"])([^'"]+)\.ts\1/g, 'import $1$2.js$1')
    .replace(
      /from\s+(['"])@\/([^'"]+)\.tsx\1/g,
      (_, q, p) => `from ${q}../${p}.jsx${q}`,
    )
    .replace(
      /from\s+(['"])@\/([^'"]+)\.ts\1/g,
      (_, q, p) => `from ${q}../${p}.js${q}`,
    );
  out = out.replace(
    /from (['"])([^'"]+\.json)\1;/g,
    'from $1$2$1 with { type: "json" };',
  );
  return out;
}

function stripTypesFromSource(source, loader) {
  const { code } = transformSync(source, {
    loader,
    format: 'esm',
    target: 'es2022',
    jsx: 'preserve',
  });
  return code;
}

function main() {
  for (const f of DELETE_FILES) {
    try {
      unlinkSync(f);
      console.log('deleted', path.relative(ROOT, f));
    } catch {
      console.warn('skip delete', f);
    }
  }

  const allFiles = walkTsFiles(ROOT);
  const toProcess = allFiles.filter(
    (f) => !DELETE_FILES.some((d) => path.resolve(f) === path.resolve(d)),
  );

  const conversions = [];

  for (const tsPath of toProcess) {
    const rel = path.relative(ROOT, tsPath);
    const source = readFileSync(tsPath, 'utf8');
    const loader = tsPath.endsWith('.tsx') ? 'tsx' : 'ts';

    let code;
    try {
      code = stripTypesFromSource(source, loader);
    } catch (err) {
      console.error(`esbuild failed: ${rel}`, err.message);
      throw err;
    }

    code = rewriteImportPaths(code);
    const jsPath = toJsPath(tsPath);
    conversions.push({ tsPath, jsPath, rel });
  }

  for (const { tsPath, jsPath, rel } of conversions) {
    const source = readFileSync(tsPath, 'utf8');
    const loader = tsPath.endsWith('.tsx') ? 'tsx' : 'ts';
    let code = stripTypesFromSource(source, loader);
    code = rewriteImportPaths(code);
    writeFileSync(jsPath, code, 'utf8');
    unlinkSync(tsPath);
    console.log(`${rel} -> ${path.relative(ROOT, jsPath)}`);
  }

  console.log(`\nConverted ${conversions.length} files.`);
}

main();
