# 黑白工作台实施计划

目标：按已确认的[设计](../specs/2026-10-03-monochrome-workspace-design.md)重构现有桌面界面。

- [x] 基础体系：配置 components.json 与 @ 路径，使用 CLI 拉取 Radix shadcn 组件及 ReUI 日历；建立灰阶语义主题，保留源码许可证。
- [x] 日历：保留 calendar-adapter 业务映射，受控显示统计时区；测试分段与点击、今天与视图切换；禁用直接修改工时。
- [x] 工作台：重构 app.tsx 的导航与页面布局，紧凑计时条；测试中文输入和失败状态。
- [x] 编辑核对：保留表单和写入逻辑，改为 Sheet、Field、Input、Textarea、NativeSelect 与删除确认；运行核对测试。
- [x] 报告与设置：Table、Tabs、Card、Alert、Skeleton、Sonner 统一展示，保留备份确认和失败处理。
- [x] 验证：前端测试、类型检查、format:check、build；合成数据浏览器视觉检查与窄窗口检查。实际结果见[发布验收记录](../../release-checklist.md)。

用户要求每个阶段或功能完成后，验证并原子化分批提交。当前按依赖配置、界面功能、设计及验收文档分别提交。

不修改 Rust 领域合同或计时恢复规则。上游生成组件只作必要兼容修正；业务适配与组件来源分开维护。
