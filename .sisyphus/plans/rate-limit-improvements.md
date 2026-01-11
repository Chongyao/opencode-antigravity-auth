# Work Plan: Rate Limit Improvements

> 创建时间: 2026-01-12
> 进度追踪: [.sisyphus/PROGRESS.md](../PROGRESS.md)

---

## Context

### Original Request
为 opencode-antigravity-auth 插件实现智能限流跟踪、精确配额刷新时间解析、CacheFirst 调度模式和配额预热机制。

### Interview Summary

**Key Decisions**:
- Q1: QUOTA_EXHAUSTED 使用精确锁定 (quotaResetTimeStamp)
- Q2: CacheFirst 模式区分限流原因 (QUOTA 立即切换，其他等待)
- Q3: 预热模型使用 Claude Sonnet 4.5
- Q4: 预热触发使用混合策略 (定时器 + 惰性)
- Q5: 预热失败有限重试 (3次)
- Q6: 预热配置默认开启
- Q7: 只预热 Claude 配额池
- Q8: 预热响应记录日志
- Q9: 配额状态独立文件存储
- Q10: 测试覆盖尽可能全面

### Antigravity 配额机制
- 刷新周期: 首次调用后 5 小时刷新 (时间从服务器获取，不硬编码)
- 时间源: 服务器返回 `quotaResetTimeStamp` (ISO 8601)

---

## Work Objectives

### Core Objective
实现智能限流系统，包括限流原因分类、差异化退避、精确配额锁定、CacheFirst 模式和配额预热。

### Concrete Deliverables
- `src/plugin/rate-limit.ts` - 限流核心模块
- `src/plugin/rate-limit.test.ts` - 单元测试
- `src/plugin/quota-state.ts` - 配额状态存储
- `src/plugin/quota-warmer.ts` - 预热逻辑
- `src/plugin/quota-warmer.test.ts` - 预热测试
- 更新的 `schema.ts`, `accounts.ts`, `plugin.ts`
- 更新的 `README.md`

### Definition of Done
- [ ] 所有新功能有对应的单元测试
- [ ] `bun test` 全部通过
- [ ] Docker 容器中 opencode 可正常运行
- [ ] README 文档更新完成

### Must NOT Have (Guardrails)
- ❌ 不修改当前系统中的 opencode 文件
- ❌ 不运行当前系统中的 opencode
- ❌ 不修改 OAuth 认证流程
- ❌ 不硬编码 5 小时刷新时间
- ❌ 不破坏现有策略行为 (sticky, round-robin, hybrid)
- ❌ 不在预热时使用真实用户 session
- ❌ 不过度抽象

### 开发环境约束
- 所有测试在 Docker 容器 `opencode-plugin-dev` 中执行
- 代码修改只在项目目录内进行
- 账号配置以只读方式挂载到容器

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **User wants tests**: YES (TDD approach where applicable)
- **Framework**: bun test
- **QA approach**: 单元测试 + 集成测试 + Docker 验证

---

## Task Flow

```
P0 (环境) → P1 (时间解析) → P2 (限流模块) → P3 (配置)
                                              ↓
                              P4 (存储) → P5 (集成) → P6 (预热) → P7 (文档)
```

---

# P0: 开发环境搭建

## 目标
确保 Docker 开发环境正常工作，现有代码和测试能在容器中运行。

---

### TODO 0.1: 验证 Docker 容器可用性

**What to do**:
- 启动容器并挂载项目目录
- 验证 bun 版本和工具链

**Must NOT do**:
- 不在宿主机运行任何 opencode 命令

**Parallelizable**: NO (第一步)

**References**:
- Docker image: `opencode-plugin-dev:latest`
- 工作目录: `/workspace`
- Bun 版本: 1.3.5

**Acceptance Criteria**:
```bash
docker run --rm \
  -v /home/zcy/workspace/cloned_projects/opencode-antigravity-auth:/workspace \
  opencode-plugin-dev:latest \
  ls -la /workspace/package.json
# 期望: 显示 package.json 文件信息
```

---

### TODO 0.2: 安装项目依赖

**What to do**:
- 在容器中运行 `bun install`
- 验证 node_modules 创建成功

**Parallelizable**: NO (依赖 0.1)

**Acceptance Criteria**:
```bash
docker run --rm \
  -v /home/zcy/workspace/cloned_projects/opencode-antigravity-auth:/workspace \
  -w /workspace \
  opencode-plugin-dev:latest \
  sh -c "bun install && ls node_modules | head -5"
# 期望: 依赖安装成功，显示部分模块名
```

