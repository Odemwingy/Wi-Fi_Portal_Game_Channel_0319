# 项目上下文摘要

## 1. 项目目标

本项目是机上 Wi-Fi Portal 内的统一游戏频道，采用统一的 `Game Channel + Game Platform + Game Packages` 架构，而不是为每款游戏单独建设一套系统。

当前代码基线已经覆盖：

- 统一频道首页、专区、推荐位、筛选和 package 启动链路
- Platform API、房间、邀请码、WebSocket、断线重连、房间清理
- 积分规则、事件采集、排行榜、权益兑换、航司积分适配
- 后台登录、RBAC、审计、频道配置、运营配置
- Docker Compose、健康检查、指标、结构化日志、测试方案

## 2. 当前交付状态

截至当前基线：

- 已落地游戏数：`25 / 25`
- 已落地联机游戏：`15`
- 已落地单机游戏：`10`
- GitHub open issues：仅剩 `#1` `#2` `#3` `#4` `#5` 五个 epic
- GitHub Project：feature / task 基本已收敛为 `Done`

已落地的联机游戏：

- `quiz-duel`
- `word-rally`
- `memory-match-duel`
- `spot-the-difference-race`
- `mini-gomoku`
- `seat-map-strategy`
- `signal-scramble`
- `baggage-sort-showdown`
- `cabin-card-clash`
- `airline-trivia-teams`
- `tap-beat-battle`
- `route-builder-duel`
- `puzzle-race-grid`
- `skyline-defense-lite`
- `crew-coordination`

已落地的单机游戏：

- `cabin-puzzle`
- `runway-rush`
- `luggage-logic`
- `meal-cart-match`
- `window-view-memory`
- `flight-path-puzzler`
- `quiet-cabin-sudoku`
- `star-map-relax`
- `aircraft-fix-kit`
- `seat-upgrade-shuffle`

## 3. 仓库结构

- `apps/channel-web`
  - 乘客端频道、后台页面、各游戏 package 页面
- `apps/platform-api`
  - BFF、房间、联机 runtime、积分、航司、后台、可观测
- `packages/game-sdk`
  - metadata、BFF、联机、积分、权益、事件等共享合同
- `packages/shared-observability`
  - trace、结构化日志、错误模型
- `docs`
  - package 规范、rollout 计划、测试方案、发布手册、上下文和进度日志

## 4. 当前关键文档

- [game-package-spec.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/game-package-spec.md)
- [game-rollout-plan.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/game-rollout-plan.md)
- [test-strategy.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/test-strategy.md)
- [release-playbook.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/release-playbook.md)

## 5. Epic 对齐

### Epic #1 首期产品基线与项目骨架

已完成：

- monorepo / workspace / CI / TypeScript 工程栈
- Game Package metadata / SDK / 启动器规范
- rollout 计划与接入矩阵

仍保留 open 的原因：

- 它承担总揽性质，直到完整 25 款交付与首发收尾前不建议关闭

### Epic #2 乘客端游戏频道体验

已完成：

- 频道首页、推荐位、专区、排序筛选
- 多乘客视角模拟
- package launcher
- 多个独立 package 页面
- 后台配置驱动的频道内容生效

### Epic #3 统一游戏平台与联机底座

已完成：

- session bootstrap / channel config / catalog
- 房间、邀请码、join by invite、ready、leave、reconnect、cleanup
- WebSocket、snapshot、game_state、ack / error
- 多个联机 adapter 与 runtime

### Epic #4 积分、航司集成与后台运营

已完成：

- points / rewards / leaderboard / game events
- points rules engine
- airline sync / retry / outbox
- admin auth / RBAC / audit
- admin channel / admin operations

### Epic #5 部署、观测与首发验收

已完成：

- Docker Compose
- Redis backend
- `/api/health` `/api/health/ready` `/api/metrics`
- 结构化日志、trace、smoke、test strategy、release playbook

## 6. 下一步

优先顺序建议：

1. 对照 GitHub 上 5 个 epic 收口关闭条件，并做最终验收同步
