# HourTrail — Project Design

**Design version:** 1.1  
**Date:** 2026-09-29  
**Status:** Implementation proposal; no application or installer is included.  
**Product:** HourTrail  
**Repository and project folder:** `hourtrail`  
**Suggested repository location for this document:** `docs/PROJECT_DESIGN.md`

## Detailed timer specification

The confirmed first-release direction is real-time timing, close-to-tray operation, and user review after sleep. See the [detailed timer design](superpowers/specs/2026-09-29-hourtrail-timer-design.md) for state transitions, recovery, UI behavior, command contracts, and acceptance cases. Its explicit defaults refine this overview and remain subject to document review.

## 1. Product Goal

HourTrail is a personal, local-first desktop work-hour journal for remote internships. The primary workflow is to start a task timer, pause and resume actual work, finish and review the intervals, verify monthly totals, and export a timesheet. Manual entry and correction support this workflow. A complete portable backup lets a user move from Windows to macOS, or from macOS to Windows, without manually recreating records.

The first release is designed for one user and one active computer at a time. Moving data is a deliberate export-and-restore operation, not real-time synchronization. No account, hosted API, cloud storage integration, team approval, payroll calculation, activity surveillance, or screenshot capture is required.

The project name is a proposed working name, not a statement of trademark or domain availability.

## 2. Technology Decisions

| Layer | Selection | Responsibility |
| --- | --- | --- |
| Desktop shell | Tauri 2 | Windows, native dialogs, platform integration, first-release tray support |
| Frontend | React, TypeScript, Vite | Pages and interactive UI |
| UI components | shadcn/ui, Tailwind CSS | Forms, Sheet, Dialog, AlertDialog, Table, progress and feedback |
| Event calendar | ReUI Event Calendar as the provisional reference | Month, week, and agenda presentation, behind a project-owned adapter |
| Forms | React Hook Form, Zod | Immediate field validation and useful error messages |
| Query state | TanStack Query | Queries, mutations, and cache invalidation |
| Frontend dates | date-fns, @date-fns/tz | Display formatting and explicit reporting-zone presentation |
| Local application services | Rust | Authoritative validation, reporting, backup, and restore |
| Persistence | rusqlite, SQLite | Transactions and durable local records |

The user's original calendar name was “Deui”; ReUI remains the provisional interpretation, not a confirmed correction. ReUI documents an Event Calendar component, which is the current reference. [1]

No separate HTTP server or Next.js layer is planned. React invokes a small application command interface. Components must not execute SQL or calculate authoritative monthly totals independently.

Configure local TanStack Query queries and mutations with `networkMode: "always"` and automatic retries disabled. The documented `always` mode ignores network availability; the default `online` mode does not. [2]

Select and lock compatible dependency releases when implementation starts; this design does not prescribe unverified latest package versions.

## 3. Naming and Files

| Item | Name or pattern |
| --- | --- |
| Product display name | `HourTrail` |
| Repository / project folder / package name | `hourtrail` |
| Design document | `PROJECT_DESIGN.md` |
| Runtime database | `hourtrail.db` |
| Portable backup | `hourtrail-backup-<YYYYMMDDTHHmmssZ>.hourtrail.json` |
| Monthly timesheet | `hourtrail-timesheet-<YYYY-MM>.csv` |
| Automatic local snapshot | `hourtrail-snapshot-<YYYYMMDDTHHmmssZ>.db` |
| Pre-restore safety snapshot | `hourtrail-pre-restore-<YYYYMMDDTHHmmssZ>.db` |

Example portable filename: `hourtrail-backup-20260928T180000Z.hourtrail.json`.

Use ASCII names and colon-free UTC timestamps for generated filenames. If a filename already exists, create a unique suffix or ask before replacing it; never silently overwrite an older backup.

Use kebab-case for TypeScript/React filenames, PascalCase for React component symbols, snake_case for Rust filenames and database identifiers, and camelCase for JSON fields. Generated framework filenames such as `Cargo.toml` and `tauri.conf.json` retain their standard names.

