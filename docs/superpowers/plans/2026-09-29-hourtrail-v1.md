# HourTrail V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付离线桌面应用，支持可靠的实时计时、核对、月度报告和 Windows/macOS 双向迁移。

**Architecture:** Rust 独占计时状态、验证、事务和报表，React 负责表单与展示。托盘、电源事件和界面共用应用服务，所有领域修改经统一写入口执行。UTC 区间是工时事实，检查点及候选中断只是恢复证据。

**Tech Stack:** Tauri 2、React、TypeScript、Vite、shadcn/ui、Tailwind CSS、TanStack Query、React Hook Form、Zod、rusqlite、SQLite。时间库在任务 1 验证后锁定；不假定操作系统自带时区数据库一致。

**Spec:** [详细设计](../specs/2026-09-29-hourtrail-timer-design.md)及[项目设计](../../PROJECT_DESIGN.md)。详细设计于 2026-09-29 经用户确认。

本计划仅定义实施步骤，不代表已创建应用或执行测试。当前目录只有设计文档且不是 Git 仓库。执行时可在本目录初始化 Git，保持现有目录名，产品和包名使用 HourTrail/hourtrail，不自动移动用户目录。

技能说明：上述标准执行技能不在当前可用技能列表中。执行前查找其实际位置；若仍不可用，应明确说明并与用户约定当前会话执行方式，不声称已使用该技能。编写计划本身不依赖这些技能，也不启动子代理。

## Global Constraints

- “首版以实时计时为主，手动补录和修正为辅。”
- “关闭窗口后保留后台计时”；“唤醒后不自动恢复计时。”
- “一条记录只要仍有未解决的问题，整条记录都不进入正式报表。”
- “一个工作区最多一条非删除的 `running` 或 `paused` 记录。”
- “Rust 在正在计时时每 15 秒保存检查点”；回调间隔超过 60 秒标记运行中断；正常非休眠采样的时钟增量偏差超过 2 秒标记系统时间变化。
- 标题 1–200 个 Unicode 码点，备注最多 10,000 个码点；每条记录最多 1,000 个时段及 1,000 个核对项。
- UTC 时间范围为 2000-01-01（含）至 2100-01-01（不含）；导入最多 100,000 条记录、500,000 个时段、500,000 个核对项和 50 MiB。
- “保留最近 7 个自动快照”；恢复前安全快照不参与自动轮替；预览 token 10 分钟过期；请求回执保留 7 天。
- 默认中文、24 小时制、周一起始；统计时区经用户首次确认后固定保存。
- 只统计非删除 completed 记录；页面聚合后向下显示到分钟；CSV decimalHours 保留 6 位，durationMs 保留精确整数。
- 初始发布目标为 Windows x64 和 macOS arm64；必须完成双向备份往返验证。没有 Windows 环境时如实标记待验收，不能宣称整个首版完成。
- SQLite 内部版本和可移植 formatVersion 独立；备份不包含运行检查点、设备设置或操作回执。
- 每项任务包含独立验证和提交；只暂存该任务文件。真实记录、数据库、日志、备份、导出和构建产物禁止进仓库。

## Review Focus

1. 中文组合输入与 emoji 长度：按码点而非字节或 UTF-16 单元验证；任务 1 和 9 覆盖。
2. 开始请求已提交但响应丢失：重试只能返回一次结果，重启后也成立；任务 2 和 9 覆盖。
3. 后台自动唤醒、重复电源通知及通知漏报：不自动开始，不重复记录；任务 5 和 6 覆盖。
4. 新旧工作区切换后仍打开的表单：拒绝过期写入，不能把旧任务写入恢复后的数据；任务 2 和 11 覆盖。
5. 磁盘满或文件发布失败：保留已有数据、旧备份和可辨认的失败状态；任务 11 和 12 覆盖。

---

## 文件职责与顺序

计划以一个端到端产品为单位，按以下依赖顺序推进。备份依赖领域验证与计时状态，不拆成相互独立的产品。

