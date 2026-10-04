# Contributing to Timefolio

## 中文

欢迎通过 [Issues](https://github.com/JohnnyLeon724/time-folio/issues) 反馈问题、提出建议，通过 Pull Request 提交改动。中英文均可。

反馈问题时，请提供应用版本、操作系统及架构、复现步骤、预期结果与实际结果。截图和日志请先去除隐私信息，不要上传真实数据库或个人备份；涉及时间统计的问题，可提供脱敏后的示例时段和统计时区。

开发环境、启动命令、测试和打包命令见 [README](README.md#本地开发)。测试时使用独立的 `TIMEFOLIO_DATA_DIR`，避免修改日常工作区。

提交改动时：

- 每个 Pull Request 聚焦一个问题，说明用户可见变化。
- 沿用现有格式和职责划分；业务校验、报表规则和持久化逻辑位于 Rust 层。
- 修复行为时补充相关回归用例，运行 README 中适用的检查，并列出结果。
- 明确区分自动测试、构建成功和实机验收；未执行的检查请如实说明。
- 功能变化同步更新中英文 README；备份合同变化同步更新 schema 与迁移用例。
- 不提交安装包、数据库、个人备份、访问令牌或签名私钥。

项目采用 [MIT 许可证](LICENSE)。保留已有第三方版权及许可声明，新增第三方代码时一并提供相应声明。

## English

Use [Issues](https://github.com/JohnnyLeon724/time-folio/issues) for bug reports and suggestions, and pull requests for changes. Reports in Chinese or English are welcome.

Include the app version, operating system and architecture, steps to reproduce, expected behavior, and actual behavior. Remove private information from screenshots and logs. Do not upload a real database or personal backup; for reporting problems, provide anonymized sample intervals and the reporting time zone.

See the [English README](README_EN.md#local-development) for setup, development, tests, and packaging. Use a separate `TIMEFOLIO_DATA_DIR` when testing.

For pull requests:

- Focus on one problem and describe the user-visible change.
- Follow existing formatting and module boundaries. Keep business validation, reporting rules, and persistence in Rust.
- Add relevant regression coverage for behavior changes, run the applicable README checks, and report the results.
- Distinguish automated tests, successful builds, and manual desktop testing. State which checks were not run.
- Update both READMEs for feature changes. Update the schema and migration cases when changing the backup contract.
- Do not commit installers, databases, personal backups, access tokens, or signing keys.

The project uses the [MIT License](LICENSE). Preserve third-party copyright and license notices, and include the appropriate notices when adding third-party code.