Choose the permanent Tauri application identifier before real data collection. Resolve storage through the application's platform-aware local data directory instead of hard-coded Windows or macOS paths. Tauri's path API exposes an application local-data directory based on the application identifier. [3]

## 4. User Interface

### Work Calendar

The default page contains a persistent timer card, a pending-review entry point, an explicitly labeled month summary, a calendar toolbar, and month/week/agenda views. Clicking an empty day opens an entry Sheet. Clicking a work interval opens its parent entry and highlights the selected interval.

Represent each actual work segment as a separate calendar event. For example, 09:00–12:00 and 13:30–18:00 produce two events, with the lunch break visibly empty. Do not draw one continuous all-day work block.

The month shown in the summary must be explicit even when a visible week spans two months. Neighboring-month cells may show events without contributing to the selected month's total. Collapsed events still contribute to totals.

The window close action hides the window while the Rust process continues timing. The tray provides open, pause/resume, stop, and explicit quit actions. Sleep interruptions require review, and wake does not automatically resume timing. Stop persists the end immediately and opens review; dismissing review leaves a durable pending record.

### Entry Sheet

Fields: task title, work date, one or more actual work intervals, optional note, and read-only duration preview. Show the ending date explicitly for overnight work. Frontend validation is advisory; Rust validates again before saving.

Saving succeeds only after the local transaction succeeds. Keep entered values after an error. Delete uses a confirmation and soft deletion with an undo path.

### Monthly Report

Show the selected month, reporting time zone, completed work duration, worked-day count, daily breakdown, and CSV export. Pending-review and unfinished work is displayed separately, not silently included in official totals.

### Settings / Data Management

Use three sections: **Export Timesheet**, **Export Full Backup**, and **Import Backup**. Keep portable data transfer separate from local automatic snapshot controls.

Export Full Backup shows record counts, covered dates, the reporting time zone, the last successful export time, and a plaintext privacy notice. A save dialog chooses the destination. Tauri's Dialog plugin provides native open/save dialog support. [4]

Import Backup is a guided flow: choose file, validate, preview, confirm replacement when necessary, restore, and display the result. Selecting a file must not modify existing records.

## 5. Time and Reporting Rules

Store time instants as UTC epoch milliseconds, using integers. Keep one explicitly selected IANA reporting time-zone identifier in portable settings. Never infer the reporting zone from the OS after migration, and never change it merely because the new computer has a different zone.

An entry may have multiple segments. Completed, non-deleted entries are included in official reports; pending-review entries are excluded. Effective completed intervals must not overlap each other or active work intervals. Pending-review records may contain conflicts, which must be resolved before completion. Adjacent intervals are valid. Each non-null end must be strictly later than its start.

For a month in the reporting zone, create the local first-of-month and next-first-of-month boundaries, then convert those boundaries into instants. The overlap calculation is:

```text
monthInterval = [monthStart, nextMonthStart)
contribution = max(0, min(segmentEnd, nextMonthStart)
                      - max(segmentStart, monthStart))
```

Use the same approach for day boundaries. Do not assume a local calendar day is always 24 elapsed hours. A segment spanning month-end contributes to both months as appropriate.

Aggregate integer durations before formatting or rounding. Display hours and minutes in the UI; CSV may additionally contain decimal hours and exact `durationMs`. Worked-day count means distinct reporting-zone dates with positive included duration.

Resolve ambiguous or nonexistent local input times explicitly. Use a consistent reporting engine and compatible time-zone data across platform builds. If a future time-zone database update changes historical monthly allocation, show a report comparison during restore instead of silently promising identical month boundaries.

## 6. Local Data Model

| Table | Core fields |
| --- | --- |
| `work_entries` | `id`, `title`, `note`, `source`, `status`, `version`, `created_at`, `updated_at`, `deleted_at` |
| `work_segments` | `id`, `entry_id`, `start_at`, `end_at` |
| `review_items` | Interruption reason, candidate boundaries, boundary quality, resolution |
| `timer_runtime` | Device-local active segment and recovery checkpoint |
| `operation_receipts` | Device-local request IDs and mutation results for duplicate protection |
| `settings` | Allowlisted portable preferences, including reporting zone |
| `device_settings` | Local backup destination, window state, OS integration preferences |
| `app_metadata` | Workspace ID, database schema version, local mutation revision |

