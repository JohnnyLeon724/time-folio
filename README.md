<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" height="80" alt="Timefolio 图标">
</p>

<h1 align="center">Timefolio</h1>

<p align="center">
  简体中文 · <a href="README_EN.md">English</a>
</p>

<p align="center">
  <strong>记录每一段投入，回看时间去向。</strong><br>
  用于工作、学习及其他活动的离线桌面时间记录应用。
</p>

<p align="center">
  <a href="#功能概览">功能概览</a> ·
  <a href="#上手使用">上手使用</a> ·
  <a href="#数据与备份">数据与备份</a> ·
  <a href="#本地开发">本地开发</a> ·
  <a href="#项目资料">项目资料</a>
</p>

Timefolio 将一次活动拆成实际投入的时段：开始计时，休息时暂停，结束后核对，再计入周报与月报。记录保存在本机 SQLite 数据库，可导出 CSV 时间记录表，也可通过完整备份迁移到另一台设备。

**平台与状态：** 目标平台为 Windows x64 和 macOS arm64，尚未完成跨平台发布验收。构建结果、实机检查与未完成项见[发布验收记录](docs/release-checklist.md)。分支 CI 生成测试安装包；推送版本标签后，发布流程在完整验证通过时创建 Release 草稿，由维护者验收后公开。配置见[发布工作流](.github/workflows/release.yml)。

## 功能概览

| 功能           | 可以做什么                                                             |
| -------------- | ---------------------------------------------------------------------- |
| 分段计时       | 开始、暂停、继续和结束计时；复用最近任务标题，同一时间保留一个活动任务 |
| 时间日历       | 在月、周、列表视图查看记录；每个实际时段独立展示，休息间隔保持空白     |
| 补录与核对     | 手动补录、修改多个时段、定位时间冲突；关闭有未保存修改的面板前确认     |
| 周报与月报     | 查看已确认时长、记录天数和每日分布；按日期筛选、搜索任务、展开时间明细 |
| 按标题汇总     | 合计周期内同名记录的时长，展开追溯原记录，保留每条记录的独立性         |
| 数据导出与恢复 | 导出整月 CSV、完整 JSON 备份，预览恢复内容，管理本地快照               |
| 桌面与中断恢复 | 托盘计时，休眠或异常中断后核对记录，回收站找回已删除记录               |

主要入口位于[前端功能目录](src/features/)；计时、校验、报告与恢复规则由 [Rust 服务](src-tauri/src/services/)处理。

## 上手使用

