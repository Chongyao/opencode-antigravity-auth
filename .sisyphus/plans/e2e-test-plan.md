# P1-P5 端到端测试方案

## 工作总结

| 阶段 | 模块/文件 | 新增/修改 | 功能描述 |
|------|-----------|-----------|----------|
| **P1** | `rate-limit.ts` | 新增 | `parseDurationString()` - 解析组合时间格式 `2h1m30s`, `500ms` |
| **P1** | `rate-limit.ts` | 新增 | `parseIsoResetTime()` - 解析 ISO 8601 时间戳 |
| **P2** | `rate-limit.ts` | 新增 | `parseRateLimitReason()` - 解析限流原因类型 |
| **P2** | `rate-limit.ts` | 新增 | `getBackoffDelayMs()` - 根据原因返回智能退避时间 |
| **P2** | `rate-limit.ts` | 新增 | `parseRetryAfterHeader()` - 解析 Retry-After header |
| **P2** | `rate-limit.ts` | 新增 | `RateLimitReason` 类型定义 |
| **P3** | `config/schema.ts` | 修改 | 添加 `cache-first` 账号选择策略 |
| **P3** | `config/schema.ts` | 新增 | `QuotaWarmingConfigSchema` 配额预热配置 |
| **P3** | `config/loader.ts` | 修改 | 环境变量 `OPENCODE_ANTIGRAVITY_QUOTA_WARMING` 支持 |
| **P4** | `accounts.ts` | 修改 | `ManagedAccount.lastRateLimitReason` 新字段 |
| **P4** | `accounts.ts` | 修改 | `markRateLimited()` 接受 `reason` 参数 |
| **P5** | `plugin.ts` | 修改 | 导入 rate-limit 模块所有导出 |
| **P5** | `plugin.ts` | 修改 | 替换 `parseDurationToMs` → `parseDurationString` (3处) |
| **P5** | `plugin.ts` | 修改 | `RateLimitBodyInfo` 新增 `parsedReason` 字段 |
| **P5** | `plugin.ts` | 修改 | `extractRetryInfoFromBody` 调用 `parseRateLimitReason` |
| **P5** | `plugin.ts` | 修改 | 429 处理日志输出 `parsedReason` |
| **P5** | `plugin.ts` | 修改 | `markRateLimited` 传递 `parsedReason` (2处) |
| **测试** | `rate-limit.test.ts` | 新增 | 27 个单元测试用例 |

---

## 待补充: 日志增强

需要在 `src/plugin/debug.ts` 的 `logRateLimitEvent` 函数中添加 `parsedReason` 输出:

```typescript
// 在 bodyInfo 类型中添加 parsedReason (约 line 355)
bodyInfo: { message?: string; quotaResetTime?: string; retryDelayMs?: number | null; reason?: string; parsedReason?: string },

// 在函数末尾添加 (约 line 371 后)
if (bodyInfo.parsedReason) {
  logDebug(`[RateLimit] parsedReason: ${bodyInfo.parsedReason}`);
}
```

---

## 前置准备

```bash
# 1. 启用 DEBUG 模式 (level 2 = verbose)
export OPENCODE_ANTIGRAVITY_DEBUG=2

# 2. 进入开发容器
cd /home/zcy/workspace/cloned_projects/opencode-antigravity-auth
./scripts/dev-container.sh bash

# 3. 确认插件已构建
bun run build
```

---

## 测试矩阵

| # | 测试场景 | 验证功能 | 通过标准 |
|---|----------|----------|----------|
| 1 | 基础请求成功 | 插件正常工作 | 请求成功返回 |
| 2 | 时间解析 (组合格式) | `parseDurationString` | 日志正确解析 `2h1m30s` 格式 |
| 3 | 限流原因解析 | `parseRateLimitReason` | 日志显示 `parsedReason` |
| 4 | 账号状态记录 | `lastRateLimitReason` | JSON 文件包含该字段 |
| 5 | 智能退避 | `getBackoffDelayMs` | 退避时间递增 |
| 6 | 配置加载 | 环境变量支持 | 配置覆盖生效 |

---

## 详细测试步骤

### 测试 1: 基础请求

```bash
# 在 Docker 容器内
opencode run "Hello, say hi back" --model=google/antigravity-claude-sonnet-4-5
```

**预期**: 正常返回响应，无错误

---

### 测试 2-3: 触发 429 观察日志

```bash
# 方法 A: 快速连续发送请求触发限流
for i in {1..20}; do
  opencode run "test $i" --model=google/antigravity-claude-sonnet-4-5 &
done
wait

# 方法 B: 使用已知会触发限流的模型
opencode run "long response please" --model=google/antigravity-claude-opus-4-5-thinking --variant=max
```

**查看日志**:
```bash
# 日志位置
cat ~/.config/opencode/antigravity-logs/antigravity-debug-*.log | grep -E "(parsedReason|retryDelayMs|RateLimit)"

# 或实时查看
tail -f ~/.config/opencode/antigravity-logs/antigravity-debug-*.log
```

