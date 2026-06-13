import type { KVNamespace } from '@cloudflare/workers-types';
import type { KeyValueStore } from './token-storage.js';

export class CloudflareKVStore implements KeyValueStore {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.kv.get<T>(key, 'json');
  }

  async set<T>(key: string, value: T, options?: { ex?: number }): Promise<void> {
    const putOptions = options?.ex === undefined ? undefined : { expirationTtl: options.ex };
    await this.kv.put(key, JSON.stringify(value), putOptions);
  }

  async del(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