---

### TODO 0.3: 运行现有测试

**What to do**:
- 运行 `bun test`
- 确认所有现有测试通过

**Parallelizable**: NO (依赖 0.2)

**Acceptance Criteria**:
```bash
docker run --rm \
  -v /home/zcy/workspace/cloned_projects/opencode-antigravity-auth:/workspace \
  -w /workspace \
  opencode-plugin-dev:latest \
  bun test
# 期望: 所有现有测试通过 (0 failures)
```

---

### TODO 0.4: 验证账号配置可访问

**What to do**:
- 检查宿主机账号文件存在
- 测试以只读方式挂载到容器

**Parallelizable**: YES (与 0.3 并行)

**Acceptance Criteria**:
```bash
docker run --rm \
  -v ~/.config/opencode/antigravity-accounts.json:/root/.config/opencode/antigravity-accounts.json:ro \
  opencode-plugin-dev:latest \
  cat /root/.config/opencode/antigravity-accounts.json | head -5
# 期望: 显示账号 JSON (version, accounts)
```

---

### TODO 0.5: 创建开发启动脚本

**What to do**:
- 创建 `scripts/dev-container.sh`
- 包含完整挂载配置

**Parallelizable**: NO (依赖 0.1-0.4 验证)

**产出文件**: `scripts/dev-container.sh`

**Acceptance Criteria**:
```bash
chmod +x scripts/dev-container.sh
./scripts/dev-container.sh bun --version
# 期望: 输出 1.3.5
```

**Commit**: YES
- Message: `chore: add docker dev container script`
- Files: `scripts/dev-container.sh`

---

### TODO 0.6: 用户确认 - Docker 中 opencode 运行验证

**What to do**:
- 在容器中启动 opencode
- 验证可以使用挂载的 antigravity 账号
- **需要用户手动确认**

**Parallelizable**: NO (最后一步)

**Acceptance Criteria**:
- [ ] 用户确认: Docker 容器中 opencode 可启动
- [ ] 用户确认: opencode 可识别挂载的账号配置
- [ ] 用户确认: 基本的 API 调用能成功 (可选)

**验证命令示例**:
```bash
./scripts/dev-container.sh opencode --version
./scripts/dev-container.sh opencode auth status
```

---

## P0 Checkpoint

| # | 检查项 | 验证命令 | 期望结果 |
|---|--------|----------|----------|
| 1 | Docker 容器可启动 | `docker run --rm opencode-plugin-dev echo OK` | "OK" |
| 2 | 项目目录可挂载 | `./scripts/dev-container.sh ls package.json` | 文件可见 |
| 3 | 依赖安装成功 | `./scripts/dev-container.sh ls node_modules \| wc -l` | > 50 |
| 4 | 现有测试通过 | `./scripts/dev-container.sh bun test` | 0 failures |
| 5 | 账号配置可访问 | 容器内读取账号文件 | JSON 可见 |
| 6 | 开发脚本可用 | `./scripts/dev-container.sh bun --version` | 1.3.5 |
| 7 | **用户确认** | opencode 在容器中运行 | 用户确认通过 |

**P0 完成标志**: 用户确认 #7 后，可进入 P1。

---

# P1: 时间解析模块

## 目标
创建时间解析基础设施，支持组合格式 (`2h1m1s`) 和 ISO 8601 (`2026-01-08T17:00:00Z`)。

## 依赖
- P0 完成 (Docker 环境就绪)

---

### TODO 1.1: 创建 rate-limit.ts 模块骨架

**What to do**:
- 创建 `src/plugin/rate-limit.ts` 文件
- 定义模块结构和导出接口
- 添加基本类型定义

**Must NOT do**:
- 不在此步骤实现具体逻辑
- 不引入外部依赖

**Parallelizable**: NO (第一步)

**产出文件**: `src/plugin/rate-limit.ts`

