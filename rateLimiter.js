import { redis } from "./redis.js";

const RATE_LIMIT_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])

  if count == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
  end

  local ttl = redis.call("PTTL", KEYS[1])

  return { count, ttl }
`;

export function rateLimiter({
  limit = 5,
  windowMs = 60_000,
  keyGenerator = (req) => req.ip,
} = {}) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const clientId = keyGenerator(req);
      const key = `rate-limit:${clientId}`;

      const result = await redis.eval(RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(windowMs)],
      });

      const count = Number(result[0]);
      const ttl = Math.max(0, Number(result[1]));

      const remaining = Math.max(0, limit - count);

      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(remaining));

      if (count > limit) {
        res.setHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil(ttl / 1000))),
        );

        return res.status(429).json({
          error: "Too many requests",
          message: "Please try again later.",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