Use stable UUID identifiers for entries, segments, and the workspace. Restore preserves these IDs; it does not create new IDs for old work.

The first release implements `running`, `paused`, `needs_review`, and `completed`. Only one non-deleted running or paused record can exist at a time. Portable backup format v1 contains only `completed` or `needs_review` entries. For `completed`, every segment has an end. For compatibility with the initial draft, a `needs_review` entry may retain an unresolved open segment; it never accrues time merely because it was restored.

Enable foreign-key checks. Apply entry creation/editing and overlap validation under one write transaction. Do not maintain a manually synchronized monthly totals table; calculate reports from actual segments.

## 7. Two Different Export Products

### CSV Timesheet

CSV is for reviewing or submitting a month's work, not restoring the application. Proposed columns:

```text
workDate,taskTitle,startAt,endAt,reportingTimeZone,durationMs,decimalHours,note
```

Split rows at report/day boundaries when necessary so row totals match the report. Quote fields correctly and neutralize formula-like user text when preparing spreadsheet-facing CSV. Preserve the original user text in the portable backup. CSV import is out of scope for the first release.

### Full Portable Backup

The migration file is one UTF-8 JSON document with the compound extension `.hourtrail.json`. Use normal JSON serialization, not evaluated JavaScript. UTF-8, Unicode handling, and numeric-interoperability constraints are defined by RFC 8259. [5]

The backup includes all work entries and segments, retained soft-deleted records, pending-review records, timestamps, stable identifiers, and portable preferences. It excludes executable files, SQL scripts, query caches, logs, absolute file paths, local backup locations, device-specific settings, and precomputed report totals as authoritative data.

SQLite's file format is already cross-platform. [6] Choosing JSON here is an application-level decision: it creates an explicit, inspectable transfer contract independent of the internal table layout. It is not a workaround for an alleged SQLite platform incompatibility.

Do not instruct users to copy the live database as the standard migration workflow. With WAL enabled, committed state may still reside in the WAL file; separating it from the main database can lose transactions or damage consistency. [7]

## 8. Portable Backup Contract

The following is a structurally illustrative empty backup, not an export of the user's records. The UTC time zone is an example, not a preset for the user's internship.

```json
{
  "format": "hourtrail-backup",
  "formatVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-09-28T18:00:00.000Z",
  "workspaceId": "c202b9fe-3b9c-45af-9b73-7f3c73811a4f",
  "portableSettings": {
    "reportingTimeZone": "Etc/UTC",
    "weekStartsOn": 1
  },
  "workEntries": [],
  "workSegments": [],
  "reviewItems": []
}
```

An exported entry has `id`, `title`, `note`, `source`, `status`, `createdAt`, `updatedAt`, and nullable `deletedAt`. An exported segment has `id`, `entryId`, `startAt`, and nullable `endAt`. Domain timestamps are integer UTC milliseconds; `exportedAt` is an RFC 3339 UTC metadata string. Validate every integer against the application's accepted date range and JavaScript's safe-integer range.

`reviewItems` preserves interruption evidence and review decisions as defined in the detailed timer specification. Missing `reviewItems` in initial-draft files is interpreted as an empty array. Device-local record versions, timer runtime, and operation receipts are excluded. Format v1 is still an unpublished design, not an already released compatibility promise.

`formatVersion` describes the transfer contract, not the SQLite schema. An importer accepts only explicitly supported format versions. Supported older formats are migrated through tested transformations; an unsupported newer format produces an update-required error without modifying local data. `appVersion` is diagnostic metadata, not the sole compatibility test.

The first release uses plaintext backups. Schema validation detects structural and business-rule failures, not every possible edit or malicious modification. Do not claim encryption, authenticity, or tamper-proofing. Users must protect exported task descriptions and notes. Password-protected backups may be designed separately later.

