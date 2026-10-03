# Timefolio Release 发布指南

推送 `vX.Y.Z` 标签会触发双平台验证，通过后创建 GitHub Release 草稿。草稿默认标记为测试版，不会自动公开。本流程支持 Windows x64 的 NSIS 安装包和 macOS arm64 的 DMG。

工作流定义在 [release.yml](../.github/workflows/release.yml)，复用 [ci.yml](../.github/workflows/ci.yml) 的构建、测试和 Windows → macOS → Windows 合成备份验证。当前流程已在本地检查，尚未在 GitHub 上端到端运行；首次运行应核实两个平台的结果和附件。

## 首版发布前

1. 查看[发布验收记录](release-checklist.md)，在目标系统实际安装候选包，检查计时、托盘、异常退出恢复、备份恢复和升级后的数据保留。未完成的检查应继续列为测试版限制。
2. 确定项目整体许可证。仓库目前只有第三方组件许可证，不能据此声称整个项目采用 MIT 等许可证。
3. 决定是否提供正式签名。当前 Windows 包没有开发者证书签名，macOS 包仅使用 ad-hoc 签名且未公证，适合作为明确标注限制的测试候选包。
4. 将发布准备改动提交并推送到 `main`，确认仓库允许执行 GitHub Actions。无需添加用于发布的个人访问令牌，工作流使用 GitHub 提供的 `GITHUB_TOKEN`，仅创建草稿的任务申请 `contents: write`。

当前首版版本号为 `0.1.0`，发布说明草稿在 [v0.1.0.md](releases/v0.1.0.md)。本轮没有推送标签或创建远程 Release。

## 每次发版

以下命令在项目根目录执行，推送前先检查当前分支和改动内容。示例中的 `0.1.1` 应替换为本次版本；首版沿用 `0.1.0`，无需先升到 `0.1.1`。

### 1. 更新版本与说明

```powershell
pnpm release:version 0.1.1
```

该命令同时更新 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中本项目的版本。侧栏自动读取 `package.json`。它不创建提交或 Git 标签，也不更改依赖版本。

新增 `docs/releases/v0.1.1.md`，首行为 `# Timefolio v0.1.1`，说明本次变化、适用平台、升级注意事项和已知限制。使用三段数字版本，例如 `0.1.1`，不带 `v` 或 `-beta`；是否为测试版由 GitHub 的 Pre-release 标记控制。

```powershell
pnpm release:check v0.1.1
pnpm release:test
pnpm test
pnpm build
pnpm format:check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

`release:check` 核对四处版本号、应用标识、发布说明和标签。先退出本项目的开发版再运行桌面 Rust 测试，以免 Windows 锁住 `target/debug/timefolio.exe`。这些检查也会在远端执行。

### 2. 提交并推送版本标签

确认功能改动和发布说明都已提交，工作区干净，再执行：

```powershell
git push origin main
git tag -a v0.1.1 -m "Timefolio v0.1.1"
git push origin v0.1.1
```

标签必须指向准备发布的提交。不要移动或强制覆盖已发布标签；修复发布内容时使用新版本号。普通分支推送只运行 CI，标签推送才创建 Release 草稿。

### 3. 检查 Actions 和草稿

在仓库的 [Actions](https://github.com/JohnnyLeon724/time-folio/actions) 查看 **Release draft**。完整流程依次执行：

1. 核对标签、版本、正式应用标识及发布说明。
2. 在 Windows 和 macOS 上安装依赖、执行测试及静态检查、构建安装包。
3. 验证 Windows 导出备份在 macOS 恢复、再次导出并返回 Windows。
4. 收集两份安装包，计算 SHA-256，创建带附件的测试版草稿。

草稿应含以下三个附件，其中 `<version>` 为实际版本号：

- `Timefolio_<version>_windows_x64_setup.exe`
- `Timefolio_<version>_macos_arm64.dmg`
- `SHA256SUMS.txt`

附件来自当前标签的 CI 构建，不会上传本机 `artifacts` 中的验收配置或临时程序。GitHub 的 Source code 附件不是安装包。构建中间产物保留 7 天，成功上传到 Release 的附件不受该保留期影响。

### 4. 验收后公开

从 [Releases](https://github.com/JohnnyLeon724/time-folio/releases) 打开草稿，下载安装包，按验收记录实测。Windows 可核对文件哈希：

```powershell
Get-FileHash .\Timefolio_0.1.1_windows_x64_setup.exe -Algorithm SHA256
```

与同一草稿内 `SHA256SUMS.txt` 的对应行比较。校验值用于确认下载内容一致，不能替代开发者代码签名。

核实版本、文件、发布说明后点击 **Publish release**。首版保留 **Set as a pre-release**；后续具备正式发布条件时，可在草稿页面取消此标记。工作流始终创建草稿和测试版标记，不会替维护者作出正式发布判断。

## 签名与更新

当前 CI 为 macOS 设置 `APPLE_SIGNING_IDENTITY=-`。这是 Apple Silicon 测试分发使用的 ad-hoc 签名，不是 Developer ID 签名，也没有 Apple 公证。正式 macOS 分发应按 [Tauri macOS 签名文档](https://v2.tauri.app/distribute/sign/macos/)配置证书及公证凭据，并替换这一设置。

Windows 正式代码签名按 [Tauri Windows 签名文档](https://v2.tauri.app/distribute/sign/windows/)配置。证书和私钥应通过仓库 Secrets 或签名服务提供，不放入源码或发布附件。

目前没有应用内自动更新能力。发布 Release 不会让已安装软件自动更新；用户需下载并安装新包，升级前建议导出完整 JSON 备份。保留应用标识 `com.timefolio.desktop`，不要把隔离验收标识用于公开版本。

## 失败与回退

| 情况 | 处理 |
| --- | --- |
| 版本或说明检查失败 | 检查四处版本号与 `docs/releases/vX.Y.Z.md`，修正后提交新版本 |
| Windows 或 macOS 构建失败 | 查看失败任务日志；所有验证未通过时不会创建草稿 |
| 草稿上传中断，重跑提示 Release 已存在 | 先确认它仍是未公开草稿，检查附件；若需完整重跑，由维护者删除该不完整草稿，再重跑原工作流。保留版本标签，不删除公开 Release |
| `403 Resource not accessible by integration` | 检查仓库或组织 Actions 策略是否允许工作流的 `contents: write` 权限 |
| 本机 `gh` 提示 `401 Bad credentials` | 重新配置本机 GitHub CLI 登录；网页查看和标签触发不依赖本机 `gh`。不要把令牌写入仓库 |
| 已公开版本发现问题 | 在说明中标明问题并准备补丁版本；不要用新二进制悄悄替换同一版本附件。数据恢复应使用兼容版本和备份，不假定旧程序能读取更新后的数据库 |

可复用工作流与权限规则参考 [GitHub 官方文档](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)，签名和构建入口参考 [Tauri GitHub 发布文档](https://v2.tauri.app/distribute/pipelines/github/)。
