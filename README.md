<img src="src-tauri/icons/128x128.png" width="64" alt="HourTrail 图标">

# HourTrail

离线桌面工时记录应用。开始、暂停、继续、结束计时后，核对实际工作时段，再计入月度报告。Rust 和 SQLite 保存工时，React 展示工作台。

目标平台为 Windows x64 和 macOS arm64。构建、测试结果及待验收项目见[发布验收记录](docs/release-checklist.md)。

## 使用方式

1. 首次打开，在「设置与数据」确认统计时区。
2. 在工作台填写任务标题并开始计时，午休时暂停。
3. 结束后核对时段并确认完成。关闭核对面板会保留待核对记录，这些记录暂不计入正式报告。
4. 在月度报告查看已确认工时，导出 CSV 工时表。

工作日历提供月、周和列表视图。周视图按实际时段展示，午休等间隔保持空白；点击记录打开右侧详情，修改时间后保存。日历拖动不会修改工时。设置页的「常规」用于统计时区，「备份与数据」用于导入、导出和安全快照。

月度报告的工作明细按天汇总，可展开查看每个时段，支持搜索任务、排序和按天分页。CSV 固定导出「日期、任务、开始时间、结束时间、时长」五列，每个实际时段一行，同一天的多段工作不会合并为连续时间；跨午夜按统计时区拆日。开始和结束包含完整日期、时间和 UTC 偏移，时长采用 `HH:MM:SS`，有毫秒时追加三位小数；休息间隔不计入。柱状图悬浮提示显示当天工时，日历用绿色、蓝色、紫色、橙色分别标记已完成、计时中、已暂停、待核对。

关闭窗口会尝试隐藏到托盘，后台计时继续。退出应用使用托盘退出入口。休眠或异常中断后的记录需要核对，唤醒不会自动开始计时。

「设置与数据」提供完整备份、恢复预览和本地快照。迁移前先结束活动计时，导出完整 JSON 备份，在另一台设备预览后确认替换。恢复会替换当前工作区，恢复前先创建安全快照；CSV 仅用于工时表，不能恢复工作区。

数据文件、备份和 CSV 均为明文。自行选择可信保存位置；自动快照与当前数据库位于本机，重要备份请另存。每台设备维护独立工作区，备份迁移不提供多设备同步或合并。同名导出文件不会被覆盖，请另选名称。

## 开发环境

本机验证版本见验收记录。CI 固定 Node.js 24、pnpm 10.28.0、Rust 1.96.0；依赖分别由 `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock` 锁定。

桌面构建需要对应平台工具链：Windows 的 MSVC C++ 构建工具与 WebView2，macOS 的 Xcode 命令行工具。安装说明参见 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)。

安装依赖：

```sh
pnpm install --frozen-lockfile
```

项目配置的桌面开发入口：

```sh
pnpm tauri dev
```

`pnpm dev` 仅启动网页，计时和本地数据库功能需要桌面应用。测试独立数据目录可设置 `HOURTRAIL_DATA_DIR`，不要指向正在使用的工作区。

## 验证与构建

```sh
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Windows NSIS 安装包构建：

```sh
pnpm exec tauri build --bundles nsis '--' --locked
```

默认本机构建产物位于 `src-tauri/target/release/bundle/`。CI 配置和跨平台合成备份传递流程见 [.github/workflows/ci.yml](.github/workflows/ci.yml)。CI 安装包用于验证，不执行 Release 发布。

## 项目资料

- [计时与恢复设计](docs/superpowers/specs/2026-09-29-hourtrail-timer-design.md)
- [实施计划](docs/superpowers/plans/2026-09-29-hourtrail-v1.md)
- [黑白工作台设计](docs/superpowers/specs/2026-10-03-monochrome-workspace-design.md)
- [界面重构计划](docs/superpowers/plans/2026-10-03-monochrome-workspace.md)
- [项目设计与备份合同](docs/PROJECT_DESIGN.md)
- [发布验收记录与未完成项](docs/release-checklist.md)
- [功能与体验优化清单](docs/improvement-backlog.md)
- [可移植备份 schema](schemas/backup-v1.schema.json)

历史设计中的计划步骤不代表已完成验收；当前证据统一记录在发布验收记录中。

界面组件通过 shadcn CLI 从官方 registry 拉取，使用 `radix-nova` 风格；日历源码来自 ReUI Event Calendar。对应 MIT 声明保存在 [shadcn 许可证](licenses/shadcn-MIT.txt)和 [ReUI 许可证](licenses/reui-MIT.txt)。
