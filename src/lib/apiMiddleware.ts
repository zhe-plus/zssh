/**
 * API Middleware - Retry, timeout, and caching utilities
 * Wraps api.ts calls with resilience patterns
 */

import { dbg } from "./debug";

// ========================
// Configuration
// ========================

interface RetryConfig {
  /** Max number of retry attempts (default: 2) */
  maxAttempts?: number;
  /** Base delay in ms (default: 500) */
  baseDelayMs?: number;
  /** Max delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffFactor?: number;
  /** HTTP status codes that trigger retry (default: 408, 429, 5xx) */
  retryableStatuses?: number[];
  /** Error messages that should trigger retry */
  retryablePatterns?: RegExp[];
}

interface CacheConfig {
  /** TTL in milliseconds (default: 30000 = 30s) */
  ttlMs?: number;
  /** Maximum cache entries (default: 100) */
  maxSize?: number;
}

interface TimeoutConfig {
  /** Timeout in ms (default: 30000 = 30s) */
  ms?: number;
  /** Whether to reject with timeout error (default: true) */
  rejectOnTimeout?: boolean;
}

const DEFAULT_RETRY: Required<RetryConfig> = {
  maxAttempts: 2,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  backoffFactor: 2,
  retryableStatuses: [408, 429],
  retryablePatterns: [/network|timeout|abort|ECONNREFUSED|EPIPE/i],
};

const DEFAULT_CACHE: Required<CacheConfig> = {
  ttlMs: 30000,
  maxSize: 100,
};

const DEFAULT_TIMEOUT: Required<TimeoutConfig> = {
  ms: 30000,
  rejectOnTimeout: true,
};

// ========================
// In-memory cache
// ========================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.cache = new Map();
    this.config = { ...DEFAULT_CACHE, ...config };
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Evict oldest entries if over capacity
    if (this.cache.size > this.config.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    // Evict if over capacity before adding
    while (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
      else break;
    }
    this.cache.set(key, { data, timestamp: Date.now(), key });
  }

  invalidate(pattern?: RegExp): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

// Global default cache instance
export const apiCache = new ApiCache();

// ========================
// Retry utility
// ========================

function shouldRetry(error: unknown, attempt: number, config: Required<RetryConfig>): boolean {
  if (attempt >= config.maxAttempts) return false;

  const errMsg = String(error);

  // Check against retryable patterns (supports both RegExp and array of RegExp)
  const patterns = Array.isArray(config.retryablePatterns) 
    ? config.retryablePatterns 
    : [config.retryablePatterns];
  
  if (patterns.some((p: any) => p.test(errMsg))) {
    return true;
  }

  // Check for network-related errors
  if (
    errMsg.includes("network") ||
    errMsg.includes("timeout") ||
    errMsg.includes("abort") ||
    errMsg.includes("ECONNREFUSED") ||
    errMsg.includes("EPIPE")
  ) {
    return true;
  }

  return false;
}

function getDelay(attempt: number, config: Required<RetryConfig>): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Wrap an async function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
  operationName?: string
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts + 1; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1 && operationName) {
        dbg("info", `retry:${operationName}:success`, { attempt });
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error, attempt, cfg)) {
        break;
      }

      const delay = getDelay(attempt, cfg);
      if (operationName) {
        dbg("warn", `retry:${operationName}:attempt`, { 
          attempt, 
          delayMs: delay, 
          error: String((error as any)?.message ?? error),
        });
      }
      
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ========================
// Timeout utility
// ========================

/**
 * Wrap an async function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  config: TimeoutConfig = {}
): Promise<T> {
  const cfg = { ...DEFAULT_TIMEOUT, ...config };

  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        const timeoutError = new Error(`Operation timed out after ${cfg.ms}ms`);
        (timeoutError as any).code = "TIMEOUT";
        reject(timeoutError);
      }, cfg.ms)
    ),
  ]);
}

// ========================
// Cached API call wrapper
// ========================

type AnyFunction = (...args: any[]) => any;

/**
 * Create a cached version of an API call.
 * Uses first argument (or custom key generator) as cache key.
 */
export function cachedApi<T extends AnyFunction>(
  fn: T,
  cacheKeyGenerator?: (...args: Parameters<T>) => string,
  cacheConfig?: CacheConfig
): T {
  const cache = cacheConfig ? new ApiCache(cacheConfig) : apiCache;

  return (async (...args: Parameters<T>) => {
    const key = cacheKeyGenerator ? cacheKeyGenerator(...args) : JSON.stringify(args);

    // Try cache first
    const cached = cache.get<Awaited<ReturnType<T>>>(key);
    if (cached !== null) {
      return cached;
    }

    // Call original function
    const result = await fn(...args);

    // Store in cache
    cache.set(key, result);

    return result;
  }) as T;
}

// ========================
// Convenience wrappers for common api calls
// ========================

import { api } from "../api";

/** Cached version of settingsGet (30s TTL by default) */
export const getCachedSettings = cachedApi(api.settingsGet.bind(api), undefined, { ttlMs: 15000 });

/** Cached version of groupsList (30s TTL) */
export const getCachedGroups = cachedApi(api.groupsList.bind(api), undefined, { ttlMs: 15000 });

/** Cached version of sessionsList (15s TTL - sessions can change frequently) */
export const getCachedSessions = cachedApi(api.sessionsList.bind(api), undefined, { ttlMs: 10000 });

/**
 * Clear all API caches
 */
export function clearApiCache(): void {
  apiCache.invalidate();
}

export { DEFAULT_RETRY, DEFAULT_CACHE, DEFAULT_TIMEOUT };
