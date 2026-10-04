<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" height="80" alt="Timefolio icon">
</p>

<h1 align="center">Timefolio</h1>

<p align="center">
  <a href="README.md">简体中文</a> · English
</p>

<p align="center">
  <strong>Record your time. Understand where it goes.</strong><br>
  An offline desktop app for tracking work, study, and other activities.
</p>

Timefolio records the intervals you actually spend on an activity. Start a timer, pause for breaks, then review the intervals before including them in weekly and monthly reports. Records live in a local SQLite database. Export monthly CSV files for analysis or a complete backup to move your workspace to another device.

## Download and get started

Find published installers on the [Releases page](https://github.com/JohnnyLeon724/time-folio/releases). The first release provides a Windows x64 `.exe` installer. The automatically attached **Source code** archives are for developers, not installation.

The application interface is currently in Simplified Chinese. This English README does not indicate an English UI. Windows x64 and macOS arm64 are the target platforms; cross-platform desktop acceptance is not complete. See the [verification record](docs/release-checklist.md) (Chinese) for tested behavior and outstanding checks.

1. Open **设置与数据** (Settings and data) and confirm your reporting time zone.
2. In **时间日历** (Time calendar), enter a task title or reuse a recent title, then select **开始计时** (Start timer). Pause during breaks.
3. Stop the timer, review the intervals, and confirm the completed record. Closing the review panel leaves the record pending for later review.
4. Open **时间报告** (Time reports) to switch between weekly and monthly reports. Monthly reports also provide a full-month CSV export.

The Windows installer is not signed with a publisher certificate and may trigger an operating-system warning. There is no in-app automatic update; download and install new versions manually. Export a complete JSON backup before upgrading an existing workspace.

## Features

| Feature                    | What it does                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Interval timer             | Start, pause, resume, and review recorded intervals; reuse recent task titles; keep one active task at a time |
| Calendar                   | Month, week, and list views; display actual intervals separately, leaving breaks empty                        |
| Manual entries and review  | Add or edit intervals, locate conflicts, and confirm before discarding unsaved edits                          |
| Weekly and monthly reports | Confirmed duration, recorded days, daily charts, date filtering, task search, and interval details            |
| Title summaries            | Aggregate matching titles across a reporting period and expand them to inspect individual records             |
| Backups and exports        | Monthly CSV, complete JSON backups, restore previews, and local database snapshots                            |
| Desktop recovery           | Tray controls, review after sleep or interruption, and a recycle bin for deleted records                      |

When the tray is available, closing the window hides it while timing continues. Use the tray menu to quit. Waking the computer does not automatically resume timing; interrupted records need review.

### Editing and reporting rules

Click a calendar record to open its details. Dragging calendar events does not change records. Time inputs accept `09:30` or `09:30:45`; entering only hours and minutes preserves existing seconds. Saving checks interval boundaries and overlaps.

Reports include only completed records that have not been deleted. Active, paused, and pending-review records are excluded. Breaks are excluded too. Intervals crossing midnight or month boundaries are split using the reporting time zone, and weeks follow the workspace's configured start day.

Title summaries cover the entire selected period, independently of the detail filters. Titles are trimmed and grouped by exact, case-sensitive equality. Original records remain separate.

CSV export always covers the whole selected month, regardless of the detail filters. Its five columns are date, task, start time, end time, and duration, with Chinese column labels. Each actual interval gets a row, split at local midnight where needed. Timestamps use the reporting time zone; durations represent elapsed time, including across daylight-saving changes. The file uses UTF-8 with a BOM. See the [CSV service](src-tauri/src/services/csv.rs) for the format and spreadsheet-formula escaping.

## Data and backups

| Format                | Purpose                                                    | Limits                                                             |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `timefolio.db`        | Current workspace in the system application-data directory | Local to this device                                               |
| CSV                   | Review or analyze monthly intervals                        | Cannot restore a workspace                                         |
| `.timefolio.json`     | Complete portable backup                                   | Restore replaces the current workspace; it does not merge records  |
| Local `.db` snapshots | Roll back to an earlier local state                        | Stored on the same device; not a substitute for an external backup |

To migrate, finish the active timer and export a complete backup from **设置与数据 → 备份与数据** (Settings and data → Backup and data). On the destination device, select the backup, review the preview, and confirm replacement. Restore creates a safety snapshot first. Each device maintains an independent workspace; there is no multi-device synchronization.

The app shows the last successful export and most recent local snapshot. Existing export files are not overwritten; choose another filename if one already exists.

Database files, backups, and CSV exports are not encrypted. Keep important backups outside the device and avoid attaching private records to public issues. The portable format is defined in the [backup schema](schemas/backup-v1.schema.json).

## Local development

The [CI workflow](.github/workflows/ci.yml) uses Node.js 24, pnpm 10.28.0, and Rust 1.96.0 with rustfmt and Clippy. Dependencies are locked in `pnpm-lock.yaml` and `src-tauri/Cargo.lock`.

Install the platform tools described in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): Windows development uses the MSVC toolchain, C++ Build Tools, and WebView2; macOS uses Xcode command-line tools.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

