# 任务交接文档

> 创建时间: 2026-01-12
> 当前阶段: P1 (时间解析模块)

---

## 项目概述

**项目**: `opencode-antigravity-auth` - OpenCode 的 Antigravity OAuth 认证插件

**目标**: 为插件实现智能限流跟踪、精确配额刷新时间解析、CacheFirst 调度模式和配额预热机制

**技术栈**: TypeScript, Bun, Vitest

---

## 开发环境

### 启动容器

```bash
cd /home/zcy/workspace/cloned_projects/opencode-antigravity-auth
./scripts/dev-container.sh              # 进入交互式 shell
./scripts/dev-container.sh bun test     # 运行测试
./scripts/dev-container.sh bun test src/plugin/rate-limit.test.ts  # 运行单个测试
```

### 测试命令

```bash
# 在容器内
bun test                                 # 全部测试
bun test --watch src/plugin/rate-limit   # 监听模式
```

### 验证 API 调用

```bash
./scripts/dev-container.sh bash -c 'opencode run "hello" --model=google/antigravity-claude-sonnet-4-5'
```

---

## P1 任务: 时间解析模块

### 目标

创建 `src/plugin/rate-limit.ts`，实现：
1. `parseDurationString()` - 解析 "2h1m1s" 格式 → 毫秒
2. `parseIsoResetTime()` - 解析 ISO 8601 时间戳 → Unix timestamp

### 产出文件

| 文件 | 描述 |
|------|------|
| `src/plugin/rate-limit.ts` | 限流核心模块 |
| `src/plugin/rate-limit.test.ts` | 单元测试 |

### Rust 参考代码

**关键文件**: `/home/zcy/workspace/cloned_projects/Antigravity-Manager/src-tauri/src/proxy/rate_limit.rs`

**`parse_duration_string()` 参考 (line 314-355)**:
```rust
fn parse_duration_string(&self, s: &str) -> Option<u64> {
    // 正则: (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?
    // 支持: "2h1m1s", "1h30m", "5m", "30s", "500ms", "1.5s"
    let hours = ...;
    let minutes = ...;
    let seconds = ...; // 支持小数
    let milliseconds = ...;
    
    let total_seconds = hours * 3600 + minutes * 60 + seconds.ceil() + (milliseconds + 999) / 1000;
}
```

**`RateLimitReason` 枚举 (line 7-18)**:
```rust
pub enum RateLimitReason {
    QuotaExhausted,           // 日配额耗尽
    RateLimitExceeded,        // TPM/RPM 限制
    ModelCapacityExhausted,   // GPU 不足
    ServerError,              // 5xx
    Unknown,
}
```

### TypeScript 实现骨架

```typescript
// src/plugin/rate-limit.ts

export type RateLimitReason =
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MODEL_CAPACITY_EXHAUSTED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

/**
 * 解析持续时间字符串为毫秒
 * @param duration - 如 "2h1m1s", "30s", "500ms", "1.5s"
 * @returns 毫秒数，无效输入返回 null
 */
export function parseDurationString(duration: string | null | undefined): number | null {
  // TODO: 实现
}

/**
 * 解析 ISO 8601 时间戳
 * @param isoString - 如 "2026-01-08T17:00:00Z"
 * @returns Unix timestamp (ms)，无效输入返回 null
 */
export function parseIsoResetTime(isoString: string | null | undefined): number | null {
  // TODO: 实现
}
```

### 测试用例要求

**parseDurationString 测试 (至少 10 个)**:
- "30s" → 30000
- "2m" → 120000
- "1h" → 3600000
- "2h1m1s" → 7261000
- "1.5s" → 1500
- "500ms" → 500
- "1h30m" → 5400000
- "" → null
- null → null
- "invalid" → null

**parseIsoResetTime 测试 (至少 5 个)**:
- "2026-01-08T17:00:00Z" → 正确的 timestamp
- "2026-01-08T17:00:00.123Z" → 带毫秒
- "2026-01-08T17:00:00+08:00" → 带时区偏移
- "" → null
- "not-a-date" → null

---

## 项目代码风格

### 测试模式 (参考 `accounts.test.ts`)

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDurationString } from "./rate-limit";

describe("parseDurationString", () => {
  it("parses seconds", () => {
    expect(parseDurationString("30s")).toBe(30000);
  });

  it("parses combined format", () => {
    expect(parseDurationString("2h1m1s")).toBe(7261000);
  });

  it("returns null for invalid input", () => {
    expect(parseDurationString("invalid")).toBeNull();
    expect(parseDurationString(null)).toBeNull();
    expect(parseDurationString("")).toBeNull();
  });
});
```

### 现有项目结构

```
src/plugin/
├── rate-limit.ts          # ← 新建 (P1)
├── rate-limit.test.ts     # ← 新建 (P1)
├── accounts.ts            # 账号管理
├── accounts.test.ts       # 账号测试
├── config/
│   └── schema.ts          # 配置 schema
└── ...
```

---

## 验收标准

1. `bun test src/plugin/rate-limit.test.ts` 全部通过
2. 测试覆盖所有边界情况
3. 代码风格与项目一致

---

## 关键约束 (MUST NOT)

- ❌ 不修改 host 系统的 opencode 文件
- ❌ 不在 host 系统运行 opencode (只在 Docker 内)
- ❌ 不硬编码 5 小时刷新时间
- ❌ 不破坏现有测试

---

## 相关文档

| 文件 | 描述 |
|------|------|
| `.sisyphus/PROGRESS.md` | 进度追踪 (带问题解决记录) |
| `.sisyphus/plans/rate-limit-improvements.md` | 完整工作计划 |
| `README.md` | 项目说明 |
