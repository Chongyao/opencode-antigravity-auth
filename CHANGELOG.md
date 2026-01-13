# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.9-beta.1] - 2026-01-13

### Added
- **P6 Quota Warming - End-to-End Validation**
  - `scripts/test-warming-e2e.ts`: Automated E2E validation script with color-coded output
  - `scripts/test-warming-real-oauth.ts`: Real OAuth token refresh test with API validation
  - `scripts/get-token-expiry.ts`: Token expiry checker utility
  - `scripts/E2E_WARMING_TEST_SUMMARY.md`: Comprehensive test report with production guidelines
  - `scripts/WARMING_TEST_RESULTS.md`: Detailed test analysis and findings

### Testing
- **OAuth Refresh**: 2/2 successful (100%)
- **Token Validation**: Verified tokens authenticate successfully with Antigravity API
- **E2E Validation**: Confirmed quota detection and warming work as designed
- **Token Persistence**: Documented architecture - tokens are runtime-only by design

### Documentation
- Added end-to-end testing guide
- Documented quota reset time behavior (controlled by Google backend)
- Added production deployment and monitoring guidelines

## [1.2.9-beta.0] - 2026-01-12

### Added
- **P6 Quota Warming Feature** (`src/plugin/warming.ts`)
  - Proactively refresh OAuth tokens before quota resets
  - Background timer checks accounts every `interval_minutes` (default: 30min)
  - Warms accounts within `probe_before_minutes` window (default: 5min)
  - Experimental feature - enable via `quota_warming.enabled` in config

- **Comprehensive Testing**
  - 14 unit tests for quota warming module (100% passing)
  - Mock data tests for warming logic validation
  - Docker-based real account tests with actual OAuth refresh
  - Test scripts: `test-warming.ts`, `test-warming-docker.ts`, `check-quota.ts`

- **Configuration Options**
  ```json
  {
    "quota_warming": {
      "enabled": false,
      "interval_minutes": 30,
      "probe_before_minutes": 5
    }
  }
  ```

### Fixed
- **P2 Rate Limit Functions** - Added comprehensive unit tests
  - `calculateResetTime()`: 5 test cases covering all scenarios
  - `shouldRetryRateLimit()`: 6 test cases for retry logic
  - `getNextAvailableAccount()`: 9 test cases for account selection
  - All edge cases and boundary conditions verified

### Documentation
- Updated README with P6 quota warming configuration
- Added `scripts/TESTING_P6.md` with testing guide
- Documented P2-P6 logging status

### Development
- Created development container script (`scripts/dev-container.sh`)
- Added quota status checker (`scripts/check-quota.ts`)
- Added fake limit creator for testing (`scripts/create-fake-limit.ts`)

## [1.2.8] - 2026-01-11

### Added
- Model variants support for dynamic thinking configuration
- Gemini 3 native `thinkingLevel` support (`low`, `medium`, `high`)

### Changed
- Simplified model definitions using variants instead of tier suffixes
- Deprecated `thinkingBudget` for Gemini 3 models (use `thinkingLevel`)

### Documentation
- Added variant configuration examples
- Updated migration guide for v1.2.8+

## [1.2.7] - 2026-01-10

### Added
- Explicit `antigravity-` prefix for Antigravity quota models
- Gemini CLI quota models with `-preview` suffix
- Dual quota pool support for Gemini models

### Changed
- Model naming convention for clarity
- Old names still work as fallback (backward compatible)

### Documentation
- Added migration guide from v1.2.6
- Updated model naming guidelines

## [1.2.6] - 2026-01-09

### Added
- Multi-account rotation with sticky selection strategy
- Per-model-family rate limit tracking
- Proactive token refresh before expiry

### Fixed
- Session recovery for Claude thinking models
- Tool ID pairing issues from context compaction

## [1.2.5] - 2026-01-08

### Added
- Claude Opus 4.5 Thinking support
- Gemini 3 Pro and Flash models
- Auto-update mechanism for plugin

### Changed
- Improved error recovery with exponential backoff
- Enhanced debug logging

## [1.2.0] - 2026-01-05

### Added
- Initial release with Antigravity OAuth support
- Multi-account management
- Automatic token refresh
- Claude Sonnet 4.5 Thinking support
- Gemini 2.5 Pro/Flash support

---

## Version Numbering

- **Major**: Breaking changes to API or configuration
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes and minor improvements
- **Beta**: Pre-release versions for testing

## Links

- [Repository](https://github.com/NoeFabris/opencode-antigravity-auth)
- [Issues](https://github.com/NoeFabris/opencode-antigravity-auth/issues)
- [NPM Package](https://www.npmjs.com/package/opencode-antigravity-auth)
