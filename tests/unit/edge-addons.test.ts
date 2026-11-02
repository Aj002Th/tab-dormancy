import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { operationIdFromLocation, publishEdgeUpdate } from '../../scripts/edge-addons.mjs';

const execFileAsync = promisify(execFile);
const publishScript = fileURLToPath(new URL('../../scripts/publish-edge.mjs', import.meta.url));
const productId = 'd34f98f5-f9b7-42b1-bebb-98707202b21d';

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Edge Add-ons publish client', () => {
  it('reads an operation id from a bare value or a URL', () => {
    expect(operationIdFromLocation(' 11111111-1111-4111-8111-111111111111 ')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(
      operationIdFromLocation(
        'https://api.addons.microsoftedge.microsoft.com/v1/products/x/submissions/operations/22222222-2222-4222-8222-222222222222',
      ),
    ).toBe('22222222-2222-4222-8222-222222222222');
    expect(() => operationIdFromLocation('')).toThrow(/operation id/);
  });

  it('uploads the package, waits, and publishes the draft', async () => {
    const calls: Call[] = [];
    const uploadPolls = ['InProgress', 'Succeeded'];
    const publishPolls = ['InProgress', 'Succeeded'];
    const fetchImpl = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url.endsWith('/draft/package'))
        return new Response(null, { status: 202, headers: { Location: 'upload-op' } });
      if (url.endsWith('/package/operations/upload-op')) {
        return jsonResponse({ status: uploadPolls.shift(), message: 'uploaded', errors: null });
      }
      if (url.endsWith('/submissions')) {
        return new Response(null, { status: 202, headers: { Location: 'publish-op' } });
      }
      return jsonResponse({
        status: publishPolls.shift(),
        message: 'Successfully created submission',
        errorCode: '',
        errors: null,
      });
    };

    const result = await publishEdgeUpdate({
      productId,
      clientId: 'client',
      apiKey: 'secret-key',
      zip: new Uint8Array([1, 2, 3]),
      notes: 'version 0.3.0',
      fetch: fetchImpl,
      sleep: async () => {},
      now: () => 0,
      timeoutMs: 1,
      intervalMs: 0,
    });

    expect(result).toMatchObject({ status: 'Succeeded', message: 'Successfully created submission' });
    expect(calls.map((call) => call.url)).toEqual([
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package`,
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package/operations/upload-op`,
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package/operations/upload-op`,
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions`,
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/operations/publish-op`,
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/operations/publish-op`,
    ]);

    const upload = calls[0]?.init;
    expect(upload?.method).toBe('POST');
    expect(new Headers(upload?.headers).get('Authorization')).toBe('ApiKey secret-key');
    expect(new Headers(upload?.headers).get('X-ClientID')).toBe('client');
    expect(new Headers(upload?.headers).get('Content-Type')).toBe('application/zip');
    expect(upload?.body).toEqual(new Uint8Array([1, 2, 3]));

    const publish = calls[3]?.init;
    expect(publish?.body).toBe('version 0.3.0');
    expect(new Headers(publish?.headers).get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('stops when package validation fails and does not publish', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/draft/package'))
        return new Response(null, { status: 202, headers: { Location: 'upload-op' } });
      return jsonResponse({
        status: 'Failed',
        message: 'Invalid package.',
        errorCode: 'SubmissionValidationError',
        errors: ['version must increase', { message: 'manifest mismatch' }],
      });
    };

    await expect(
      publishEdgeUpdate({
        productId,
        clientId: 'client',
        apiKey: 'secret-key',
        zip: new Uint8Array([1]),
        notes: 'notes',
        fetch: fetchImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/Invalid package.*version must increase.*manifest mismatch/);
    expect(calls).toHaveLength(2);
  });

  it('rejects a non-GUID product id before calling the API', async () => {
    const fetchImpl = async () => {
      throw new Error('network should not be called');
    };
    await expect(
      publishEdgeUpdate({
        productId: 'not-a-guid',
        clientId: 'client',
        apiKey: 'secret-key',
        zip: new Uint8Array([1]),
        notes: 'notes',
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(/EDGE_PRODUCT_ID/);
  });

  it('fails when an operation stays in progress past the timeout', async () => {
    let clock = 0;
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/draft/package'))
        return new Response(null, { status: 202, headers: { Location: 'upload-op' } });
      return jsonResponse({ status: 'InProgress', message: null, errors: null });
    };

    await expect(
      publishEdgeUpdate({
        productId,
        clientId: 'client',
        apiKey: 'secret-key',
        zip: new Uint8Array([1]),
        notes: 'notes',
        fetch: fetchImpl,
        sleep: async () => {
          clock += 10;
        },
        now: () => clock,
        timeoutMs: 15,
        intervalMs: 0,
      }),
    ).rejects.toThrow(/timed out/);
  });
});

describe('publish-edge CLI', () => {
  it('skips when no Edge credentials are configured', async () => {
    const { stdout } = await execFileAsync(process.execPath, [publishScript, 'release/tab-dormancy-v0.3.0.zip'], {
      env: {},
    });
    expect(stdout).toMatch(/skipping/i);
  });

  it('fails when only some credentials are configured', async () => {
    await expect(
      execFileAsync(process.execPath, [publishScript, 'release/tab-dormancy-v0.3.0.zip'], {
        env: { EDGE_PRODUCT_ID: productId },
      }),
    ).rejects.toThrow(/EDGE_CLIENT_ID/);
  });

  it('fails when the package file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tab-dormancy-edge-'));
    await writeFile(join(root, 'missing.txt'), '');
    await expect(
      execFileAsync(process.execPath, [publishScript, join(root, 'missing.zip')], {
        env: {
          EDGE_PRODUCT_ID: productId,
          EDGE_CLIENT_ID: 'client',
          EDGE_API_KEY: 'secret-key',
        },
      }),
    ).rejects.toThrow();
  });
});