**预期日志输出**:
```
[2026-01-12T05:30:00.000Z] [RateLimit] 429 on user@gmail.com family=claude retryAfterMs=30000
[2026-01-12T05:30:00.001Z] [RateLimit] reason: QUOTA_EXHAUSTED
[2026-01-12T05:30:00.002Z] [RateLimit] parsedReason: QUOTA_EXHAUSTED
[2026-01-12T05:30:00.003Z] [RateLimit] body retryDelayMs: 30000
```

**关键验证点**:
- [ ] `parsedReason` 字段出现在日志中
- [ ] 值为 `QUOTA_EXHAUSTED` / `RATE_LIMIT_EXCEEDED` / `MODEL_CAPACITY_EXHAUSTED` 之一
- [ ] `retryDelayMs` 正确解析 (不是 null)

---

### 测试 4: 检查账号状态

```bash
# 触发 429 后检查
cat ~/.config/opencode/antigravity-accounts.json | jq '.'

# 只看 lastRateLimitReason
cat ~/.config/opencode/antigravity-accounts.json | jq '.accounts[0].lastRateLimitReason'
```

**预期输出**:
```json
{
  "version": 3,
  "accounts": [
    {
      "email": "user@gmail.com",
      "lastRateLimitReason": "QUOTA_EXHAUSTED",
      ...
    }
  ]
}
```

**关键验证点**:
- [ ] `lastRateLimitReason` 字段存在
- [ ] 值为有效的 `RateLimitReason` 类型

---

### 测试 5: 智能退避验证

连续触发多次 429，观察退避时间变化:

```bash
# 观察日志中的等待时间
grep -E "(backoff|delayMs|Waiting)" ~/.config/opencode/antigravity-logs/antigravity-debug-*.log
```

**预期退避时间** (根据 `getBackoffDelayMs`):

| 原因 | 首次 | 第2次 | 第3次 | 第4次+ |
|------|------|-------|-------|--------|
| `QUOTA_EXHAUSTED` | 60s | 5min | 30min | 2h |
| `RATE_LIMIT_EXCEEDED` | 30s | 30s | 30s | 30s |
| `MODEL_CAPACITY_EXHAUSTED` | 15s | 15s | 15s | 15s |

---

### 测试 6: 配置加载

```bash
# 设置环境变量
export OPENCODE_ANTIGRAVITY_QUOTA_WARMING=true
export OPENCODE_ANTIGRAVITY_ACCOUNT_SELECTION_STRATEGY=cache-first

# 运行并检查配置是否生效
opencode run "test config" --model=google/antigravity-claude-sonnet-4-5

# 查看日志确认配置加载
grep -E "(config|strategy)" ~/.config/opencode/antigravity-logs/antigravity-debug-*.log
```

---

## 验证清单

在测试完成后，勾选以下项目:

### 核心功能

- [ ] **P1: 时间解析**
  - [ ] `parseDurationString` 正确解析 `30s`, `2m`, `1h`
  - [ ] `parseDurationString` 正确解析组合格式 `2h1m30s`
  - [ ] `parseIsoResetTime` 正确解析 ISO 时间戳

- [ ] **P2: 限流原因解析**
  - [ ] `parseRateLimitReason` 返回正确的原因类型
  - [ ] `getBackoffDelayMs` 根据原因返回不同退避时间
  - [ ] `parseRetryAfterHeader` 正确解析 header

- [ ] **P3: 配置更新**
  - [ ] `cache-first` 策略可选
  - [ ] `QuotaWarmingConfig` 可配置
  - [ ] 环境变量 `OPENCODE_ANTIGRAVITY_QUOTA_WARMING` 生效

- [ ] **P4: 账号状态**
  - [ ] `lastRateLimitReason` 字段正确保存到 JSON
  - [ ] `markRateLimited()` 正确接收并存储 reason

- [ ] **P5: 插件集成**
  - [ ] 429 响应正确解析 `parsedReason`
  - [ ] 日志输出 `parsedReason`
  - [ ] 账号状态持久化包含 reason

### 日志验证

- [ ] DEBUG 模式 (`OPENCODE_ANTIGRAVITY_DEBUG=1`) 输出基本日志
- [ ] VERBOSE 模式 (`OPENCODE_ANTIGRAVITY_DEBUG=2`) 输出完整请求/响应
- [ ] 429 事件日志包含所有字段:
  - [ ] `reason` (原始 API 返回)
  - [ ] `parsedReason` (解析后的类型)
  - [ ] `retryDelayMs` (退避时间)
  - [ ] `quotaResetTime` (如果有)

---

## 故障排查

### 日志没有输出

```bash
# 确认 DEBUG 已启用
echo $OPENCODE_ANTIGRAVITY_DEBUG  # 应为 1 或 2

# 确认日志目录存在
ls -la ~/.config/opencode/antigravity-logs/
```

### 429 没有触发

- 尝试使用更耗配额的模型 (如 `antigravity-claude-opus-4-5-thinking`)
- 并发发送多个请求
- 检查账号配额是否已经耗尽

### parsedReason 为 UNKNOWN

- 检查原始响应体格式是否符合预期
- 查看 VERBOSE 日志中的完整响应体

---

## 测试完成后

1. 记录测试结果到此文档
2. 如有问题，记录具体日志和错误信息
3. 反馈给开发者进行修复
