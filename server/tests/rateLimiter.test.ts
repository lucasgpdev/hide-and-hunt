import { describe, expect, it } from 'vitest';
import { SocketRateLimiter, TokenBucket } from '../src/security/rateLimiter.js';

describe('TokenBucket', () => {
  it('permite rajadas até a capacidade e depois bloqueia', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 1, () => now);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
    now = 1000;
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('não acumula além da capacidade', () => {
    let now = 0;
    const bucket = new TokenBucket(2, 10, () => now);
    now = 60_000;
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });
});

describe('SocketRateLimiter', () => {
  it('usa um balde separado para cada evento', () => {
    const now = 0;
    const limiter = new SocketRateLimiter(
      { default: { capacity: 1, refillPerSecond: 0 }, chat: { capacity: 2, refillPerSecond: 0 } },
      () => now,
    );
    expect(limiter.allow('chat')).toBe(true);
    expect(limiter.allow('chat')).toBe(true);
    expect(limiter.allow('chat')).toBe(false);
    expect(limiter.allow('other')).toBe(true);
    expect(limiter.allow('other')).toBe(false);
  });
});
