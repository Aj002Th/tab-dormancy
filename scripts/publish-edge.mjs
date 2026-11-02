import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { publishEdgeUpdate } from './edge-addons.mjs';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('usage: node scripts/publish-edge.mjs <package.zip>');
  process.exit(1);
}

const productId = process.env.EDGE_PRODUCT_ID ?? '';
const clientId = process.env.EDGE_CLIENT_ID ?? '';
const apiKey = process.env.EDGE_API_KEY ?? '';
const configured = [productId, clientId, apiKey].filter(Boolean);
if (configured.length === 0) {
  console.log('Edge Add-ons credentials are not set; skipping store publish.');
  process.exit(0);
}
if (!productId || !clientId || !apiKey) {
  console.error('Set all of EDGE_PRODUCT_ID, EDGE_CLIENT_ID, and EDGE_API_KEY, or none of them.');
  process.exit(1);
}

const version = basename(zipPath).match(/^tab-dormancy-v(.+)\.zip$/)?.[1] ?? basename(zipPath);
const notes =
  process.env.EDGE_PUBLISH_NOTES ||
  [
    `Automated submission of Tab Dormancy ${version}.`,
    'No login or test account is required.',
    'Open several https pages, use the toolbar popup to preview and confirm cleanup, then restore the closed tabs from Dashboard > History.',
    'The extension makes no network requests.',
  ].join(' ');

const zip = new Uint8Array(await readFile(zipPath));
const result = await publishEdgeUpdate({ productId, clientId, apiKey, zip, notes });
console.log(
  `Submitted Tab Dormancy ${version} to Microsoft Edge Add-ons (${result.message ?? result.status}). Certification continues in Partner Center; this does not mean the version is public yet.`,
);