前往 [Releases](https://github.com/JohnnyLeon724/time-folio/releases) 下载已发布版本的安装包。首版提供 Windows x64 安装程序，下载 `.exe` 后双击安装；`Source code` 是源码压缩包。当前应用界面为简体中文，英文 README 不代表已提供英文界面。

1. **确认时区。** 首次打开，在「设置与数据」确认统计时区。
2. **开始记录。** 在「时间日历」输入任务标题或选择最近任务，点击「开始计时」，休息时暂停。
3. **核对完成。** 结束后检查实际时段并确认完成。关闭核对面板会保留待核对记录，可稍后处理。
4. **回看投入。** 在「时间报告」切换周报、月报，查看趋势、时间明细与按标题汇总；月报提供「导出整月」。

### 计时与编辑

- 点击日历记录打开右侧详情；日历拖动不会修改记录。
- 编辑时间时可输入 `09:30` 或 `09:30:45`，按 Enter 或离开输入框应用。仅输入时、分会保留原秒数，也可通过下拉框或前后调整 5 / 15 分钟的按钮修改。
- 新增时段衔接上一段结束时间，默认持续 1 小时；跨午夜会显示次日日期。保存时检查时间范围及重叠，并提示冲突记录。
- 托盘可用时，关闭窗口会隐藏到托盘，后台继续计时。退出请使用托盘入口；休眠或异常中断后的记录需要核对，唤醒不会自动开始计时。

### 报告统计规则

**正式报告只计入已完成且未删除的记录。** 正在计时、已暂停和待核对记录不计入已确认时长，休息间隔也不计入。跨午夜及跨月时段按统计时区切分，周报遵循工作区设置的每周起始日。

点击每日图表柱形，或使用日期下拉框，可筛选并展开当天明细；任务搜索继续生效。按标题汇总覆盖当前完整周期，不受明细筛选影响。归组时去除标题首尾空格，再按完全相同的标题聚合，区分大小写。

**「导出整月」包含所选月份的全部已确认时段，明细筛选不改变导出范围。** CSV 导出仅在月报提供。统计实现见[报告服务](src-tauri/src/services/reports.rs)，标题归组见[汇总组件](src/features/reports/title-summary.tsx)。

<details>
<summary>CSV 列与时间格式</summary>

导出固定包含以下五列，每个实际时段一行；同一天的多个时段不会合并，跨午夜按统计时区拆日。

| 列       | 格式与含义                                               |
| -------- | -------------------------------------------------------- |
| 日期     | 该时段在统计时区中的日期，`YYYY-MM-DD`                   |
| 任务     | 任务标题；可能被表格软件识别为公式的文本会加以转义       |
| 开始时间 | 统计时区中的 `YYYY-MM-DD HH:mm:ss`，有毫秒时追加三位小数 |
| 结束时间 | 与开始时间相同的格式，不附加 UTC 偏移                    |
| 时长     | 实际经过时间，`HH:MM:SS`，有毫秒时追加三位小数           |

夏令时回拨可能出现相同的本地时间，实际投入以「时长」列为准。文件使用带 BOM 的 UTF-8 编码。实现见 [CSV 导出服务](src-tauri/src/services/csv.rs)。

</details>

## 数据与备份

| 数据形式                   | 用途                             | 使用边界                                     |
| -------------------------- | -------------------------------- | -------------------------------------------- |
| 本地数据库 `timefolio.db`  | 保存当前工作区                   | 默认位于系统应用数据目录                     |
| CSV 时间记录表             | 查看、提交或分析整月时间明细     | 不能用于恢复工作区                           |
| 完整备份 `.timefolio.json` | 迁移设备或保留外部备份           | 恢复会替换当前工作区，不合并数据             |
| 本地快照 `.db`             | 在本机回退、保留恢复前的安全副本 | 与当前数据库位于同一台设备，不能替代外部备份 |

迁移时，先结束活动计时，在「设置与数据 → 备份与数据」导出完整备份，再在目标设备选择文件、检查预览并确认替换。恢复前会创建安全快照。每台设备维护独立工作区，不提供多设备同步。

备份区显示本机最近成功导出时间及最近本地快照时间；列表读取失败可重试。已有同名导出文件不会被覆盖，请另选名称。

数据文件、备份和 CSV 均为明文，请选择可信保存位置，并将重要备份另存到其他设备或存储位置。数据目录入口见[桌面启动代码](src-tauri/src/main.rs)，可移植格式见[备份 schema](schemas/backup-v1.schema.json)。

## 本地开发

### 环境准备

以下版本与[仓库 CI 配置](.github/workflows/ci.yml)一致；依赖分别由 `pnpm-lock.yaml` 与 `src-tauri/Cargo.lock` 锁定。

| 工具    | 配置版本                       |
| ------- | ------------------------------ |
| Node.js | 24                             |
| pnpm    | 10.28.0                        |
| Rust    | 1.96.0，包含 rustfmt 与 Clippy |

桌面开发还需要平台工具链：Windows 使用 MSVC、Microsoft C++ Build Tools 和 WebView2；macOS 使用 Xcode 命令行工具。具体安装方式见 [Tauri 2 环境准备](https://v2.tauri.app/start/prerequisites/)（2026-10-04 核对）。

### 安装与启动

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm tauri dev` 会通过[桌面配置](src-tauri/tauri.conf.json)启动前端开发服务。单独运行 `pnpm dev` 仅启动网页；计时和本地数据库功能需要桌面应用。

测试独立工作区时，可通过 `TIMEFOLIO_DATA_DIR` 指定数据目录，不要指向正在使用的工作区。

### 技术栈

版本范围以 [package.json](package.json) 和 [Cargo.toml](src-tauri/Cargo.toml) 为准，下表展示主要技术及其职责。

| 层次       | 技术                                            | 职责                                 |
| ---------- | ----------------------------------------------- | ------------------------------------ |
| 桌面       | Tauri 2、Rust 2021 edition                      | 原生窗口、托盘、文件对话框与系统事件 |
| 前端       | React 19、TypeScript 5.9、Vite 7                | 页面、交互与构建                     |
| 界面       | Tailwind CSS 4、shadcn/ui、ReUI Event Calendar  | 样式、基础组件与日历                 |
| 数据交互   | TanStack Query 5、TanStack Table 8、Recharts 3  | 查询状态、明细表格与图表             |
| 时间与存储 | date-fns、chrono / chrono-tz、rusqlite / SQLite | 时间显示、统计时区、事务与本地持久化 |
| 验证       | Vitest、Testing Library、Cargo tests            | 界面行为、业务规则与数据恢复测试     |

## 架构与目录

React 通过 [`src/services/client.ts`](src/services/client.ts) 调用 Tauri 命令入口。Rust 的 [`Controller`](src-tauri/src/commands/mod.rs) 分发请求，由领域校验和应用服务处理计时、报告、备份与恢复，再通过数据库层持久化。托盘及电源事件也接入 Rust 服务，后台计时由桌面进程维护。

```text
src/
├── app/                  # 应用入口、页面编排与布局
├── features/             # 计时、日历、记录、报告、设置
├── components/           # 通用组件、shadcn/ui、ReUI 日历
├── services/             # 桌面命令调用与前端类型
└── lib/                  # 时间显示与格式化工具
src-tauri/
├── src/commands/         # 命令入口与服务组装
├── src/domain/           # 数据模型、校验与错误
├── src/services/         # 计时、报告、备份与恢复
├── src/db/               # SQLite 连接、事务与记录读写
├── src/platform/         # 时钟、托盘、电源与应用生命周期
├── migrations/           # 数据库模式
└── tests/                # Rust 集成测试
tests/fixtures/           # 备份与迁移测试数据
schemas/                  # 可移植备份格式
docs/                     # 设计、验收与后续改进
.github/workflows/        # 跨平台验证与安装包构建
```

## 测试与构建

### 提交前检查

前端测试与组件同目录，重点验证计时交互、日历映射、编辑保护及报告联动。Rust 集成测试覆盖计时状态、时间冲突、时区统计、CSV、快照、恢复原子性与备份迁移。

```sh
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### 安装包构建

在对应平台执行，Windows 生成 NSIS 安装包，macOS 生成 DMG：

```sh
# Windows
pnpm exec tauri build --bundles nsis '--' --locked

# macOS
pnpm exec tauri build --bundles dmg '--' --locked
```

默认本机构建产物位于 `src-tauri/target/release/bundle/`。CI 显式指定目标架构，产物位于 `src-tauri/target/<target>/release/bundle/`。

[CI 工作流](.github/workflows/ci.yml)在 Windows 与 macOS 上执行检查和构建，并传递合成备份验证 Windows → macOS → Windows 的数据往返。托盘、电源事件、签名和安装体验仍需按[发布验收记录](docs/release-checklist.md)完成实机检查。

## 开发约定与贡献

发布版本时，使用 `pnpm release:version 0.1.1` 同步版本号，编写对应发布说明，再运行 `pnpm release:check v0.1.1`。提交并推送版本标签会创建带 Windows、macOS 安装包及校验值的测试版草稿，不自动公开。首版仍为 `0.1.0`，平台范围和限制见[首版发布说明](docs/releases/v0.1.0.md)，自动发布配置见[发布工作流](.github/workflows/release.yml)。

修复问题或扩展功能时，先找到对应的 `features` 页面及 Rust 服务；后续工作可参考[功能与体验优化清单](docs/improvement-backlog.md)。

问题反馈与提交改动的说明见[贡献指南](CONTRIBUTING.md)。

- **保持职责边界。** 前端负责交互与展示；持久化校验、时间冲突检查及正式统计规则放在 Rust 层。修改备份格式时同步检查 schema 与迁移用例。
- **沿用现有风格。** TypeScript 开启严格模式，文件使用 kebab-case，React 组件使用 PascalCase；Rust 沿用 snake_case。格式分别由 [Prettier 配置](.prettierrc.json)与 rustfmt 统一。
- **按行为补充测试。** 界面修改参考[记录编辑测试](src/features/entries/entry-sheet.test.tsx)，统计规则参考[报告测试](src-tauri/tests/reporting.rs)，数据恢复参考[恢复原子性测试](src-tauri/tests/restore_atomicity.rs)。
- **说明验证范围。** 提交改动时描述问题、用户可见的行为与已执行检查；涉及桌面交互时，区分自动测试和实机验收，并同步相关文档。

## 项目资料

| 资料                                              | 内容                                         |
| ------------------------------------------------- | -------------------------------------------- |
| [发布验收记录](docs/release-checklist.md)         | 构建与测试证据、桌面实机检查、发布前未完成项 |
| [首版发布说明](docs/releases/v0.1.0.md)           | 下载文件、功能与测试版限制                   |
| [功能与体验优化清单](docs/improvement-backlog.md) | 功能现状、后续建议与验收标准                 |
| [备份 schema](schemas/backup-v1.schema.json)      | 可移植 JSON 备份的结构约束                   |

功能以源码为准，验收状态以发布验收记录为准。早期设计提案可在 Git 历史中查阅。`docs/superpowers/` 下的设计与实施计划仅保留在本地，不纳入版本控制。

## 许可证与致谢

Timefolio 采用 [MIT 许可证](LICENSE)，版权声明为 `Copyright (c) 2026 JohnnyLeon724`。第三方组件保留各自的许可证和版权声明，详见[第三方声明](THIRD_PARTY_NOTICES.md)。

- shadcn/ui 组件使用 `radix-nova` 风格，声明见 [shadcn MIT 许可证](licenses/shadcn-MIT.txt)。
- 日历源码来自 ReUI Event Calendar，声明见 [ReUI MIT 许可证](licenses/reui-MIT.txt)。
