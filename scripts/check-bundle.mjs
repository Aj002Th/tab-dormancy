import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const assets = readdirSync('dist/assets');
const measure = (extension) => {
  let total = 0;
  for (const file of assets.filter((name) => name.endsWith(extension))) {
    total += gzipSync(readFileSync(`dist/assets/${file}`)).length;
  }
  return total;
};

const js = measure('.js');
const css = measure('.css');
if (js > 60 * 1024) throw new Error(`JS gzip budget exceeded: ${js} bytes`);
if (css > 10 * 1024) throw new Error(`CSS gzip budget exceeded: ${css} bytes`);
console.log(`bundle ok (js ${js} bytes gzip, css ${css} bytes gzip)`);
