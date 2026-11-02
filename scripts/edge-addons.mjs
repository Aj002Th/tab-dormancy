const API_ROOT = 'https://api.addons.microsoftedge.microsoft.com';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function operationIdFromLocation(location) {
  if (typeof location !== 'string' || location.trim() === '') {
    throw new Error('Edge Add-ons API did not return an operation id');
  }
  const value = location.trim();
  const guid = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (guid) return guid[0];
  const segment = value.replace(/\/+$/, '').split('/').pop();
  if (!segment) throw new Error('Edge Add-ons API did not return an operation id');
  return segment;
}

function authHeaders(clientId, apiKey) {
  return {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId,
  };
}

function formatErrors(errors) {
  if (!Array.isArray(errors)) return '';
  return errors
    .map((error) => (typeof error === 'string' ? error : error?.message))
    .filter(Boolean)
    .join('; ');
}

async function responseDetail(response) {
  const text = (await response.text()).trim();
  return text ? `${response.status} ${text.slice(0, 500)}` : String(response.status);
}

async function postOperation(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  if (response.status !== 202) {
    throw new Error(`Edge Add-ons API request failed: ${await responseDetail(response)}`);
  }
  return operationIdFromLocation(response.headers.get('location'));
}

async function waitForStatus(fetchImpl, url, headers, options) {
  const deadline = options.now() + options.timeoutMs;
  while (true) {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`${options.failure}: ${await responseDetail(response)}`);
    const body = await response.json();
    if (body.status === 'Succeeded') return body;
    if (body.status !== 'InProgress') {
      const details = [body.message, body.errorCode, formatErrors(body.errors)].filter(Boolean).join(' ');
      throw new Error(`${options.failure}: ${details || 'unknown error'}`);
    }
    if (options.now() >= deadline) throw new Error(`${options.failure}: timed out`);
    await options.sleep(options.intervalMs);
  }
}

export async function publishEdgeUpdate({
  productId,
  clientId,
  apiKey,
  zip,
  notes,
  fetch: fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  timeoutMs = 10 * 60 * 1000,
  intervalMs = 10_000,
}) {
  if (!GUID.test(productId)) throw new Error('EDGE_PRODUCT_ID must be a GUID');
  if (!clientId) throw new Error('EDGE_CLIENT_ID is required');
  if (!apiKey) throw new Error('EDGE_API_KEY is required');

  const uploadId = await postOperation(fetchImpl, `${API_ROOT}/v1/products/${productId}/submissions/draft/package`, {
    method: 'POST',
    headers: { ...authHeaders(clientId, apiKey), 'Content-Type': 'application/zip' },
    body: zip,
    redirect: 'manual',
  });
  await waitForStatus(
    fetchImpl,
    `${API_ROOT}/v1/products/${productId}/submissions/draft/package/operations/${uploadId}`,
    authHeaders(clientId, apiKey),
    { sleep, now, timeoutMs, intervalMs, failure: 'Edge package upload failed' },
  );

  const publishId = await postOperation(fetchImpl, `${API_ROOT}/v1/products/${productId}/submissions`, {
    method: 'POST',
    headers: { ...authHeaders(clientId, apiKey), 'Content-Type': 'text/plain; charset=utf-8' },
    body: notes,
    redirect: 'manual',
  });
  return waitForStatus(
    fetchImpl,
    `${API_ROOT}/v1/products/${productId}/submissions/operations/${publishId}`,
    authHeaders(clientId, apiKey),
    { sleep, now, timeoutMs, intervalMs, failure: 'Edge submission failed' },
  );
}