## 9. Export Workflow

Before a manual migration export, ask the user to finish an active/paused timer or explicitly move it to pending review. Export must not silently stop a timer, guess an end time, or omit its data. The first release enforces this rule before taking the export snapshot.

Read all portable tables and settings from one consistent SQLite read transaction. Serialize only the allowlisted transfer DTOs. Write a temporary file in the chosen destination directory, flush it, validate the completed bytes, and publish the completed file with a platform-tested safe file operation. Never report success for a partial file.

Record a successful export only after completion. On cancellation, permission failure, or disk-full errors, keep existing records and previous backups unchanged. A separately confirmed timer-state change is not automatically undone just because export fails.

Automatic and pre-restore snapshots are a separate internal mechanism. Create them with SQLite's supported Online Backup API rather than copying an open database file; the API is designed to produce a consistent database snapshot. [8]

## 10. Restore Workflow and Safety

### Scope

Version 1 supports **full restore only**. An empty installation can restore directly after preview. A non-empty installation requires an explicit **Replace Local Data** confirmation and a successfully created local safety snapshot. There is no append, merge, timestamp-wins rule, or silent deduplication mode.

Restoring the same backup does not append duplicate rows. However, restoring it after making newer local edits returns the workspace to the older backup state. Preview must make that replacement behavior clear.

### Validation and Preview

Parse in Rust with an initial 50 MiB file-size limit, bounded nesting and collection sizes, and strict expected field types. Reject duplicate JSON keys, duplicate IDs, invalid dates, unknown formats, missing references, invalid completed intervals, and overlapping effective completed work. Pending-review data remains excluded from official reports.

Validate the reporting zone. Never replace an unrecognized zone with the destination OS zone. Any unsupported setting must produce an explicit compatibility message, not an unnoticed statistics change.

Show source app version, export time, coverage dates, entry and segment counts, included completed duration, pending-review/deleted counts, imported reporting zone, and whether local work will be replaced. Recompute this information from parsed records; do not trust claimed totals in the file.

Bind the preview to a Rust-owned immutable staged payload and the current local mutation revision. If the local workspace changes before confirmation, require a fresh preview. Do not accept client-supplied record counts or preview IDs as sufficient authorization to overwrite unrelated data.

### Transactional Application

Require no running or paused local timer. Acquire the application's write gate so UI edits, tray operations, and timer writes cannot race with restoration. Validate the staged payload in an isolated temporary database using the current application schema.

Create and verify a pre-restore snapshot before touching live records. If snapshot creation fails, stop. Apply replacement of portable domain rows and settings in one transaction in the existing live database. Preserve destination device settings and the current internal schema version. Clear device-local timer runtime and obsolete operation receipts; imported work never starts a timer. Restore the workspace ID from the file, but generate a fresh local revision token so earlier pending edits cannot be committed against stale data.

Check relationships and report invariants before commit. Failure rolls back the replacement; success invalidates all record/report/calendar queries and reloads portable settings. Use SQLite's supported durability mechanisms rather than renaming a file over an open database. Transactional atomicity is the relevant SQLite primitive, subject to its documented operating-system and storage assumptions. [9]

Show restored counts, report results, pending items, and the location of the safety snapshot. Destination backup folders and window preferences are preserved or initialized locally; source paths are never replayed.

## 11. Windows and macOS Interoperability

The shared contract is the portable data file, not a universal executable. Build separate Windows and macOS installers; Tauri documents platform-specific distribution, Windows installers, and macOS DMG packaging. [10]

Initial release targets: Windows x64 and macOS arm64. Add macOS x64 as a separately tested target when supporting Intel Macs; do not advertise an untested architecture. Each released Windows/macOS build must read and write the same supported backup contract.

User migration flow:

```text
Old computer: finish/review work → Export Full Backup
Transfer the completed .hourtrail.json file
New computer: install matching OS build → Import Backup → Preview → Restore
Verify monthly totals and pending items → Continue recording on the new computer
```

