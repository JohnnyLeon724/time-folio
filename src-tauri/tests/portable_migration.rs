mod common;

use common::*;
use hourtrail::{
    db::{records, Database},
    domain::*,
    services::{
        backup::{self, Backup},
        recovery::RecoveryService,
        reports::month_totals,
        restore::RestoreService,
        snapshots::SnapshotService,
        timer::TimerService,
    },
};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};

fn canonical(backup: &Backup) -> Value {
    let mut value = serde_json::to_value(backup).unwrap();
    for key in [
        "exportedAt",
        "appVersion",
        "timeZoneDataVersion",
        "reportSummaries",
    ] {
        value.as_object_mut().unwrap().remove(key);
    }
    for key in ["workEntries", "workSegments", "reviewItems"] {
        value[key]
            .as_array_mut()
            .unwrap()
            .sort_by_key(|item| item["id"].as_str().unwrap().to_owned());
    }
    value
}

#[test]
fn portable_migration_preserves_domain_and_month_totals() {
    let expected = backup::parse(
        include_bytes!("../../tests/fixtures/migration-v1.hourtrail.json"),
        MAX_TIME - 1,
    )
    .unwrap();
    let incoming = match std::env::var_os("HOURTRAIL_MIGRATION_INPUT") {
        Some(path) => backup::parse(&std::fs::read(path).unwrap(), MAX_TIME - 1).unwrap(),
        None => expected.clone(),
    };
    assert_eq!(canonical(&incoming), canonical(&expected));
    let directory = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open(&directory.path().join("workspace.db")).unwrap());
    let clock = TestClock::at(MAX_TIME - 1);
    let timer = TimerService::new(db.clone(), clock.clone());
    let restore = RestoreService::new(
        db.clone(),
        clock,
        SnapshotService::new(db.clone(), directory.path().join("snapshots")),
    );
    // A source device path must never replace this destination's local preference.
    db.internal(|tx| {
        tx.execute(
            "INSERT INTO device_settings VALUES('snapshot_directory','destination-only')",
            [],
        )?;
        Ok(())
    })
    .unwrap();
    let preview = restore.stage(incoming).unwrap();
    assert_eq!(preview.review_count, 1);
    assert_eq!(preview.deleted_count, 1);
    assert_eq!(preview.duration_ms, 3_600_000);
    restore
        .apply(ctx(&db, None), &preview.token, false)
        .unwrap();
    RecoveryService::new(timer.clone())
        .recover_on_startup()
        .unwrap();
    assert!(timer.state().unwrap().active_entry.is_none());
    let exported = db.read(backup::capture).unwrap();
    assert_eq!(canonical(&exported), canonical(&expected));
    let totals = month_totals(&exported.entries().unwrap(), "Asia/Shanghai").unwrap();
    assert_eq!(totals.len(), 2);
    assert_eq!(totals[0].month, "2026-09");
    assert_eq!(totals[1].month, "2026-10");
    assert!(totals.iter().all(|month| month.duration_ms == 1_800_000));
    db.read(|c| {
        let value: String = c.query_row(
            "SELECT value FROM device_settings WHERE key='snapshot_directory'",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(value, "destination-only");
        Ok(())
    })
    .unwrap();
    // Reimport through the same replacement workflow, including the confirmation gate.
    let preview = restore.stage(exported.clone()).unwrap();
    assert!(preview.replaces_local);
    assert_eq!(
        restore
            .apply(ctx(&db, None), &preview.token, false)
            .unwrap_err()
            .code,
        "VALIDATION"
    );
    restore.apply(ctx(&db, None), &preview.token, true).unwrap();
    assert_eq!(db.read(records::all).unwrap().len(), 3);
    assert_eq!(
        canonical(&db.read(backup::capture).unwrap()),
        canonical(&expected)
    );
    if let Some(path) = std::env::var_os("HOURTRAIL_MIGRATION_OUTPUT") {
        backup::atomic_write(
            &PathBuf::from(path),
            &serde_json::to_vec_pretty(&exported).unwrap(),
        )
        .unwrap();
    }
}
