# Testing P6 Quota Warming Feature

## Overview

P6 implements proactive quota warming - the system automatically refreshes tokens for accounts whose quotas are about to reset, ensuring immediate availability when the quota becomes available.

## Quick Test

### 1. Unit Tests (Recommended)

Run the warming module unit tests:

```bash
./scripts/dev-container.sh bun test src/plugin/warming.test.ts
```

Expected output:
```
14 pass
0 fail
```

### 2. Mock Data Test

Test with simulated accounts that have upcoming quota resets:

```bash
./scripts/dev-container.sh bun run scripts/test-warming.ts
```

This creates mock accounts with rate limits expiring in 5-7 minutes and verifies the warmer detects and warms them.

Expected output:
```
✅ QuotaWarmer is working correctly!
   Total warmups: 3
   Successful: 3
```

### 3. Live Testing

To test with real accounts, you need to:

1. **Enable quota warming** via environment variable:
   ```bash
   export OPENCODE_ANTIGRAVITY_QUOTA_WARMING=1
   ```

2. **Trigger a rate limit** by making requests until you hit 429:
   ```bash
   # Use the same model repeatedly until rate limited
   opencode run "test" --model=google/antigravity-claude-sonnet-4-5
   ```

3. **Check quota status**:
   ```bash
   ./scripts/quota-status.sh
   ```

4. **Verify warming behavior**:
   - When quota reset time is < 5 minutes away, the warmer will automatically refresh the token
   - Check logs (if debug enabled) for warming activity

## Configuration

P6 warming can be configured via:

### Environment Variable
```bash
export OPENCODE_ANTIGRAVITY_QUOTA_WARMING=1
```

### Configuration File (`~/.config/opencode/antigravity.json`)
```json
{
  "quota_warming": {
    "enabled": true,
    "interval_minutes": 30,
    "probe_before_minutes": 5
  }
}
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `false` | Enable/disable quota warming |
| `interval_minutes` | `30` | How often to check for quotas to warm (5-120 min) |
| `probe_before_minutes` | `5` | Warm accounts this many minutes before quota resets (1-30 min) |

## Quota Status Tool

Check the current rate limit status of all accounts:

```bash
./scripts/quota-status.sh
```

Example output:
```
📊 Antigravity Account Quota Status

🔑 Account 1: user@example.com
  ✅ claude: Available (limit expired)
  🔒 gemini-antigravity: Rate limited
     ⏰ Resets in: 3m
     📅 Reset time: 1/13/2026, 6:15:00 AM
```

This shows:
- ✅ Available quotas (no rate limits)
- 🔒 Rate limited quotas with time until reset

## How Warming Works

1. **Background timer** runs every `interval_minutes` (default: 30 min)
2. **Scans all accounts** for rate limit reset times
3. **Detects upcoming resets** within `probe_before_minutes` window (default: 5 min)
4. **Refreshes tokens** proactively to ensure account readiness
5. **Tracks warmed quotas** to avoid duplicate warmups

## Troubleshooting

### Warming Not Triggering

Check:
1. Is `OPENCODE_ANTIGRAVITY_QUOTA_WARMING=1` set?
2. Do accounts have `rateLimitResetTimes` in storage? (check with `./scripts/quota-status.sh`)
3. Is reset time within `probe_before_minutes` window?

### Debug Mode

Enable debug logging to see warming activity:

```bash
export OPENCODE_ANTIGRAVITY_DEBUG=1
opencode run "test" --model=google/antigravity-claude-sonnet-4-5
```

Logs will be in `~/.config/opencode/antigravity-logs/`

## Architecture

```
┌──────────────────┐
│  QuotaWarmer     │
│  (background)    │
└────────┬─────────┘
         │ every interval_minutes
         ▼
┌─────────────────────────────┐
│ checkAndWarm()              │
│ - Scan all accounts         │
│ - Find quotas resetting     │
│   within probe window       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ warmAccount()               │
│ - Refresh access token      │
│ - Mark as warmed            │
│ - Return success/failure    │
└─────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/plugin/warming.ts` | QuotaWarmer class implementation |
| `src/plugin/warming.test.ts` | Unit tests (14 tests) |
| `scripts/test-warming.ts` | Mock data test script |
| `scripts/check-quota.ts` | Quota status viewer |
| `scripts/quota-status.sh` | Quota status CLI wrapper |
