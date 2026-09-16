import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('deduplicates concurrent loads for the same key', async () => {
    let calls = 0;
    const cache = new TtlCache<string, number>({ defaultTtlMs: 1_000 });

    const loader = async () => {
      calls += 1;
      await Promise.resolve();
      return 42;
    };

    const [left, right] = await Promise.all([
      cache.getOrLoad('answer', loader),
      cache.getOrLoad('answer', loader),
    ]);

    expect(left).toBe(42);
    expect(right).toBe(42);
    expect(calls).toBe(1);
  });

  it('expires values after ttl', async () => {
    let now = 1_000;
    let calls = 0;
    const cache = new TtlCache<string, number>({
      defaultTtlMs: 100,
      now: () => now,
    });

    const loader = async () => {
      calls += 1;
      return calls;
    };

    expect(await cache.getOrLoad('key', loader)).toBe(1);
    now = 1_050;
    expect(await cache.getOrLoad('key', loader)).toBe(1);
    now = 1_101;
    expect(await cache.getOrLoad('key', loader)).toBe(2);
  });
});
