/**
 * Limitador de frequência no modelo "balde de fichas" (token bucket).
 *
 * Cada evento consome 1 ficha. As fichas são repostas continuamente a uma
 * taxa fixa até o limite da capacidade. Isso permite pequenas rajadas
 * legítimas e bloqueia spam contínuo.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryConsume(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill(): void {
    const current = this.now();
    const elapsedSeconds = (current - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
      this.lastRefill = current;
    }
  }
}

export interface RateLimitRule {
  capacity: number;
  refillPerSecond: number;
}

/** Regras por evento. Eventos sem regra usam a regra padrão. */
export type RateLimitRules = Record<string, RateLimitRule> & { default: RateLimitRule };

/**
 * Conjunto de limitadores de um único socket: um balde por tipo de evento.
 */
export class SocketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly rules: RateLimitRules,
    private readonly now: () => number = Date.now,
  ) {}

  allow(eventName: string): boolean {
    let bucket = this.buckets.get(eventName);
    if (!bucket) {
      const rule = this.rules[eventName] ?? this.rules.default;
      bucket = new TokenBucket(rule.capacity, rule.refillPerSecond, this.now);
      this.buckets.set(eventName, bucket);
    }
    return bucket.tryConsume();
  }
}