| 文件组 | 责任 | 任务 |
| --- | --- | --- |
| `src-tauri/src/domain/{model,error,validation}.rs` | DTO、状态、区间与输入约束 | 1 |
| `src-tauri/src/db/{connection,mutations,receipts}.rs`、`migrations/0001_initial.sql` | 约束、版本和事务 | 2 |
| `src-tauri/src/services/{timer,review,entries,recovery}.rs` | 领域写操作与恢复 | 3–5 |
| `src-tauri/src/platform/{clock,power_events,tray,lifecycle}.rs` | 本机时钟、电源、窗口和退出 | 5–6 |
| `src-tauri/src/services/{reports,csv,backup,restore,snapshots}.rs` | 统计及数据管理 | 7、10–12 |
| `src-tauri/src/commands/{timer,entries,reports,backup,settings}.rs` | 仅负责命令反序列化及服务调用 | 8、11–12 |
| `src/services/{client,timer,entries,reports,backup}.ts` | 统一调用和 typed DTO | 8 |
| `src/features/{timer,entries,calendar,reports,data-management,settings}/` | 按功能组织组件、交互与测试 | 8–12 |
| `src-tauri/tests/`、`src/**/*.test.tsx`、`tests/fixtures/` | 后端、界面及跨平台合成数据 | 各任务 |
| `.github/workflows/ci.yml`、`docs/release-checklist.md` | 发布构建与实机证据 | 13 |

表中是本计划采用的目录，取代项目设计中示意树对同一模块的命名。职责不变，不同时创建两套 timer 服务。

## 共享接口规则

任务 1 定义并导出 `EntryId`、`SegmentId`（UUID）、`EpochMs`（i64）、`DurationMs`（i64）、`WorkspaceRevision`（不透明字符串）、`EntryVersion`（u64）、`AppError`、`WorkEntry`、`WorkSegment`、`ReviewItem`。对外 JSON 使用 camelCase，枚举使用规格中的 snake_case 字符串。

`WorkEntry` 字段对应规格第 7 节，包含 segments 和 reviewItems 的详情 DTO 命名为 `EntryDetail`。`WorkEntry.version` 仅本地使用。`Interval { start_at: EpochMs, end_at: EpochMs }` 只表示已关闭的合法区间。

`MutationContext { request_id: Uuid, workspace_revision: WorkspaceRevision, expected_entry_version: Option<EntryVersion> }`；`MutationResult<T> { value: T, workspace_revision: WorkspaceRevision }`。Rust 错误类型与规格第 9 节一致，前端不解析错误文本决定行为。

所有服务写方法统一返回 `Result<MutationResult<T>, AppError>`，读取返回 `Result<T, AppError>`。具体方法在对应任务定义，前端映射命令名遵从规格第 9 节。内部辅助类型由所属任务定义，不成为额外的跨模块合同。

### Task 1: 建立可运行外壳与领域约束

**Files:** 创建 `package.json`、`pnpm-lock.yaml`、`vite.config.ts`、`tsconfig.json`、`src/main.tsx`、`src/app/app.tsx`、`src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}`、`src-tauri/src/{main,lib}.rs`、领域文件及 `src-tauri/tests/domain_validation.rs`、`.gitignore`。

**Interfaces:** 产出共享 DTO；`validate_entry(input: &EntryDetail, now: EpochMs) -> Result<(), AppError>` 和 `overlaps(a: Interval, b: Interval) -> bool`。建立注入式 `Clock` trait：`utc_now() -> EpochMs`、`monotonic_now() -> std::time::Duration`；后者是本进程相对值。

