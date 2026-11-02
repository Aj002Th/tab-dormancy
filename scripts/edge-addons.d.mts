export function operationIdFromLocation(location: string): string;

export function publishEdgeUpdate(options: {
  productId: string;
  clientId: string;
  apiKey: string;
  zip: Uint8Array;
  notes: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ status: string; message?: string | null }>;
