import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageScript = fileURLToPath(new URL('../../scripts/package.mjs', import.meta.url));
const tempDirs: string[] = [];

type Versions = {
  packageVersion: string;
  manifestVersion: string;
};

async function createFixture({ packageVersion, manifestVersion }: Versions): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tab-dormancy-package-'));
  tempDirs.push(root);
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'tab-dormancy', version: packageVersion }));
  await writeFile(join(root, 'dist/manifest.json'), JSON.stringify({ manifest_version: 3, version: manifestVersion }));
  await writeFile(join(root, 'dist/background.js'), 'console.log("background");\n');
  await writeFile(join(root, 'dist/assets/app.js'), 'console.log("app");\n');
  return root;
}

async function runPackage(root: string, tag?: string): Promise<{ stdout: string; stderr: string }> {
  const args = [packageScript, '--dist', 'dist', '--out', 'release'];
  if (tag) args.push('--tag', tag);
  return execFileAsync(process.execPath, args, { cwd: root });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('release package', () => {
  it('puts the extension files at the ZIP root and writes a checksum', async () => {
    const root = await createFixture({ packageVersion: '0.1.0', manifestVersion: '0.1.0' });

    await runPackage(root, 'v0.1.0');

    const zip = unzipSync(await readFile(join(root, 'release/tab-dormancy-v0.1.0.zip')));
    expect(Object.keys(zip).sort()).toEqual(['assets/app.js', 'background.js', 'manifest.json']);
    const checksums = await readFile(join(root, 'release/SHA256SUMS'), 'utf8');
    expect(checksums).toMatch(/^[a-f0-9]{64} {2}tab-dormancy-v0\.1\.0\.zip\n$/);
  });

  it('rejects a manifest version that differs from package.json', async () => {
    const root = await createFixture({ packageVersion: '0.1.0', manifestVersion: '0.2.0' });

    await expect(runPackage(root)).rejects.toMatchObject({
      stderr: expect.stringContaining('version mismatch'),
    });
  });

  it('rejects a tag that differs from package.json', async () => {
    const root = await createFixture({ packageVersion: '0.1.0', manifestVersion: '0.1.0' });

    await expect(runPackage(root, 'v0.2.0')).rejects.toMatchObject({
      stderr: expect.stringContaining('tag mismatch'),
    });
  });
});