- [ ] 验证本机 Node、pnpm、Rust、Xcode 工具链，读取所选依赖官方兼容要求并锁定版本；选择支持统一 IANA 数据的 Rust 时间实现，记录版本和时区数据版本。注册永久应用标识 `com.hourtrail.desktop` 为开发候选，发布前核实归属与可持续使用性。
- [ ] 创建最小 Tauri/React 工程、忽略规则和 Git 仓库；不更名现有目录。配置 `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm tauri`，Rust 库名固定为 `hourtrail`。
- [ ] 编写领域测试，关键断言：`assert!(!overlaps(span(0, 10), span(10, 20))); assert!(overlaps(span(0, 11), span(10, 20)));`。span 是测试辅助函数，直接构造 Interval，不调用日期范围验证。另测标题 200/201 个 emoji、空白标题、零长度区间、future end、时间范围边界及 completed 无时段。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test domain_validation`，确认缺失领域实现导致失败，再实现验证器和 DTO。
- [ ] 重跑领域测试及 `pnpm typecheck`、`pnpm build`；实际启动桌面空壳并记录成功。首次可运行外壳可人工验证，不写只验证脚手架存在的测试。
- [ ] 检查暂存内容后提交：`chore: bootstrap HourTrail and domain validation`。

### Task 2: SQLite 事务、单一活动任务与幂等写入

**Files:** 创建数据库文件组、初始迁移和 `src-tauri/tests/mutations.rs`。

**Interfaces:** 消费任务 1 类型；产出 `Database::open(path: &Path) -> Result<Database, AppError>`、`Database::mutate<T>(ctx: MutationContext, payload_digest: &str, operation: impl FnOnce(&Transaction) -> Result<T, AppError>) -> Result<MutationResult<T>, AppError>`，T 可序列化及反序列化。产出 `Database::revision()`。

- [ ] 编写测试：双连接竞争只有一个活动记录；`assert_eq!(first_result, retried_result)` 且记录数为 1；重启后相同请求仍返回原结果；相同 ID 不同输入拒绝；旧修订拒绝；事务中途失败无部分行。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test mutations` 并确认失败。
- [ ] 建立规格所有表、外键、区间检查和单一活动记录唯一约束。开启外键和 WAL，使用事务写锁；先验证重复请求摘要，再检查工作区/记录版本。回执与领域写入原子提交，保留 7 天；检查点不递增领域修订。复用规格限制，不在 SQL 和服务层创造不同规则。
- [ ] 重跑 mutations 和 domain_validation，预期全部通过；用第二个数据库连接验证约束，不只依赖进程内互斥锁。
- [ ] 提交：`feat: persist work records with atomic mutations`。

### Task 3: 开始、暂停、继续和结束

**Files:** 创建 `services/timer.rs`、`src-tauri/tests/timer_transitions.rs`。

**Interfaces:** `TimerService::new(db: Arc<Database>, clock: Arc<dyn Clock>)`；`start(ctx, title: String, note: Option<String>)`、`pause(ctx, entry_id)`、`resume(ctx, entry_id)`、`stop(ctx, entry_id)` 返回 `MutationResult<EntryDetail>`；`state() -> Result<TimerState, AppError>`。`TimerState { active_entry: Option<EntryDetail>, closed_duration_ms: DurationMs, server_now: EpochMs, workspace_revision }`。

- [ ] 编写固定时钟测试：09:00–12:00、13:30–18:00 得 `assert_eq!(closed_duration_ms, 27_000_000)`；stop 后状态 needs_review 且 active_entry 为空。覆盖暂停任务阻止新开始、同毫秒开始结束、重复停止及关闭窗口不触发转换。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test timer_transitions`，确认失败。
- [ ] 实现规格状态表、检查点创建清理和开放区间冲突检查；所有时刻来自 Clock；不按 UI tick 累加。
- [ ] 重跑该测试及 mutations，确认结束即固定终点、无需等核对页面响应。
- [ ] 提交：`feat: add persistent timer transitions`。

### Task 4: 核对、补录、删除与找回

**Files:** 创建 `services/{review,entries}.rs` 和 `src-tauri/tests/entry_review.rs`。

**Interfaces:** `ReviewService::resolve(ctx, entry_id, intervals: Vec<Interval>, decisions: Vec<ReviewDecision>, action: ResolveAction)` 返回 EntryDetail 的写结果；`ReviewDecision { review_id, resolution }`、`ResolveAction::{Complete,Continue}`。`EntryService::{save,delete,restore}` 消费共享上下文及规格记录字段；`list(query: EntryQuery) -> Result<EntryPage, AppError>`，查询包含范围、状态、删除筛选、游标及页大小，按 start/id 稳定分页；单独 `list_review(cursor)` 包含无时段记录。

- [ ] 编写断言：未解决项不能 complete；正常核对后正式时长为 27_000_000；修正休眠可新增两段；与其他完成/活动记录冲突被拒绝；删除后新建重叠记录导致撤销失败，但可恢复为 needs_review；无时段待核对能被检索。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test entry_review`，确认失败。
- [ ] 实现最终时段整体替换、核对决定、状态转换和版本更新的单事务；限制活动记录只改标题备注。旧开放待核对时段必须明确关闭或删除才能完成。
- [ ] 重跑 entry_review、timer_transitions，验证选择 continue 时只能存在一个活动任务。
- [ ] 提交：`feat: review and correct work entries`。

### Task 5: 中断检测与崩溃恢复

**Files:** 创建 `services/recovery.rs`、`platform/clock.rs`、`src-tauri/tests/recovery.rs`。

