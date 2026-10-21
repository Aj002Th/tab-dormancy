import type { StorageArea } from '../../src/platform/storage';

export class MemoryStorage implements StorageArea {
  data: Record<string, unknown> = {};

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null || keys === undefined) return { ...this.data };
    const list = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const key of list) {
      if (key in this.data) result[key] = this.data[key];
    }
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) delete this.data[key];
  }

  async clear(): Promise<void> {
    this.data = {};
  }
}
