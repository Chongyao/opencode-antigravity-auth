# Rate Limit Improvements - 进度总结

> 最后更新: 2026-01-12

## 总体进度

| 阶段 | 状态 | 描述 |
|------|------|------|
| P0 | ✅ 完成 | 开发环境搭建 |
| P1 | ⬜ 待开始 | 时间解析模块 |
| P2 | ⬜ 待开始 | 智能限流模块 |
| P3 | ⬜ 待开始 | 配置 Schema 更新 |
| P4 | ⬜ 待开始 | 账号与存储层更新 |
| P5 | ⬜ 待开始 | Plugin 主逻辑集成 |
| P6 | ⬜ 待开始 | 配额预热模块 |
| P7 | ⬜ 待开始 | 文档更新 |

---

## P0: 开发环境搭建 ✅

- [x] 0.1 验证 Docker 容器可用性
- [x] 0.2 安装项目依赖
- [x] 0.3 运行现有测试 (472 pass, 60 fail - 预存在的 vitest 兼容性问题)
- [x] 0.4 验证账号配置可访问
- [x] 0.5 创建开发启动脚本
- [x] 0.6 Docker 中 opencode API 调用验证通过
  - [x] `opencode auth list` 显示 1 credentials (Google OAuth)
  - [x] `antigravity-claude-sonnet-4-5` 3轮对话成功
  - [x] `antigravity-gemini-3-flash` 验证成功

### P0 遇到的问题及解决方案

#### 问题 1: Docker 容器网络无法访问外网

**现象**: `curl https://www.google.com` 在容器内超时

**根因**: Host 使用代理 `http://127.0.0.1:20171`，但容器内 `127.0.0.1` 指向容器自身，导致代理不可达

**解决方案**: 
1. 添加 `--network=host` 使容器共享 host 网络栈
2. 转发代理环境变量到容器内

```bash
# dev-container.sh 关键修改
PROXY_ARGS=""
[ -n "$http_proxy" ] && PROXY_ARGS="$PROXY_ARGS -e http_proxy=$http_proxy"
[ -n "$https_proxy" ] && PROXY_ARGS="$PROXY_ARGS -e https_proxy=$https_proxy"
# ...

docker run --network=host $PROXY_ARGS ...
```

#### 问题 2: 插件无法写入 lock 文件

**现象**: `Error: EROFS: read-only file system, mkdir '/root/.config/opencode/antigravity-accounts.json.lock'`

**根因**: opencode 配置目录挂载为只读 (`:ro`)，但 antigravity 插件需要创建 `.lock` 文件进行账号轮换状态持久化

**解决方案**: 移除 `:ro` 只读标志，允许容器写入配置目录

```bash
# 修改前
MOUNT_ARGS="$MOUNT_ARGS -v $OPENCODE_CONFIG_DIR:/root/.config/opencode:ro"

# 修改后
MOUNT_ARGS="$MOUNT_ARGS -v $OPENCODE_CONFIG_DIR:/root/.config/opencode"
```

#### 问题 3: opencode.json 未挂载导致模型找不到

**现象**: `ProviderModelNotFoundError: modelID: "antigravity-claude-sonnet-4-5"`

**根因**: 最初只挂载了 `antigravity-accounts.json`，没有挂载包含模型定义的 `opencode.json`

**解决方案**: 挂载整个 `~/.config/opencode/` 目录而非单个文件

```bash
# 修改前
MOUNT_ARGS="$MOUNT_ARGS -v $ACCOUNTS_FILE:/root/.config/opencode/antigravity-accounts.json:ro"

# 修改后
MOUNT_ARGS="$MOUNT_ARGS -v $OPENCODE_CONFIG_DIR:/root/.config/opencode"
```

---

## P1: 时间解析模块

- [ ] 1.1 创建 `src/plugin/rate-limit.ts` 骨架
  - [ ] 文件创建
  - [ ] 类型定义 (RateLimitReason)
  - [ ] 函数签名导出
- [ ] 1.2 实现 `parseDurationString()`
  - [ ] 基本格式 (h/m/s/ms)
  - [ ] 组合格式 (2h1m1s)
  - [ ] 小数秒 (1.5s)
  - [ ] 边界处理 (null/empty/invalid)
- [ ] 1.3 实现 `parseIsoResetTime()`
  - [ ] ISO 8601 标准格式
  - [ ] 带毫秒格式
  - [ ] 时区偏移格式
  - [ ] 边界处理
- [ ] 1.4 单元测试
  - [ ] parseDurationString 10+ 用例
  - [ ] parseIsoResetTime 5+ 用例
  - [ ] 全部通过
- [ ] **P1 Checkpoint**: 代码提交

---

## P2: 智能限流模块

- [ ] 2.1 定义 `RateLimitReason` 枚举
- [ ] 2.2 实现 `parseRateLimitReason()`
- [ ] 2.3 实现 `getBackoffDelayMs()`
- [ ] 2.4 实现精确锁定逻辑
- [ ] 2.5 单元测试 + 集成测试

---

## P3: 配置 Schema 更新

- [ ] 3.1 添加 `cache-first` 到 AccountSelectionStrategy
- [ ] 3.2 添加 `quota_warming` 配置
- [ ] 3.3 更新 DEFAULT_CONFIG
- [ ] 3.4 更新 loader.ts 环境变量支持

---

## P4: 账号与存储层更新

- [ ] 4.1 ManagedAccount 添加 `lastRateLimitReason`
- [ ] 4.2 创建 `quota-state.ts` 独立存储
- [ ] 4.3 持久化测试

---

## P5: Plugin 主逻辑集成

- [ ] 5.1 替换 `getRateLimitBackoff()`
- [ ] 5.2 实现 `cache-first` 策略
- [ ] 5.3 重构 429 处理逻辑
- [ ] 5.4 集成测试

---

## P6: 配额预热模块

- [ ] 6.1 创建 `QuotaWarmer` 类
- [ ] 6.2 实现后台定时器
- [ ] 6.3 实现惰性触发
- [ ] 6.4 实现重试机制
- [ ] 6.5 单元测试 + 集成测试

---

## P7: 文档更新

- [ ] 7.1 README.md 新功能说明
- [ ] 7.2 配置项文档

---

## 符号说明

| 符号 | 含义 |
|------|------|
| ✅ | 已完成 |
| ⏳ | 进行中 |
| ⬜ | 待开始 |
| ❌ | 已取消/阻塞 |