**Interfaces:** `RecoveryService::checkpoint()`、`on_power(event: PowerEvent)`、`recover_on_startup()` 返回 `Result<(), AppError>`，在 Database 写入口内部使用系统事件请求 ID；`PowerEvent::{Suspend,Resume}` 携带 observed_at、process_session_id。恢复服务消费 Clock；15 秒调度由 Rust 生命周期模块驱动。

- [ ] 编写测试：休眠/唤醒记录 10:00–10:30 候选，恢复后 `assert!(timer.state()?.active_entry.is_none())`；重复通知只有一条 review item；漏报以最近检查点估计；61 秒采样间隔标记中断；正常采样偏差 2,001 毫秒标记时钟变化。覆盖回拨、暂停重启和写检查点失败。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test recovery`，确认失败。
- [ ] 实现 15 秒检查点、完整电源事件优先、60 秒缺口和 2 秒偏差规则。会话内单调时间仅做诊断；重启不相减。异常时清理活动位置并创建证据；持久化失败禁用开始/继续，恢复可写后核对。
- [ ] 重跑 recovery，模拟崩溃后隔天启动和 candidate_end < candidate_start，不得生成非法实际工作区间。
- [ ] 提交：`feat: recover interrupted timer sessions`。

### Task 6: 托盘、系统电源和退出流程

**Files:** 创建 `platform/{power_events,tray,lifecycle}.rs`、修改 `main.rs`、`lib.rs`、Tauri 配置；创建 `src-tauri/tests/lifecycle.rs`。

**Interfaces:** `LifecycleService::handle(action: LifecycleAction) -> Result<LifecycleOutcome, AppError>`；action 包含 Hide、Pause、Resume、Stop、RequestQuit、QuitPending、CancelQuit。电源适配器只向任务 5 提交 PowerEvent，托盘只调用任务 3；产出供任务 8 订阅的状态失效事件。

- [ ] 使用模拟平台编写测试：Hide 不停止；托盘不可用不能隐藏最后窗口；退出等待期间 start 拒绝；QuitPending 成功提交后才能退出；取消退出继续原状态。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test lifecycle`，确认失败。
- [ ] 实现 Windows/macOS 电源适配器、Rust 托盘菜单、单实例聚焦与窗口隐藏；区分系统休眠和屏幕/锁屏事件。不依赖前端 WebView 活跃才能处理电源事件。
- [ ] 重跑 lifecycle/recovery；本机实际隐藏、暂停、唤醒、重复启动和退出。另一系统验证进入任务 13，不把模拟测试当实机证据。
- [ ] 提交：`feat: integrate tray and desktop lifecycle`。

### Task 7: 时区、月度报表与设置预览

**Files:** 创建 `services/reports.rs`、`services/settings.rs`、`src-tauri/tests/reporting.rs`。

**Interfaces:** `ReportService::month(month: YearMonth) -> Result<MonthReport, AppError>`；`MonthReport { month, reporting_time_zone, duration_ms, worked_day_count, days, unfinished_counts }`。`SettingsService::preview_zone(zone: String) -> Result<ZonePreview, AppError>` 返回 token、修订和分月差异；`set_zone(ctx, token)` 原子应用。`parse_local(input, zone, selected_offset) -> Result<EpochMs, AppError>` 负责歧义输入。

