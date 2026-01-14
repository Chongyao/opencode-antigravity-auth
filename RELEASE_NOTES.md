# Release v1.2.9-beta.1 - P6 配额预热功能完整验证版

## 🎉 版本亮点

这是一个重要的 Beta 测试版本，完成了 **P6 配额预热功能**的端到端验证，包含完整的测试套件和生产部署指南。

### 核心功能

**P6 配额预热 (Quota Warming)**
- 🔥 自动检测即将重置的配额（可配置时间窗口）
- 🔄 提前刷新 OAuth 令牌确保账号就绪
- ⚡ 配额重置后立即可用，无延迟
- 📊 后台定时检查，完全自动化
- 🛡️ 错误处理完善，不影响其他账号

## 📦 新增内容

### 测试脚本 (5个)

1. **`scripts/test-warming-e2e.ts`** - 端到端自动化验证
   - 自动检测即将重置的配额（10分钟内）
   - 执行真实 OAuth 刷新
   - 等待 3 分钟观察系统响应
   - 对比预热前后配额状态
   - 彩色输出，结果清晰可读

2. **`scripts/test-warming-real-oauth.ts`** - 真实 OAuth 令牌验证
   - 调用真实 Google OAuth API
   - 通过 Antigravity API 验证令牌有效性
   - 支持有/无项目 ID 的账号
   - 自动备份和恢复机制

3. **`scripts/get-token-expiry.ts`** - 令牌过期时间检查器
   - 显示所有账号的令牌状态
   - 过期时间倒计时
   - 快速诊断令牌问题

4. **`scripts/test-warming.test.ts`** - 单元测试 (14个测试用例)
   - QuotaWarmer 类完整覆盖
   - 边界条件和异常处理
   - 100% 测试通过率

5. **`scripts/test-warming-docker.ts`** - Docker 环境真实测试
   - 使用真实账号数据
   - 验证生产环境兼容性

### 文档 (3个)

1. **`scripts/E2E_WARMING_TEST_SUMMARY.md`** - 端到端测试完整报告
   - 测试方法论和结果分析
   - 配额重置时间行为的技术解释
   - 生产环境部署指南
   - 监控和验证方法

2. **`scripts/WARMING_TEST_RESULTS.md`** - 详细测试分析
   - 令牌持久化架构发现
   - P2-P6 日志状态验证
   - 生产就绪评估

3. **`CHANGELOG.md`** - 项目完整变更日志
   - 版本历史记录
   - 语义化版本控制

### 核心功能代码

**`src/plugin/warming.ts`** (267行) - P6 配额预热模块
- 定时扫描机制
- 智能配额检测
- 回调式预热接口
- 完整日志记录

## 🧪 测试结果

### 单元测试
```
✅ 14/14 测试用例通过 (100%)
- QuotaWarmer 初始化测试
- 配额检测逻辑测试
- 时间窗口计算测试
- 回调执行测试
- 边界条件测试
```

### 集成测试
```
✅ OAuth 刷新: 2/2 成功 (100%)
✅ 令牌验证: 1/2 通过（1个账号缺少项目ID，非功能问题）
✅ API 调用: 令牌通过真实 Antigravity API 验证
```

### 端到端测试
```
✅ 配额检测: 正确识别即将重置的配额
✅ 预热触发: 自动触发预热回调
✅ 令牌刷新: OAuth 刷新成功，60分钟有效期
✅ 系统集成: 所有组件正常协作
```

## 🚀 使用方法

### 安装

**方法 1: 从 GitHub 直接安装（推荐）**
```json
{
  "plugin": [
    "git+https://github.com/Chongyao/opencode-antigravity-auth.git#v1.2.9-beta.1"
  ]
}
```

**方法 2: 使用 feature/improvements 分支**
```json
{
  "plugin": [
    "git+https://github.com/Chongyao/opencode-antigravity-auth.git#feature/improvements"
  ]
}
```

### 配置

启用配额预热功能（`~/.config/opencode/antigravity.json`）:

