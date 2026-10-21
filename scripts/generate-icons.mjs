import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#18181b"/>
  <rect x="28" y="34" width="72" height="18" rx="9" fill="#fafafa"/>
  <rect x="28" y="62" width="44" height="32" rx="9" fill="#3d63dd"/>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${size}.png`);
}