**文件骨架**:
```typescript
/**
 * Rate limit handling module.
 * 
 * Provides:
 * - Duration string parsing (e.g., "2h1m1s" → milliseconds)
 * - ISO 8601 reset time parsing
 * - Rate limit reason classification
 * - Differentiated backoff strategies
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Rate limit reason classification.
 * Different reasons require different backoff strategies.
 */
export type RateLimitReason =
  | 'QUOTA_EXHAUSTED'           // 日配额耗尽 → 精确锁定或递增退避
  | 'RATE_LIMIT_EXCEEDED'       // TPM/RPM → 短暂等待 (30s)
  | 'MODEL_CAPACITY_EXHAUSTED'  // GPU 不足 → 短暂等待 (15s)
  | 'SERVER_ERROR'              // 5xx → 软避让 (20s)
  | 'UNKNOWN';                  // 未知 → 默认 (60s)

// ============================================================================
// Duration Parsing
// ============================================================================

export function parseDurationString(duration: string): number | null {
  // TODO: Implement in 1.2
  return null;
}

// ============================================================================
// ISO Time Parsing
// ============================================================================

export function parseIsoResetTime(isoString: string): number | null {
  // TODO: Implement in 1.3
  return null;
}
```

**Acceptance Criteria**:
```bash
# 文件存在且无语法错误
./scripts/dev-container.sh sh -c "cat src/plugin/rate-limit.ts && bun build src/plugin/rate-limit.ts --outdir=/tmp"
# 期望: 文件内容显示，构建成功
```

---

### TODO 1.2: 实现 parseDurationString()

**What to do**:
- 实现组合格式时间解析: `2h1m1s`, `1h30m`, `5m`, `30s`, `500ms`
- 返回毫秒数
- 无效输入返回 `null`

**Must NOT do**:
- 不引入第三方库 (纯正则实现)
- 不处理负数或异常大的值

**Parallelizable**: NO (依赖 1.1)

**References**:
- 参考 Rust 实现: `Antigravity-Manager/src-tauri/src/proxy/rate_limit.rs:314-355`
- 正则模式: `(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?`

**实现逻辑**:
```typescript
export function parseDurationString(duration: string): number | null {
  if (!duration || typeof duration !== 'string') {
    return null;
  }

  const trimmed = duration.trim();
  if (!trimmed) {
    return null;
  }

  // 正则匹配: 可选的 h/m/s/ms 组合
  const regex = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/i;
  const match = trimmed.match(regex);
  
  if (!match) {
    return null;
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseFloat(match[3]) : 0;
  const milliseconds = match[4] ? parseInt(match[4], 10) : 0;

  // 如果全部为 0，说明没有匹配到任何有效部分
  if (hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0) {
    return null;
  }

  const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
  return Math.ceil(totalMs);
}
```

**Acceptance Criteria**:
```bash
# 在 1.4 测试中验证以下用例:
# parseDurationString("2h1m1s") === 7261000
# parseDurationString("30s") === 30000
# parseDurationString("1h30m") === 5400000
# parseDurationString("500ms") === 500
# parseDurationString("invalid") === null
# parseDurationString("") === null
```

---

### TODO 1.3: 实现 parseIsoResetTime()

**What to do**:
- 解析 ISO 8601 时间字符串: `2026-01-08T17:00:00Z`
- 返回 Unix 时间戳 (毫秒)
- 无效输入返回 `null`

**Must NOT do**:
- 不引入 dayjs/moment 等库 (使用原生 Date)
- 不处理时区转换 (假设服务器返回 UTC)

**Parallelizable**: YES (与 1.2 并行)

**References**:
- 参考 Rust 实现: `Antigravity-Manager/src-tauri/src/proxy/rate_limit.rs:123-140`
- 使用 `chrono::DateTime::parse_from_rfc3339`

**实现逻辑**:
```typescript
export function parseIsoResetTime(isoString: string): number | null {
  if (!isoString || typeof isoString !== 'string') {
    return null;
  }

  const trimmed = isoString.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const date = new Date(trimmed);
    
    // 检查是否为有效日期
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.getTime();
  } catch {
    return null;
  }
}
```

**Acceptance Criteria**:
```bash
# 在 1.4 测试中验证以下用例:
# parseIsoResetTime("2026-01-08T17:00:00Z") === 1767888000000
# parseIsoResetTime("2026-01-08T17:00:00.000Z") === 1767888000000
# parseIsoResetTime("invalid") === null
# parseIsoResetTime("") === null
```

---

### TODO 1.4: 创建单元测试

**What to do**:
- 创建 `src/plugin/rate-limit.test.ts`
- 为 `parseDurationString` 编写 10+ 测试用例
- 为 `parseIsoResetTime` 编写 5+ 测试用例
- 覆盖边界情况和异常输入

**Must NOT do**:
- 不测试未实现的函数 (RateLimitReason 等)

**Parallelizable**: NO (依赖 1.2, 1.3)

**产出文件**: `src/plugin/rate-limit.test.ts`

