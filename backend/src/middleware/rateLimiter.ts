import { Request, Response, NextFunction } from 'express';

interface RateRecord {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateRecord>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';

  const now = Date.now();
  let record = store.get(ip);

  if (!record || now - record.windowStart > WINDOW_MS) {
    record = { count: 1, windowStart: now };
  } else {
    record.count += 1;
  }

  store.set(ip, record);

  const remaining = Math.max(0, MAX_REQUESTS - record.count);
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil((record.windowStart + WINDOW_MS) / 1000));

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again in a minute.',
    });
  }

  next();
}
