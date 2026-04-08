/**
 * @file apps/web/app/lib/rateLimiter.ts
 *
 * In-memory IP-based rate limiter for Next.js API routes.
 *
 * PHASE 3 NOTE: This implementation uses a module-level Map which works
 * fine for local dev and low-traffic alpha testing. On Vercel (or any
 * serverless platform), each cold start creates a fresh process and a
 * fresh Map — meaning the counter resets between invocations.
 *
 * BEFORE DEPLOYING TO PRODUCTION (Phase 3), replace this with:
 *   - Upstash Redis: https://upstash.com (free tier, serverless-native)
 *   - npm install @upstash/ratelimit @upstash/redis
 *   - Drop-in replacement: same checkRateLimit(ip) interface.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Shared across all requests in this process (cleared on cold start)
const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute sliding window
const MAX_REQUESTS = 5;   // 5 requests per IP per window

/**
 * Returns { allowed: true } or { allowed: false, retryAfter: number }
 * where retryAfter is the number of seconds until the window resets.
 */
export function checkRateLimit(ip: string): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    // First request or window has expired — start a fresh window
    rateLimitStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment within the existing window
  entry.count += 1;
  return { allowed: true };
}

/**
 * Extract the real IP from a Next.js Request object.
 * Falls back to 'unknown' so it never throws.
 */
export function getIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