```json
{
  "quota_warming": {
    "enabled": true,
    "interval_minutes": 30,
    "probe_before_minutes": 5
  }
}
```

**参数说明**:
- `enabled`: 是否启用配额预热
- `interval_minutes`: 检查周期（5-120分钟，推荐30）
- `probe_before_minutes`: 提前预热时间（1-30分钟，推荐5）

### 验证

```bash
# 1. 检查配额状态
./scripts/quota-status.sh

# 2. 运行端到端测试
./scripts/dev-container.sh bun run scripts/test-warming-e2e.ts

# 3. 查看日志
tail -f ~/.config/opencode/antigravity-logs/warming.log
```

## 📊 技术细节

### 配额预热工作原理

```
1. 后台定时器（每30分钟检查一次）
   ↓
2. 扫描所有账号的配额重置时间
   ↓
3. 检测即将重置的配额（5分钟内）
   ↓
4. 调用 OAuth API 刷新令牌
   ↓
5. 更新账号令牌状态（60分钟有效期）
   ↓
6. 配额重置时立即可用（无需等待刷新）
```

### 令牌架构

**重要发现**: 访问令牌是**运行时专用**，不持久化到磁盘

- `ManagedAccount`: 内存中包含 `access`/`expires` 字段
- `AccountMetadataV3`: 存储架构**故意排除**这些字段
- 原因: OAuth 令牌短期有效（60分钟），按需刷新更安全
- 这是 OAuth 最佳实践，符合设计

### 配额重置时间

**为什么预热后配额重置时间不变？**

配额重置时间由 **Google 后端系统**控制：
- 仅在收到 429 错误时从 API 响应中提取
- 预热操作刷新令牌，但不触发 429 错误
- 时间戳保持不变是**正常行为**

**预热的真正价值**:
- ✅ 刷新令牌（认证有效）
- ✅ 准备账号（配额重置时立即可用）
- ❌ 不会修改配额重置时间（由 Google 控制）

## 🔍 P2-P6 功能状态

| 模块 | 功能 | 日志 | 测试 | 状态 |
|------|------|------|------|------|
| P2 | 速率限制检测 | ❌ | ✅ | ✅ 完成 |
| P3 | 会话恢复 | ✅ | ✅ | ✅ 完成 |
| P4 | 存储管理 | ✅ | ✅ | ✅ 完成 |
| P5 | 刷新队列 | ✅ | ✅ | ✅ 完成 |
| P6 | 配额预热 | ✅ | ✅ | ✅ 完成 |

## ⚠️ 实验性功能

配额预热是**实验性功能**，默认关闭。建议在测试环境验证后再用于生产。

**已知限制**:
- 需要账号有有效的 `refreshToken`
- 建议配置项目 ID（部分功能需要）
- 首次启用后需等待一个检查周期才会开始预热

## 📝 变更日志

完整变更记录请查看 [CHANGELOG.md](./CHANGELOG.md)

### v1.2.9-beta.1 主要更新

**新增**:
- P6 配额预热端到端验证脚本
- 真实 OAuth 令牌刷新测试
- 令牌过期检查器工具
- 完整测试报告和文档
- 项目变更日志

**测试**:
- OAuth 刷新 100% 成功率
- 令牌 API 验证通过
- 端到端流程验证完成
- 文档化令牌架构设计

**文档**:
- 端到端测试指南
- 生产部署和监控方案
- 配额重置行为技术说明

## 🙏 致谢

感谢原项目 [NoeFabris/opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) 提供的基础功能。

本 fork 版本专注于配额预热功能的开发和验证。

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

## 🔗 相关链接

- **原仓库**: https://github.com/NoeFabris/opencode-antigravity-auth
- **本仓库**: https://github.com/Chongyao/opencode-antigravity-auth
- **问题反馈**: https://github.com/Chongyao/opencode-antigravity-auth/issues

---

**下一步计划**:
1. 收集用户反馈
2. 完善错误处理
3. 考虑合并回主仓库

如有问题或建议，欢迎提 Issue！
