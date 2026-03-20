# 游戏接入清单、分批计划与验收矩阵

## 1. 规划边界

本清单基于以下已确认前提整理：

- PRD 要求总计 `25` 款游戏，其中 `15` 款支持单机 + 联机对战，`10` 款为单机游戏。
- 技术架构采用统一 `Game Channel + Game Platform + Game Packages`，联机仅考虑机上局域网内对战。
- 首发目标不是一次性交付 25 款，而是先用 `2-5` 款代表性游戏跑通频道、启动器、房间、实时协议、积分与权益闭环。
- 当前代码基线里已经有八款验证游戏：
  - `quiz-duel`：双人答题对战，已接入房间、WS、积分、独立 package 页面。
  - `cabin-puzzle`：单机拼图，已接入启动器与独立 package 页面。
  - `word-rally`：双人词汇回合对战，已接入房间、WS、积分与独立 package 页面。
  - `memory-match-duel`：双人翻牌配对，已接入房间、WS、积分与独立 package 页面。
  - `mini-gomoku`：双人轻量五子棋，已接入房间、WS、胜负判定与独立 package 页面。
  - `seat-map-strategy`：双人机舱占格策略，已接入房间、WS、计分规则与独立 package 页面。
  - `spot-the-difference-race`：双人低频找不同竞速，已接入房间、WS、scene pack、单机/联机共用 package 页面。
  - `runway-rush`：单机反应挑战，已接入启动器、积分与独立 package 页面。

## 2. 选型原则

### 2.1 优先原则

- 首选 `短时局`：单局 `2-5` 分钟，适合机上碎片时间。
- 首选 `轻交互`：单指点击、拖拽、少量输入，避免复杂手势。
- 首选 `弱网友好`：允许 turn-based 或低频同步，不依赖高帧率实时同步。
- 首选 `规则清晰`：乘客无需教程即可在 `30` 秒内理解玩法。
- 首选 `积分友好`：能稳定定义开始、完成、胜负、时长、成绩四类事件。

### 2.2 暂不建议首发的类型

- 大地图实时动作对战
- 高精度物理竞速
- 强语音/麦克风协作
- 长时沉浸 RPG
- 重资源 3D 游戏
- 高作弊敏感、必须服务端强校验的复杂策略竞技

## 3. 25 款候选清单

### 3.1 联机 + 单机候选（15 款）

| ID | 游戏名 | 类型 | 联机模型 | 复杂度 | 优先级 | 推荐批次 | 当前状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `quiz-duel` | Quiz Duel | 答题竞赛 | 双人 turn-based | S | P0 | Wave A | 已实现 | 当前首个联机验证样例 |
| `word-rally` | Word Rally | 单词接龙 | 双人 turn-based | M | P1 | Wave A | 已实现 | 复用邀请码、回合与胜负结算 |
| `memory-match-duel` | Memory Match Duel | 翻牌记忆 | 双人回合同步 | S | P1 | Wave A | 已实现 | 与 `cabin-puzzle` 视觉资产可共用 |
| `spot-the-difference-race` | Spot the Difference Race | 找不同竞速 | 双人低频同步 | M | P1 | Wave A | 已实现 | 可单机计时，也可双人抢答 |
| `mini-gomoku` | Mini Gomoku | 五子棋轻量版 | 双人 turn-based | S | P1 | Wave B | 已实现 | 规则稳定，服务端状态简单 |
| `seat-map-strategy` | Seat Map Strategy | 占格策略 | 双人 turn-based | M | P1 | Wave B | 已实现 | 适合积分与排行榜 |
| `signal-scramble` | Signal Scramble | 图案连线 | 双人异步竞速 | M | P1 | Wave B | 规划中 | 可比较完成时间和得分 |
| `baggage-sort-showdown` | Baggage Sort Showdown | 分类反应 | 双人低频同步 | M | P1 | Wave B | 规划中 | 偏休闲，适合大众用户 |
| `cabin-card-clash` | Cabin Card Clash | 轻卡牌对战 | 双人 turn-based | M | P1 | Wave B | 规划中 | 规则需刻意收轻 |
| `airline-trivia-teams` | Airline Trivia Teams | 多人问答 | 2-4 人 turn-based | M | P2 | Wave B | 规划中 | 适合后续多人房间扩展 |
| `tap-beat-battle` | Tap Beat Battle | 节奏对拍 | 双人低频同步 | M | P2 | Wave C | 规划中 | 需要额外关注音频策略 |
| `route-builder-duel` | Route Builder Duel | 路线规划 | 双人 turn-based | M | P2 | Wave C | 规划中 | 偏策略，适合高复玩 |
| `puzzle-race-grid` | Puzzle Race Grid | 网格消除竞速 | 双人状态对比 | L | P2 | Wave C | 规划中 | 玩法成熟，但同步与动画更复杂 |
| `skyline-defense-lite` | Skyline Defense Lite | 轻塔防对战 | 双人回合部署 | L | P2 | Wave C | 规划中 | 必须避免重实时塔防 |
| `crew-coordination` | Crew Coordination | 多人协作解谜 | 2-4 人 turn-based | L | P3 | Wave C | 规划中 | 放在最后验证多人协作体验 |

