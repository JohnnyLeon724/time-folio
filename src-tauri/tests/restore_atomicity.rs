mod common;
use common::*;
use hourtrail::{
    db::{records, Database},
    domain::*,
    services::{
        backup::capture, entries::EntryService, restore::RestoreService,
        snapshots::SnapshotService, timer::TimerService,
    },
};
use std::sync::Arc;
#[test]
fn replacement_is_atomic_and_invalidates_old_context() {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 10000);
    let entries = EntryService::new(TimerService::new(db.clone(), clock.clone()));
    let a = entries
        .save(
            ctx(&db, None),
            EntryDetail::manual(
                "A".into(),
                vec![WorkSegment::closed("", MIN_TIME, MIN_TIME + 100)],
            ),
        )
        .unwrap()
        .value;
    let backup = db.read(capture).unwrap();
    entries.delete(ctx(&db, Some(&a)), &a.id).unwrap();
    let service = RestoreService::new(
        db.clone(),
        clock,
        SnapshotService::new(db.clone(), dir.path().into()),
    );
    let preview = service.stage(backup).unwrap();
    let old = ctx(&db, None);
    let first = service.apply(old.clone(), &preview.token, true).unwrap();
    let repeated = service.apply(old.clone(), &preview.token, true).unwrap();
    assert_eq!(first, repeated);
    assert!(db.read(records::all).unwrap()[0].deleted_at.is_none());
    assert_ne!(old.workspace_revision, db.revision().unwrap());
    assert_eq!(service.snapshots.list().unwrap().len(), 1);
}
#[test]
fn failed_insert_rolls_back_replacement() {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 10000);
    let entries = EntryService::new(TimerService::new(db.clone(), clock.clone()));
    let a = entries
        .save(
            ctx(&db, None),
            EntryDetail::manual(
                "A".into(),
                vec![WorkSegment::closed("", MIN_TIME, MIN_TIME + 100)],
            ),
        )
        .unwrap()
        .value;
    let mut backup = db.read(capture).unwrap();
    backup.work_entries[0].title = "fail".into();
    db.read(|c|{c.execute_batch("CREATE TRIGGER reject_fail BEFORE INSERT ON work_entries WHEN NEW.title='fail' BEGIN SELECT RAISE(ABORT,'injected'); END;")?;Ok(())}).unwrap();
    let service = RestoreService::new(
        db.clone(),
        clock,
        SnapshotService::new(db.clone(), dir.path().into()),
    );
    let preview = service.stage(backup).unwrap();
    assert!(service.apply(ctx(&db, None), &preview.token, true).is_err());
    assert_eq!(db.read(records::all).unwrap()[0], a);
}
