export type RateLimitReason =
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MODEL_CAPACITY_EXHAUSTED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

/**
 * @param duration - "2h1m1s", "30s", "500ms", "1.5s"
 * @returns Milliseconds, or null for invalid/empty input
 */
export function parseDurationString(duration: string | null | undefined): number | null {
  if (duration == null || duration === '') {
    return null;
  }

  const pattern = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/;
  const match = duration.match(pattern);

  if (!match) {
    return null;
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseFloat(match[3]) : 0;
  const milliseconds = match[4] ? parseInt(match[4], 10) : 0;

  const totalMs = 
    hours * 3600000 +
    minutes * 60000 +
    seconds * 1000 +
    milliseconds;

  if (totalMs === 0) {
    return null;
  }

  return totalMs;
}

/**
 * @param isoString - ISO 8601 timestamp like "2026-01-08T17:00:00Z"
 * @returns Unix timestamp in milliseconds, or null for invalid/empty input
 */
export function parseIsoResetTime(isoString: string | null | undefined): number | null {
  if (isoString == null || isoString === '') {
    return null;
  }

  const timestamp = Date.parse(isoString);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

/**
 * @param body - HTTP 响应 body (JSON string 或纯文本)
 * @returns 限流原因类型
 */
export function parseRateLimitReason(body: string | null | undefined): RateLimitReason {
  if (body == null || body === '') {
    return 'UNKNOWN';
  }

  const trimmed = body.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);

      const details = json?.error?.details;
      if (Array.isArray(details) && details.length > 0) {
        const reason = details[0]?.reason;
        if (reason === 'QUOTA_EXHAUSTED') return 'QUOTA_EXHAUSTED';
        if (reason === 'RATE_LIMIT_EXCEEDED') return 'RATE_LIMIT_EXCEEDED';
        if (reason === 'MODEL_CAPACITY_EXHAUSTED') return 'MODEL_CAPACITY_EXHAUSTED';
      }

      const message = json?.error?.message;
      if (typeof message === 'string') {
        const msgLower = message.toLowerCase();
        if (msgLower.includes('per minute') || msgLower.includes('rate limit')) {
          return 'RATE_LIMIT_EXCEEDED';
        }
      }
    } catch {
      // JSON 解析失败，继续文本匹配
    }
  }

  const bodyLower = body.toLowerCase();
  if (bodyLower.includes('per minute') || bodyLower.includes('rate limit') || bodyLower.includes('too many requests')) {
    return 'RATE_LIMIT_EXCEEDED';
  }
  if (bodyLower.includes('exhausted') || bodyLower.includes('quota')) {
    return 'QUOTA_EXHAUSTED';
  }

  return 'UNKNOWN';
}

/**
 * @param reason - 限流原因
 * @param failureCount - 连续失败次数 (用于 QUOTA_EXHAUSTED 指数退避)
 * @returns 退避时间 (毫秒)
 */
export function getBackoffDelayMs(reason: RateLimitReason, failureCount: number = 1): number {
  switch (reason) {
    case 'QUOTA_EXHAUSTED':
      if (failureCount <= 1) return 60_000;      // 60s
      if (failureCount === 2) return 300_000;    // 5min
      if (failureCount === 3) return 1_800_000;  // 30min
      return 7_200_000;                          // 2h
    case 'RATE_LIMIT_EXCEEDED':
      return 30_000;   // 30s
    case 'MODEL_CAPACITY_EXHAUSTED':
      return 15_000;   // 15s
    case 'SERVER_ERROR':
      return 20_000;   // 20s
    case 'UNKNOWN':
    default:
      return 60_000;   // 60s
  }
}

/**
 * @param header - Retry-After header 值 (秒数字符串 或 HTTP-date)
 * @returns 毫秒数，无效返回 null
 */
export function parseRetryAfterHeader(header: string | null | undefined): number | null {
  if (header == null || header === '') {
    return null;
  }

  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.max(seconds * 1000, 2000);
  }

  const timestamp = Date.parse(header);
  if (!Number.isNaN(timestamp)) {
    const delayMs = timestamp - Date.now();
    return delayMs > 0 ? Math.max(delayMs, 2000) : 2000;
  }

  return null;
}