### 3.2 单机候选（10 款）

| ID | 游戏名 | 类型 | 复杂度 | 优先级 | 推荐批次 | 当前状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cabin-puzzle` | Cabin Puzzle | 拼图 | S | P0 | Wave A | 已实现 | 当前首个单机验证样例 |
| `runway-rush` | Runway Rush | 反应闪避 | S | P1 | Wave A | 已实现 | 易做短局和时长积分 |
| `seat-upgrade-shuffle` | Seat Upgrade Shuffle | 排列益智 | S | P1 | Wave A | 规划中 | 点击拖拽即可完成交互 |
| `luggage-logic` | Luggage Logic | 箱包排序 | S | P1 | Wave B | 规划中 | 适合低端终端 |
| `meal-cart-match` | Meal Cart Match | 三消/配对 | M | P1 | Wave B | 规划中 | 资源与动画控制要克制 |
| `window-view-memory` | Window View Memory | 记忆训练 | S | P2 | Wave B | 规划中 | 可与联机翻牌共享题库/素材 |
| `flight-path-puzzler` | Flight Path Puzzler | 路径规划 | M | P2 | Wave B | 规划中 | 适合分关卡内容运营 |
| `quiet-cabin-sudoku` | Quiet Cabin Sudoku | 数独轻量版 | M | P2 | Wave C | 规划中 | 偏长尾内容，适合补齐品类 |
| `star-map-relax` | Star Map Relax | 休闲连线 | S | P2 | Wave C | 规划中 | 低压力、适合夜航场景 |
| `aircraft-fix-kit` | Aircraft Fix Kit | 零件装配 | M | P2 | Wave C | 规划中 | 做成拖拽拼装型小游戏 |

## 4. 分批上线策略

### 4.1 Wave A：首发验证包（5 款）

目标：闭环验证“频道 -> 启动器 -> 游戏 -> 房间/积分/权益 -> 可观测”。

| 波次 | 游戏 | 目标 |
| --- | --- | --- |
| Wave A | `quiz-duel` | 验证双人房间、实时协议、积分、邀请制联机 |
| Wave A | `cabin-puzzle` | 验证单机 package 启动、积分与频道推荐位 |
| Wave A | `word-rally` | 验证 turn-based 文本/题库类联机 |
| Wave A | `memory-match-duel` | 验证回合同步 + 共享素材复用 |
| Wave A | `runway-rush` | 验证反应类单机时长/成绩积分 |

首发验收门槛：

- 至少 `2` 款联机、`2` 款单机、`1` 款补位游戏完成接入。
- 所有首发游戏都支持统一 metadata、启动器、trace 和 points 上报。
- 首发批次全部通过 `smoke`、兼容矩阵和弱网场景回归。

### 4.2 Wave B：稳定扩充包（8 款）

目标：从“验证平台可用”推进到“频道内容足够丰富、类型分布均衡”。

- 重点补齐：益智、策略、竞速、多人问答
- 重点验证：后台上下架、配置生效、排行榜、权益兑换拉动
- 推荐纳入：
  - `mini-gomoku`
  - `seat-map-strategy`
  - `signal-scramble`
  - `baggage-sort-showdown`
  - `airline-trivia-teams`
  - `luggage-logic`
  - `meal-cart-match`
  - `spot-the-difference-race` 已提前完成，可作为 Wave B 的第一个已落地样例

### 4.3 Wave C：完整 25 款交付包（12 款）

目标：补齐长尾内容和更高复杂度玩法，但仍保持机上终端友好。

- 重点补齐：轻卡牌、轻策略、轻协作、长尾益智
- 仅在 Wave A/B 稳定后进入
- 推荐纳入：
  - `cabin-card-clash`
  - `tap-beat-battle`
  - `route-builder-duel`
  - `puzzle-race-grid`
  - `skyline-defense-lite`
  - `crew-coordination`
  - `flight-path-puzzler`
  - `window-view-memory`
  - `quiet-cabin-sudoku`
  - `star-map-relax`
  - `aircraft-fix-kit`
  - `seat-upgrade-shuffle`

## 5. 验收矩阵

### 5.1 单游戏接入验收

| 维度 | 要求 | 验收方式 |
| --- | --- | --- |
| Package 契约 | metadata、route、capabilities、healthcheck 完整 | schema 校验 + catalog 可见 |
| 启动链路 | 频道 3 次点击内可进入游戏 | 人工验收 + E2E |
| 乘客上下文 | passenger/session/trace 注入成功 | 日志与前端调试面板 |
| 积分事件 | start/end/score/duration 可上报 | API 集成测试 |
| 权益联动 | 可进入钱包/兑换链路 | UI + API 联调 |
| 可观测性 | JSON Lines、trace_id、错误分类齐全 | 日志抽样检查 |
| 兼容性 | 机上 WebView / 主流移动浏览器可运行 | 兼容矩阵 |

### 5.2 联机游戏额外验收

| 维度 | 要求 | 验收方式 |
| --- | --- | --- |
| 建房入房 | 支持 host create、invite join | REST + smoke |
| 实时同步 | room snapshot、game event、game state 正常 | WS 集成测试 |
| 断线重连 | reconnect window 内状态可恢复 | smoke + 弱网测试 |
| 成绩结算 | 胜负、积分、排行榜更新正确 | 集成测试 |
| 机上弱网 | 抖动、短断线、重连后状态一致 | 弱网场景脚本 |

### 5.3 波次级验收

| 波次 | 内容验收 | 平台验收 | 运营验收 |
| --- | --- | --- | --- |
| Wave A | `5` 款游戏可启动，至少 `2` 联机 + `2` 单机 | 启动器、房间、积分、权益、可观测跑通 | 基础上下架、推荐位、积分展示可用 |
| Wave B | 累计 `13` 款游戏，分类和推荐位更丰富 | 排行榜、配置发布、权益目录更稳定 | 支持批量配置和灰度上下架 |
| Wave C | 累计 `25` 款全部交付 | 长尾玩法稳定，无高风险类型进入首发 | 具备完整交付和验收包 |

## 6. 风险分级

### 6.1 高风险，原则上不进 Wave A

- 需要高频帧同步的动作/赛车
- 资源包过大、首屏加载慢于频道体验基线的游戏
- 需要复杂输入法、长文本输入的玩法
- 依赖语音、摄像头、陀螺仪的玩法
- 无法清晰定义积分和结果事件的玩法

### 6.2 中风险，需要专项预研

- 轻卡牌对战
- 节奏类玩法
- 2-4 人协作类玩法
- 带较多动画对象的消除/竞速类玩法

## 7. 当前建议的 backlog 对齐关系

- `#29` 对齐 Wave A 当前已落地部分：`quiz-duel`、`cabin-puzzle`、`word-rally`、`memory-match-duel`、`runway-rush`
- `#10` 对齐频道分类、推荐位和内容展示能力
- `#11/#12` 对齐联机类游戏底座
- `#13/#16/#17` 对齐积分、排行榜、配置化运营
- `#18/#27/#28` 对齐部署、可观测、测试和首发验收

## 8. 下一步执行建议

1. `spot-the-difference-race`、`mini-gomoku` 和 `seat-map-strategy` 已经落地，下一步优先转向下一个 Wave B 游戏 `signal-scramble`。
2. 在后台配置能力落地前，先用静态 catalog 驱动首发内容，避免卡住 package 接入节奏。
3. 所有新游戏必须先过 `single-player` 或 `multiplayer` 接入模板，不允许临时特判。