Keep the old machine's data and original backup until validation succeeds. Restoring on one computer does not update the other. Alternating between two computers requires a fresh export and deliberate restore each time; concurrent edits and automatic reconciliation are not supported in v1.

## 12. Suggested Project Structure

This is the planned repository layout, not a claim that these source files have already been implemented.

```text
hourtrail/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── components.json
├── vite.config.ts
├── tsconfig.json
├── .gitignore
├── docs/
│   └── PROJECT_DESIGN.md
├── schemas/
│   └── backup-v1.schema.json
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── app.tsx
│   │   ├── providers.tsx
│   │   └── query-client.ts
│   ├── components/
│   │   ├── ui/
│   │   └── reui/
│   ├── features/
│   │   ├── timer/
│   │   │   ├── timer-card.tsx
│   │   │   └── review-panel.tsx
│   │   ├── calendar/
│   │   │   ├── calendar-page.tsx
│   │   │   ├── work-calendar.tsx
│   │   │   └── calendar-adapter.ts
│   │   ├── entries/
│   │   │   ├── entry-sheet.tsx
│   │   │   └── segment-fields.tsx
│   │   ├── reports/
│   │   │   └── monthly-report-page.tsx
│   │   ├── data-management/
│   │   │   ├── data-management-panel.tsx
│   │   │   ├── export-backup-dialog.tsx
│   │   │   ├── import-backup-dialog.tsx
│   │   │   └── import-preview.tsx
│   │   └── settings/
│   │       └── settings-page.tsx
│   ├── services/
│   │   ├── worklog-service.ts
│   │   └── backup-service.ts
│   ├── types/
│   │   ├── work-entry.ts
│   │   └── backup.ts
│   └── lib/
│       ├── datetime.ts
│       └── duration.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── migrations/
│   │   └── 0001_initial.sql
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── entries.rs
│   │   │   ├── timer.rs
│   │   │   ├── reports.rs
│   │   │   └── backup.rs
│   │   ├── services/
│   │   │   ├── mod.rs
│   │   │   ├── time_service.rs
│   │   │   ├── timer_service.rs
│   │   │   ├── review_service.rs
│   │   │   ├── backup_service.rs
│   │   │   ├── import_service.rs
│   │   │   └── csv_service.rs
│   │   ├── platform/
│   │   │   ├── mod.rs
│   │   │   ├── power_events.rs
│   │   │   └── tray.rs
│   │   └── db/
│   │       ├── mod.rs
│   │       └── connection.rs
│   └── tests/
│       ├── backup_roundtrip.rs
│       ├── restore_atomicity.rs
│       └── month_boundaries.rs
└── tests/
    └── fixtures/
        ├── valid-backup-v1.hourtrail.json
        └── invalid-backup-v1.hourtrail.json
```

Keep runtime databases, real work records, backups, logs, and export files outside the repository and out of source control. Test fixtures contain synthetic data only. The JSON Schema file validates structure; it does not replace Rust checks for relationships, overlap, or restore safety.

## 13. Application Command Contract

These are proposed application commands, not built-in Tauri API names.

| Command | Responsibility |
| --- | --- |
| `get_timer_state()` | Read authoritative active state and elapsed-time inputs |
| `start_timer(input)` / `pause_timer(input)` / `resume_timer(input)` | Apply a validated timer transition |
| `stop_timer(input)` | Persist the end and move to pending review |
| `resolve_entry(input)` | Apply review decisions and complete or continue |
| `list_review_entries(query)` | List pending records, including records without segments |
| `save_entry(input)` | Validate and save an entry and its segments |
| `list_entries(query)` | Read entries intersecting a visible date interval |
| `delete_entry(id)` / `restore_entry(id)` | Soft-delete and undo |
| `get_month_report(month)` | Calculate authoritative monthly statistics |
| `export_month_csv(month, destination)` | Write a review/submission timesheet |
| `export_backup(destination)` | Write a complete portable snapshot |
| `inspect_backup(source)` | Validate and stage data; return preview and opaque token |
| `restore_backup(preview_token, confirmation)` | Apply the exact staged data safely |
| `create_local_snapshot()` | Produce a supported SQLite safety snapshot |