- [ ] 编写具体断言：上海时区 9 月 30 日 23:30–10 月 1 日 00:30 两月各 1_800_000 毫秒；纽约 2026-03-08 01:30–03:30 为 3_600_000 毫秒；不存在的 02:30 拒绝；2026-11-01 01:30 必须选偏移；needs_review 不贡献正式工时。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test reporting`，确认失败。
- [ ] 实现当地日/月边界切割和整数聚合；改区预览保留 UTC 总时长不变；存在活动任务时拒绝，修订变化让预览失效；返回完整月份和时区信息。
- [ ] 重跑 reporting，验证相邻月日历格不进入所选月、UI 分钟截断与 worked_day_count 的正时长规则。
- [ ] 提交：`feat: calculate timezone-aware monthly reports`。

### Task 8: 命令桥接与可用工作台

**Files:** 创建 `commands/{timer,entries,reports,settings}.rs`、`src/services/{client,timer,entries,reports}.ts`、`src/app/{providers,query-client}.tsx`、`src/features/timer/timer-card.tsx`、对应测试与 Tauri capabilities。

**Interfaces:** `invokeCommand<T>(name: string, input: unknown): Promise<T>` 是唯一前端桥；DTO 与 Rust serde 合同一致。计时方法映射规格命令名；query keys 统一包含 workspace revision 或在修订变化后整体失效。

- [ ] 编写 Vitest/Testing Library 测试：开始提交失败保留标题，进行中按钮禁用，stop 成功打开核对入口；同一错误 code 不依赖中文 message 判断；关窗重新打开主动读取真实 timer state。
- [ ] 执行 `pnpm test -- src/features/timer/timer-card.test.tsx`，确认失败。
- [ ] 注册命令和窄权限，配置离线 always 模式、关闭自动重试；实现中文工作台导航和计时卡片。时间显示只依据返回的起点估算，回到前台重新查询；提交成功后才更新状态。
- [ ] 重跑测试、`pnpm typecheck`、`pnpm build`，在真实桌面完成开始/暂停/继续/结束。
- [ ] 提交：`feat: connect desktop timer workspace`。

### Task 9: 核对面板、日历与报告界面

**Files:** 创建 `src/features/entries/{entry-sheet,review-list,trash-page}.tsx`、`src/features/timer/review-panel.tsx`、`src/features/calendar/{calendar-adapter,work-calendar,calendar-page}.tsx`、`src/features/reports/monthly-report-page.tsx` 及同名 `.test.tsx`。

**Interfaces:** `toCalendarEvents(entries: EntryDetail[], nowMs: number): CalendarEvent[]`，每段一事件并带 entryId/segmentId/status；`ReviewPanel({entryId,onClose})` 调用 resolve_entry；月份状态由页面统一控制，报表直接消费 MonthReport。

- [ ] 写界面测试：午休保持空白、跨月标题明确、结束后关面板记录仍待核对、冲突定位、中文输入法组合完成前不误提交、请求超时相同 requestId 重试不会再次生成任务、待核对无时段仍显示。
- [ ] 执行 `pnpm test -- src/features`，确认新测试失败。
- [ ] 验证暂定 ReUI 组件的 API、许可证、键盘访问和所需视图；如不能满足则记录证据，保留项目自有适配器后再选择替代。实现核对、补录、回收站、月周列表视图和报告，不在组件计算权威合计。
- [ ] 重跑新测试、typecheck/build；手工检查 900×600 窗口、键盘焦点、长中文标题和跨午夜编辑。
- [ ] 提交：`feat: add work review calendar and reports`。

### Task 10: CSV 导出

**Files:** 创建 `services/csv.rs`、`src-tauri/tests/csv_export.rs`，修改报告命令及页面。

**Interfaces:** `CsvService::export(month: YearMonth, destination: &Path) -> Result<ExportResult, AppError>`；`ExportResult { path, record_count, duration_ms }`。报表与 CSV 复用任务 7 的日区间切分，不复制统计规则。

- [ ] 写测试：跨日行毫秒相加等于报告；用户文本含逗号、引号、换行及 `= + - @` 等公式前缀时转义并中和；UTF-8 BOM、CRLF 与 6 位 decimalHours 正确。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test csv_export`，确认失败。
- [ ] 实现保存对话框、写出完整文件后成功反馈和取消结果。原始任务文字不因导出中和而修改数据库。
- [ ] 重跑 csv_export，用常见表格软件打开中文合成文件，记录显示情况；无法验证的软件注明未测。
- [ ] 提交：`feat: export monthly timesheets`。

### Task 11: 完整备份与事务恢复

**Files:** 创建 `services/{backup,restore,snapshots}.rs`、`commands/backup.rs`、`schemas/backup-v1.schema.json`、`src-tauri/tests/{backup_roundtrip,restore_atomicity}.rs`、合成 fixtures、`src/features/data-management/{export-backup-dialog,import-backup-dialog,import-preview}.tsx`。

**Interfaces:** `BackupService::export(destination: &Path) -> Result<BackupExportResult, AppError>`；`RestoreService::inspect(source: &Path) -> Result<RestorePreview, AppError>`；`apply(ctx, token, replace_confirmed: bool) -> Result<MutationResult<RestoreResult>, AppError>`。preview 含 token、到期时刻、修订和规格要求的全部摘要，payload 由 Rust 持有；恢复所需 `SnapshotService::create(kind)` 先在本任务实现安全快照最小能力，任务 12 扩展管理功能。