The desktop command starts the frontend development server through [tauri.conf.json](src-tauri/tauri.conf.json). `pnpm dev` alone starts only the web frontend; timing and database operations require the desktop app.

For an isolated test workspace, set `TIMEFOLIO_DATA_DIR` to a separate directory. Do not point it at a workspace already in use.

### Architecture

The app uses Tauri 2 and Rust for desktop integration and local services, React 19 and TypeScript for the frontend, and SQLite for persistence. The UI uses Tailwind CSS, shadcn/ui, and ReUI Event Calendar. See [package.json](package.json) and [Cargo.toml](src-tauri/Cargo.toml) for dependency versions.

React calls Tauri commands through [the frontend client](src/services/client.ts). The Rust [controller](src-tauri/src/commands/mod.rs) routes requests to domain validation and services for timing, reports, backup, and recovery. Tray and power events also enter through Rust services.

| Directory               | Contents                                                             |
| ----------------------- | -------------------------------------------------------------------- |
| `src/app/`              | Application layout and page composition                              |
| `src/features/`         | Timer, calendar, entries, reports, and settings                      |
| `src/components/`       | Shared UI and calendar components                                    |
| `src-tauri/src/`        | Commands, domain rules, services, database, and platform integration |
| `src-tauri/migrations/` | Database schema migrations                                           |
| `src-tauri/tests/`      | Rust integration tests                                               |
| `tests/fixtures/`       | Backup and migration fixtures                                        |
| `.github/workflows/`    | Verification, packaging, and release drafts                          |

## Tests and installers

Run the checks from the repository root:

```sh
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
pnpm release:check
pnpm release:test
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Close the development app before running desktop Rust tests on Windows to avoid locking its executable.

Build installers on the corresponding operating system:

```sh
# Windows: NSIS setup executable
pnpm exec tauri build --bundles nsis '--' --locked

# macOS: DMG
pnpm exec tauri build --bundles dmg '--' --locked
```

Local installer output is under `src-tauri/target/release/bundle/`. CI passes an explicit target and writes under `src-tauri/target/<target>/release/bundle/` instead. For version `0.1.0`, the default Windows output is `src-tauri/target/release/bundle/nsis/Timefolio_0.1.0_x64-setup.exe`.

Branch CI builds test installers and checks synthetic backup migration from Windows to macOS and back. A version-tag push triggers the release workflow, which creates a draft prerelease after verification. The first Windows release can also be uploaded manually. See the [release workflow](.github/workflows/release.yml) for configuration and the [first release notes](docs/releases/v0.1.0.md) (Chinese) for scope and limitations. Publishing a draft remains a maintainer action.

## Contributing and documentation

Read the bilingual [contribution guide](CONTRIBUTING.md) before reporting a problem or submitting changes. Keep business validation and report calculations in Rust, and preserve original record identity when changing the UI.

The following detailed project documents are currently in Chinese:

- [Verification record](docs/release-checklist.md): automated checks, installer builds, and outstanding desktop acceptance.
- [First release notes](docs/releases/v0.1.0.md): downloads, features, and test-release limitations.
- [Improvement backlog](docs/improvement-backlog.md): current behavior and potential follow-up work.

## License and acknowledgments

Timefolio is licensed under the [MIT License](LICENSE), copyright (c) 2026 JohnnyLeon724. Third-party components retain their own licenses and copyright notices. See [third-party notices](THIRD_PARTY_NOTICES.md), including [shadcn/ui](licenses/shadcn-MIT.txt) and [ReUI](licenses/reui-MIT.txt).
