import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { zipSync } from 'fflate';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const cwd = process.cwd();
const distDir = resolve(cwd, option('dist', 'dist'));
const outDir = resolve(cwd, option('out', 'release'));
const tag = option('tag');

const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));

if (pkg.version !== manifest.version) {
  throw new Error(`version mismatch: package.json ${pkg.version}, manifest ${manifest.version}`);
}

if (tag) {
  const expected = tag.startsWith('v') ? tag.slice(1) : tag;
  if (expected !== pkg.version) {
    throw new Error(`tag mismatch: tag ${tag}, package.json ${pkg.version}`);
  }
}

const files = {};
function collect(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collect(full);
    } else {
      files[relative(distDir, full).replaceAll('\\', '/')] = new Uint8Array(readFileSync(full));
    }
  }
}
collect(distDir);

const zipName = `tab-dormancy-v${pkg.version}.zip`;
const archive = zipSync(files, { level: 9 });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, zipName), archive);

const hash = createHash('sha256').update(archive).digest('hex');
writeFileSync(join(outDir, 'SHA256SUMS'), `${hash}  ${zipName}\n`);

console.log(`packaged ${zipName} (${archive.length} bytes)`);