**测试用例设计**:
```typescript
import { describe, expect, test } from "bun:test";
import { parseDurationString, parseIsoResetTime } from "./rate-limit";

describe("parseDurationString", () => {
  // 基本格式
  test("parses hours only: 2h", () => {
    expect(parseDurationString("2h")).toBe(7200000);
  });

  test("parses minutes only: 30m", () => {
    expect(parseDurationString("30m")).toBe(1800000);
  });

  test("parses seconds only: 45s", () => {
    expect(parseDurationString("45s")).toBe(45000);
  });

  test("parses milliseconds only: 500ms", () => {
    expect(parseDurationString("500ms")).toBe(500);
  });

  // 组合格式
  test("parses full combo: 2h1m1s", () => {
    expect(parseDurationString("2h1m1s")).toBe(7261000);
  });

  test("parses hours and minutes: 1h30m", () => {
    expect(parseDurationString("1h30m")).toBe(5400000);
  });

  test("parses minutes and seconds: 5m30s", () => {
    expect(parseDurationString("5m30s")).toBe(330000);
  });

  // 小数秒
  test("parses decimal seconds: 1.5s", () => {
    expect(parseDurationString("1.5s")).toBe(1500);
  });

  // 边界情况
  test("returns null for empty string", () => {
    expect(parseDurationString("")).toBeNull();
  });

  test("returns null for invalid format", () => {
    expect(parseDurationString("invalid")).toBeNull();
  });

  test("returns null for null input", () => {
    expect(parseDurationString(null as any)).toBeNull();
  });

  // 大小写不敏感
  test("case insensitive: 2H1M1S", () => {
    expect(parseDurationString("2H1M1S")).toBe(7261000);
  });
});

describe("parseIsoResetTime", () => {
  test("parses standard ISO format", () => {
    const result = parseIsoResetTime("2026-01-08T17:00:00Z");
    expect(result).toBe(new Date("2026-01-08T17:00:00Z").getTime());
  });

  test("parses ISO format with milliseconds", () => {
    const result = parseIsoResetTime("2026-01-08T17:00:00.000Z");
    expect(result).toBe(new Date("2026-01-08T17:00:00.000Z").getTime());
  });

  test("parses ISO format with timezone offset", () => {
    const result = parseIsoResetTime("2026-01-08T17:00:00+00:00");
    expect(result).toBe(new Date("2026-01-08T17:00:00+00:00").getTime());
  });

  test("returns null for invalid date", () => {
    expect(parseIsoResetTime("invalid")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseIsoResetTime("")).toBeNull();
  });

  test("returns null for null input", () => {
    expect(parseIsoResetTime(null as any)).toBeNull();
  });
});
```

**Acceptance Criteria**:
```bash
./scripts/dev-container.sh bun test src/plugin/rate-limit.test.ts
# 期望: 所有测试通过 (15+ tests, 0 failures)
```

**Commit**: YES
- Message: `feat(rate-limit): add duration and ISO time parsing utilities`
- Files: `src/plugin/rate-limit.ts`, `src/plugin/rate-limit.test.ts`
- Pre-commit: `bun test src/plugin/rate-limit.test.ts`

---

## P1 Checkpoint

| # | 检查项 | 验证命令 | 期望结果 |
|---|--------|----------|----------|
| 1 | rate-limit.ts 存在 | `ls src/plugin/rate-limit.ts` | 文件存在 |
| 2 | 无 TypeScript 错误 | `./scripts/dev-container.sh bun build src/plugin/rate-limit.ts` | 构建成功 |
| 3 | parseDurationString 测试通过 | `bun test -t "parseDurationString"` | 10+ 用例通过 |
| 4 | parseIsoResetTime 测试通过 | `bun test -t "parseIsoResetTime"` | 5+ 用例通过 |
| 5 | 全部测试通过 | `./scripts/dev-container.sh bun test` | 0 failures |
| 6 | 代码已提交 | `git log -1 --oneline` | 包含 rate-limit commit |

**P1 完成标志**: 所有检查项通过后，可进入 P2。

---

# P2-P7: 待后续展开

详见 [PROGRESS.md](../PROGRESS.md) 追踪整体进度。

---

## Success Criteria

### Final Verification Commands
```bash
# 在 Docker 容器中
./scripts/dev-container.sh bun test
# 期望: 所有测试通过

./scripts/dev-container.sh bun run build
# 期望: 构建成功
```

### Final Checklist
- [ ] 所有 P0-P7 任务完成
- [ ] 所有测试通过
- [ ] README 文档更新
- [ ] 无 TypeScript 类型错误