- [ ] 写测试：Unicode/软删除/核对证据往返相等；缺省 reviewItems 兼容；未支持版本、重复 JSON key、重复 ID、坏引用、非法状态与超限失败；活动计时阻止导出/恢复；过期预览和旧表单拒绝。
- [ ] 写故障注入测试：安全快照失败不触碰工作区；替换中途失败保持旧记录；重复 apply 不再次执行；导出发布失败不覆盖旧文件。
- [ ] 运行 `cargo test --manifest-path src-tauri/Cargo.toml --test backup_roundtrip --test restore_atomicity`，确认失败。
- [ ] 实现严格限额解析、结构/领域验证、不可变预览、受控文件路径及完整字节验证；一致读取后临时文件发布，安全快照成功才在现有数据库事务替换，保留设备设置；实现预览/确认界面。
- [ ] 重跑两项测试及界面测试，验证恢复后全部缓存失效、运行残留清除、旧回执清理但本次恢复回执保留。比较双方时区数据版本产生的报表差异并在预览中展示。
- [ ] 提交：`feat: add portable backup and atomic restore`。

### Task 12: 自动快照与损坏数据恢复

**Files:** 扩展 `services/snapshots.rs`、`commands/backup.rs`，创建 `src-tauri/tests/snapshots.rs`、`src/features/data-management/snapshot-panel.tsx`、`src/features/settings/settings-page.tsx`。

**Interfaces:** `SnapshotService::{create(kind),list(),inspect(snapshot_id),delete(snapshot_id)}`；kind 为 Automatic/PreRestore，create 返回 `SnapshotInfo { id,path,created_at,kind }`。inspect 输出任务 11 的 RestorePreview，apply 共用同一个恢复入口；只读提取快照领域数据，不覆盖已打开数据库。

- [ ] 写测试：第 8 个自动快照成功后保留最近 7 个，失败不删旧文件；安全快照不参与轮替；一小时内领域多次修改只自动创建一次；损坏当前数据库先保留副本；新模式快照拒绝。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --test snapshots`，确认失败。
- [ ] 实现启动/修改后的快照调度、列表删除、快照领域提取和损坏数据库恢复页面；活动记录从快照恢复为待核对，不补算到现在。提供首次时区确认和设置变更预览。
- [ ] 重跑 snapshots、restore_atomicity；模拟磁盘满，验证明确失败及旧快照保留。确认快照内设备路径没有回放到目的设备。
- [ ] 提交：`feat: manage local safety snapshots and recovery`。

### Task 13: 跨平台发布验证

**Files:** 创建 `.github/workflows/ci.yml`、`docs/release-checklist.md`、`README.md`，更新安装包配置与锁文件。

**Interfaces:** 消费全部任务；产出 Windows x64 和 macOS arm64 安装包，以及标注 OS/架构/版本/结果的验收记录。配置 CI 不代表已授权推送或发布；安装包可先本地构建。

- [ ] 执行完整后端测试、`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`pnpm test`、`pnpm typecheck`、`pnpm build`，记录实际结果并修复失败。
- [ ] 在两个目标系统执行 `pnpm tauri build`，完成离线首次启动、托盘隐藏、睡眠/唤醒、异常终止、退出以及可写目录权限验证。
- [ ] Windows 导出→macOS 恢复→再导出→Windows 恢复，比较规范化领域数据及分月毫秒合计；JSON 顺序、exportedAt、设备回执等非领域元数据不参与相等断言。包含旧待核对开放时段 fixture。
- [ ] 在 release-checklist 中逐条关联规格第 10 节及项目设计第 15 节验收项、测试文件/手工记录、通过或阻塞状态；验证本机损坏库恢复和旧备份安全。
- [ ] README 说明运行方式、计时核对、备份迁移、明文文件和单机使用规则；核实应用标识、签名和公证状态，缺少凭据时明确记录未签名限制，不声称正式分发准备完成。
- [ ] 检查无真实数据或凭据进入提交，提交：`chore: verify desktop release workflow`。发布、推送和上传分发按用户后续授权执行。

## 完成定义与评审

每项任务必须留下真实命令结果，失败时保留未勾选状态。核心验证通过后不重复跑无关测试；只有修改、失败或新风险才追加验证。

实施前通读计划和规格。完成任务 1–7 后可评审领域与桌面生命周期，完成 8–12 后可完整试用，完成 13 后才能宣称跨平台首版通过验收。所有未具备的运行环境和签名凭据必须在交付记录中注明。

当前计划已覆盖规格的状态、界面、时间规则、数据模型、备份、错误处理及验收章节。尚未执行以上任务；用户评审本计划并选择执行方式后再进入实施。
