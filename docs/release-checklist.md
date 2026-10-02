# 发布验收记录

HourTrail 尚未完成跨平台发布验收。下表区分自动测试、安装包构建和实机操作；自动测试通过不代表电源、托盘或安装流程已在实机通过。

## 黑白工作台界面验收（2026-10-03）

验证代码为 `b72dcc4`，包括 shadcn 基础组件、ReUI 日历和界面适配。Rust 领域代码未修改。本节记录界面重构的检查；后续本机环境表中的 4 项测试和 NSIS 产物属于此前版本，不能作为新版安装包的验收证据。

| 检查 | 证据 | 结果 |
| --- | --- | --- |
| 前端测试 | `pnpm test` | 10 项通过 |
| 类型与生产构建 | `pnpm build`（包含 `tsc --noEmit`） | 通过 |
| 格式与差异检查 | `pnpm format:check`、`git diff --check` | 通过 |
| 日历交互 | `work-calendar.test.tsx`、`calendar-adapter.test.ts` | 当月空列表、今天定位、连续跨月周导航、分段点击、统计时区日期通过 |
| 表单和错误 | `timer-card.test.tsx`、`entry-sheet.test.tsx` | 输入法 Enter 保护、失败保留标题、核对候选排除、删除失败留在确认框通过 |
| 浏览器视觉检查 | 临时合成数据入口，1180×820、900×600，另检查默认窗口 | 月/周视图、报告、设置页签、右侧面板无布局阻塞；周视图保留休息空档 |
| 键盘及焦点 | 浏览器操作 | 空格切换视图、Escape 关闭面板、焦点返回补录按钮；删除确认默认聚焦取消，取消后返回删除按钮 |
| 浏览器控制台 | 干净加载合成预览页 | 无警告或错误 |
| 新版桌面安装包、真实数据库和文件对话框 | 本轮未运行 | 仍需桌面实机验收 |

浏览器检查使用内存合成数据，不访问真实桌面数据库；临时入口已移除。生产构建的主脚本约 768 kB（gzip 239 kB），触发 Vite 的 500 kB 提示；Zod 依赖仍有两处 Rollup 注释警告。构建成功，后续可按页面拆分加载。

## 本机验证环境

2026-10-03，Windows 11 专业版 10.0.22631 x64，Node.js 24.16.0、pnpm 10.28.0、Rust 1.96.0。验证对象为本次工作区代码，包括新增的迁移测试和预览到期边界修复。

| 检查 | 命令或证据 | 结果 |
| --- | --- | --- |
| 前端测试 | `pnpm test` | 4 项通过 |
| 类型检查 | `pnpm typecheck` | 通过 |
| 前端构建 | `pnpm build` | 通过；Zod 依赖含两处 Rollup 注释警告 |
| 前端格式 | `pnpm format:check` | 通过，允许平台原生换行符 |
| Rust 测试 | `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 33 项通过 |
| Rust 格式 | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | 通过 |
| Rust 静态分析 | `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 通过 |
| Windows NSIS 安装包 | `pnpm exec tauri build --bundles nsis '--' --locked` | 通过，生成 `src-tauri/target/release/bundle/nsis/HourTrail_0.1.0_x64-setup.exe`（3.18 MiB）；尚未安装验收 |
| 迁移文件接口 | 设置输入、输出环境变量运行 `portable_migration`，启用 `--no-default-features` | 本机连续导出、读取再导出通过 |
| CI 语法与表达式 | `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/ci.yml` | 通过 |
| macOS arm64 构建及安装 | 需要 macOS 环境 | 未执行 |
| GitHub Actions | [工作流](../.github/workflows/ci.yml) | 已配置，未在远端执行 |

Cargo 在 Windows 报告库与可执行文件同名导致 `hourtrail.pdb` 输出路径冲突警告。当前构建可继续，发布调试符号前需解决命名冲突。没有配置分发签名或 Apple 公证凭据，安装包不应作为已签名正式版分发。应用标识 `com.hourtrail.desktop` 的归属仍待发布负责人核实。

## 计时验收映射