Rust validates destinations and file access. Keep capabilities narrowly scoped; importing a file never executes embedded code or SQL. Return typed, user-facing errors for incompatible format, invalid data, permission failure, insufficient space, active timer, and stale preview.

## 14. Delivery Plan

**First usable release:** React/shadcn shell, real-time start/pause/resume/stop, single active task, tray integration, sleep review and interruption recovery, calendar adapter, manual multi-segment entries, monthly statistics, CSV export, complete portable export, preview-and-replace restore, local safety snapshots and their recovery UI, trash recovery, and Windows/macOS round-trip verification. Cross-platform migration is a release requirement, not a deferred enhancement.

**Later interaction improvements:** drag/resize changes with confirmation and optional shortcuts. First-release timing is already based on persisted instants, not on the number of UI refresh callbacks.

**Later, separately designed:** merge import, synchronization, encrypted backup, or richer analytics. Stable IDs alone are not a synchronization algorithm; merging would need explicit conflict, deletion, and reporting-zone rules.

## 15. Acceptance Criteria

| Scenario | Expected outcome |
| --- | --- |
| Windows export → macOS restore | Same IDs, descriptions, intervals, reporting zone, and included totals |
| macOS export → Windows restore | Same result in the reverse direction |
| Non-ASCII text, emoji, and multiline notes | Exact text round-trip |
| Destination uses a different OS time zone | Reporting zone stays unchanged |
| Month-end and overnight intervals | Correct allocation to each reporting month/day |
| DST boundaries in a supported reporting zone | Boundary-aware duration and explicit ambiguous-input handling |
| Same backup restored repeatedly | No appended duplicates; replacement semantics remain explicit |
| Newer local edits exist | Clear warning that full restore will replace them |
| Damaged, oversized, or unsupported-version file | Rejected without changing local data |
| Missing reference, duplicate ID, or overlap | Validation failure with actionable explanation |
| Disk full during export | No successful-looking partial backup; earlier files remain intact |
| Safety snapshot fails | Restore does not start |
| Failure during transactional replacement | Original workspace remains recoverable; no accepted partial import |
| Local data changes after preview | Stale preview rejected and regenerated |
| Pending-review record restored | Remains pending; no inferred work during the move |
| Soft-deleted record restored | Remains deleted and excluded from totals |
| Source backup folder does not exist on destination | No attempt to reuse the source path |
| Entire workflow performed offline | Record, report, export, import, and verification all work |

Timer-specific acceptance cases are specified in the linked detailed design and are also first-release requirements.

These are planned tests. No application build, cross-platform execution, or acceptance-test pass is claimed by this design document.

## Technical References

Primary documentation consulted for the implementation constraints; product behavior above is a proposed design.

[1] ReUI, Event Calendar: `https://reui.io/docs/components/radix/event-calendar`

[2] TanStack Query, Network Mode: `https://tanstack.com/query/latest/docs/framework/react/guides/network-mode`

[3] Tauri, Path API: `https://v2.tauri.app/reference/javascript/api/namespacepath/`

[4] Tauri, Dialog Plugin: `https://v2.tauri.app/plugin/dialog/`

[5] IETF RFC 8259, JSON: `https://www.rfc-editor.org/rfc/rfc8259.html`

[6] SQLite, Single-file Cross-platform Database: `https://www.sqlite.org/onefile.html`

[7] SQLite, Write-Ahead Logging: `https://www.sqlite.org/wal.html`

[8] SQLite, Online Backup API: `https://www.sqlite.org/backup.html`

[9] SQLite, Atomic Commit: `https://www.sqlite.org/atomiccommit.html`

[10] Tauri, Distribution: `https://v2.tauri.app/distribute/`; Windows: `https://v2.tauri.app/distribute/windows-installer/`; macOS DMG: `https://v2.tauri.app/distribute/dmg/`
