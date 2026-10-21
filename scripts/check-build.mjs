import { existsSync, readFileSync, statSync } from 'node:fs';

const required = ['dist/manifest.json', 'dist/popup.html', 'dist/dashboard.html', 'dist/background.js'];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`missing build artifact: ${file}`);
}

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('manifest is not MV3');

const jsBytes = required.filter((f) => f.endsWith('.js')).reduce((sum, f) => sum + statSync(f).size, 0);
if (jsBytes > 200_000) throw new Error(`JavaScript bundle too large: ${jsBytes} bytes`);
console.log(`build ok (${jsBytes} bytes js)`);