来源：[详细设计第 10 节](superpowers/specs/2026-09-29-hourtrail-timer-design.md#10-验收与交付顺序)。测试文件均位于 `src-tauri/tests/`，界面测试位于 `src/features/`。

| 场景 | 已有自动证据 | 待验收 |
| --- | --- | --- |
| 全天计时扣除午休，总计 7 小时 30 分钟 | `timer_transitions.rs` | 两平台界面完整操作 |
| 关窗后台运行、窗口与托盘一致 | `lifecycle.rs` 覆盖隐藏条件 | 两平台隐藏 20 分钟后重开 |
| 窗口与托盘同时操作 | `mutations.rs` 覆盖数据库单一活动约束 | 两入口实际竞争操作 |
| 休眠、唤醒、重复通知 | `recovery.rs` 覆盖不自动恢复和重复事件 | 两平台真实睡眠与唤醒 |
| 电源漏报、61 秒缺口 | `recovery.rs` 覆盖 60 秒与 61 秒阈值边界 | 真实电源事件漏报和检查点触发 |
| 暂停后休眠 | `recovery.rs` 覆盖暂停期间不计时、不自动恢复 | 两平台真实暂停后休眠 |
| 崩溃隔天恢复 | `recovery.rs` 覆盖临时磁盘数据库重开、检查点截断及重复恢复 | 异常终止进程后重开 |
| 时钟回拨 | `recovery.rs` 覆盖无负区间 | 受控环境实机验证 |
| 结束后关闭核对面板 | `entry_review.rs` 覆盖持久化状态 | 界面关闭后重开 |
| 核对时间重叠 | `entry_review.rs`、`entry-sheet.test.tsx`；浏览器冲突定位见下节 | 安装版冲突查看和修正 |
| 删除后找回冲突 | `entry_review.rs` | 回收站完整操作 |
| 写入失败、响应丢失 | `mutations.rs`、`timer_transitions.rs` | 磁盘满及界面请求超时专项测试 |
| 核对记录可移植 | `portable_migration.rs` | 远端跨平台链及安装版迁移 |
| 恢复或改时区后旧表单 | `restore_atomicity.rs`、`settings.rs` | 保持旧表单打开的界面操作 |
| 跨日、跨月、夏令时及 CSV | `reporting.rs`、`csv_export.rs` | 表格软件中文显示和公式文本检查 |

## 数据迁移验收映射

来源：[项目设计第 15 节](PROJECT_DESIGN.md#15-acceptance-criteria)。`portable_migration.rs` 在临时数据库真实执行预览、恢复、启动恢复和再次导出。比较稳定业务字段，忽略导出时间、应用版本及报表参考元数据；分月毫秒另行断言。

| 场景 | 已有自动证据 | 待验收 |
| --- | --- | --- |
| Windows 导出、macOS 恢复、再次导出返回 Windows | CI 三阶段传递同一备份产物 | 远端运行，记录各节点 OS/架构和日志 |
| 中文、emoji、多行备注 | `backup_roundtrip.rs`、`portable_migration.rs` | 安装版备份文件往返 |
| 目标 OS 使用不同时区 | 迁移测试固定统计时区并断言月末切分 | 目标 OS 改时区后实机复核 |
| 跨月跨夜及 DST | `reporting.rs`，迁移测试断言 9 月和 10 月各 1,800,000 ms | 两平台报表对照 |
| 重复恢复、替换确认 | `restore_atomicity.rs`、`portable_migration.rs` | 界面覆盖确认 |
| 新增本地编辑后的覆盖警告 | 迁移测试检查 `replacesLocal` 和确认门槛 | 界面警告内容 |
| 损坏、超限或未知格式 | `backup_roundtrip.rs` 覆盖坏样例与重复 JSON key | 超限和未知版本的独立测试 |
| 坏引用、重复 ID、重叠 | 领域验证器已有检查 | 分别增加畸形输入测试 |
| 导出发布失败保留旧文件 | `backup_roundtrip.rs` | 实际磁盘满 |
| 安全快照失败阻止恢复 | 恢复服务先创建快照 | 故障注入测试 |
| 事务替换中途失败 | `restore_atomicity.rs` 注入插入失败 | 实机异常终止 |
| 预览后修改、预览到期 | `settings.rs`、`restore_atomicity.rs` | 恢复预览后再次修改的专项测试 |
| 待核对开放时段不累计 | `portable_migration.rs`、`recovery.rs` | 安装版迁移 |
| 软删除记录保持删除且不计入工时 | `portable_migration.rs` | 回收站显示 |
| 源设备路径不回放 | 迁移测试断言目标 `device_settings` 保留 | 不同目录的安装版迁移 |
| 全流程离线 | 本地服务测试无需网络 | 两平台断网完整操作 |

## 时段编辑与报表组件验收

2026-10-03 在 Windows 本机验证，界面实现提交为 `c3cd6a4`，日期导航提交为 `3158d74`。

- 日期编辑使用 shadcn Calendar、Popover、Select；报告月份使用月份弹层。浏览器示例数据验证了日期选择、键盘修改分钟、时长预览及 800×600 下的弹层布局。
- 明细使用 TanStack Table 8 与现有 shadcn Table，按日聚合后展开实际时段。选择直接组合是为了复用现有样式和按天分页规则；ReUI DataGrid 同样基于 TanStack，但本功能无需其拖拽、列调整等额外封装。搜索汇总、区间展开和分页已有组件测试。
- 图表使用 shadcn Chart 与 Recharts，参考 [CC Switch 的图表实现](https://github.com/farion1231/cc-switch/blob/main/src/components/usage/UsageTrendChart.tsx)。浏览器指针操作确认 `2026-10-02` 提示 `07:30:00`，纵轴采用整小时刻度。报表单独加载，构建输出独立报表资源约 410 kB。
- `pnpm test` 共 19 项通过；类型检查、格式检查、前端构建、Rust release 完整测试、Rust 格式检查及 Clippy 通过。CSV 专项覆盖中文五列表头、毫秒精度、多时段和跨午夜拆分。
- 截图保存在本地忽略目录 `artifacts/ui-review/`：`report-colors.png`、`time-picker-800.png`、`work-details-800.png`。浏览器使用临时示例数据，没有修改真实工作区；安装版 WebView2、macOS 和表格软件打开 CSV 仍需实机验收。

## 编辑安全与冲突定位验收（2026-10-03）

功能证据对应 `4172a93` 和 `bdb9285`，恢复测试对应 `2171713`。面板行为已通过组件测试与浏览器合成数据检查，桌面实机验收仍待执行。

| 检查 | 证据 | 结果 |
| --- | --- | --- |
| 前端回归 | `pnpm test` | 8 个测试文件、30 项通过，其中编辑面板 11 项 |
| 类型与构建 | `pnpm build` | 通过；仍有 Zod 注释和主资源超过 500 kB 的提示 |
| 前端格式 | `pnpm format:check` | 通过 |
| Rust 核心回归 | `cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features --tests --quiet` | 39 项通过，未启用桌面运行时 |
| Rust 格式 | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | 通过 |
| 桌面目标静态分析 | `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 通过，启用默认桌面功能 |
| 未保存保护 | `entry-sheet.test.tsx`；浏览器取消、遮罩操作 | 未改动和改回原值可直接关闭；改动后默认聚焦“继续编辑”；失败保留草稿，保存期间禁止关闭和重复提交 |
| 冲突定位 | `entry_review.rs`、`entry-sheet.test.tsx` | 外部冲突和内部重叠定位到具体时段；同名任务按 ID 区分；详情读取失败可重试；移除冲突时段后可保存 |
| 跨午夜与详情返回 | 浏览器合成数据 | 完整日期和时间清晰显示，冲突提示获得焦点；只读详情返回后标题输入保留，焦点回到查看按钮 |
| 恢复边界 | `recovery.rs` | 60 秒缺口不触发核对，61 秒触发；暂停后休眠不累计、不恢复；临时 SQLite 文件重开仅保留检查点工时，重复恢复不重复创建核对项 |

浏览器截图位于本地忽略目录 `artifacts/ui-review/entry-conflict.png` 和 `artifacts/ui-review/unsaved-changes.png`。临时预览入口已移除，未操作用户真实记录。磁盘重开测试模拟服务重建，不代表已验证进程被强制终止或系统真实休眠。安装版 WebView2、托盘、系统电源事件和 macOS 仍待实机验收。

## 人工测试反馈与复核（2026-10-03）

用户反馈：按对话中的人工点击清单执行后，除修正冲突时出现另一时间段提示、CSV 时间格式不直观外，其余测试正常通过。此结果记为用户报告；未提供安装包版本、逐项截图及 macOS 证据，不据此标记跨平台发布验收完成。

冲突截图中的时间段与本地数据库中的已有测试记录一致，读取时该记录已在回收站。无法仅凭当前数据还原截图当时的删除状态。`entry_review.rs` 使用独立内存数据库验证：B 从 00:03 至 01:03 改为 01:00 至 02:00 后不再与 A 的 00:00 至 01:00 冲突，但会与另一个 01:27:58.819 至 01:29:02 时段冲突；后者删除后 B 可保存。`entry-sheet.test.tsx` 验证查看详情并返回后，通过时间选择器修改并保存会提交新时段、更新请求标识和清除旧提示。这两项复核未复现误报，未修改冲突判定规则或用户数据。

CSV 可读时间格式见 [README](../README.md#使用方式)。`csv_export.rs` 验证上海时区显示、跨午夜日期及毫秒精度；格式断言在修改前失败，修改后通过。

## 时间录入、报表联动与备份反馈验收（2026-10-03）

实现证据：时间录入 `e6aa3ad`、图表联动 `837b5fb`、整月导出提示 `3e2fba3`、备份反馈 `0411b42`。自动验证及浏览器合成数据检查通过，安装版文件对话框和跨平台验收仍需实机证据。

| 检查 | 证据 | 结果 |
| --- | --- | --- |
| 前端回归 | `pnpm test` | 10 个文件、42 项通过 |
| 类型与生产构建 | `pnpm build` | 通过；仍有 Zod 注释和主资源大小提示 |
| 前端格式 | `pnpm format:check` | 通过 |
| Rust 核心回归 | `cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features --tests --quiet` | 43 项通过 |
| 桌面目标静态分析 | `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 通过 |
| 时间录入 | `date-time-picker.test.tsx`、`entry-sheet.test.tsx` | 直接输入保留秒数、非法输入禁止保存、未应用输入关闭保护、快捷调整跨日、新增时段接续通过 |
| 图表与明细 | `monthly-report-page.test.tsx` | 柱形点击、日期与搜索组合、自动展开、分页复位、月份切换、核对入口通过 |
| 导出范围 | `monthly-report-page.test.tsx` | 筛选后仍显示整月范围和完整时段数；仅整月导出，不含筛选结果导出 |
| 备份反馈 | `settings-page.test.tsx`、`backup_roundtrip.rs` | 加载、失败、空列表、重试、创建删除后刷新、失败保留最近成功时间、设备元数据读取通过 |
| 快照保护 | `snapshots.rs` | 一小时节流、相同版本不重复创建、自动快照保留 7 份、安全快照保留、验证失败不损坏旧快照通过 |

浏览器使用临时合成数据入口，检查了时间输入与下拉同步、增加 5 分钟跨午夜、关闭确认、键盘选择日期展开明细、整月导出说明以及快照错误重试。临时入口已移除，未写入用户真实工作区。此检查使用默认浏览器视口，不作为最小窗口或安装版 WebView2 的完整验收证据。

## 其他发布门槛

- [x] 自动快照超过 7 份后轮替、验证失败保留旧快照、安全快照不轮替、一小时节流专项测试通过；证据见上节，实际磁盘故障仍待实机检查。
- [ ] 损坏数据库保留副本、较新模式拒绝恢复补专项测试和实机验证。
- [ ] 900×600 窗口、键盘焦点、中文输入法、长标题、跨午夜编辑完成界面验收。
- [x] 按已确认设计接入 ReUI Event Calendar，覆盖月、周和列表视图；自动测试与浏览器证据见本页界面验收。
- [ ] 两平台验证首次离线启动、单实例、目录权限、退出取消及退出确认。
- [ ] 发布负责人核实应用标识、Windows 签名和 Apple 签名、公证。
- [ ] 安装包实际安装、升级、卸载及用户数据保留验证。

## 自动迁移文件接口

测试使用 [migration-v1.hourtrail.json](../tests/fixtures/migration-v1.hourtrail.json) 合成数据。`HOURTRAIL_MIGRATION_INPUT` 指定待验证的前一平台导出文件，未设置时读取内置样例。`HOURTRAIL_MIGRATION_OUTPUT` 指定一个尚不存在的绝对输出路径，测试成功后以正式备份序列化及原子发布逻辑写出。

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features --test portable_migration
```

工作流的 Windows 和 macOS 构建分别运行完整测试。后续 macOS 作业读取 Windows 产物并再导出，最后 Windows 作业读取这份 macOS 产物。此链验证可移植数据和服务行为，桌面交互及安装流程仍需上表的实机证据。

Runner 架构与标签依据 [GitHub runner 文档](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)，平台构建方式依据 [Tauri GitHub pipeline 文档](https://v2.tauri.app/distribute/pipelines/github/)，于 2026-10-03 查阅。
