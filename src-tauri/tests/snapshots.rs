use std::sync::Arc;
use timefolio::{db::Database, services::snapshots::SnapshotService};

#[test]
fn automatic_snapshots_throttle_rotate_and_keep_safety_copies() {
    use timefolio::{db::records, domain::*, services::recovery::bump};
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open_memory().unwrap());
    let svc = SnapshotService::new(db.clone(), dir.path().into());
    let entry = EntryDetail::manual(
        "test".into(),
        vec![WorkSegment::closed("", MIN_TIME, MIN_TIME + 1000)],
    );
    db.internal(|tx| {
        records::put(tx, &entry)?;
        bump(tx)
    })
    .unwrap();
    let safety = svc.create("pre-restore").unwrap();
    let now = MIN_TIME + 100000;
    assert!(svc.automatic(now).unwrap().is_some());
    db.internal(|tx| bump(tx)).unwrap();
    assert!(svc.automatic(now + 3599999).unwrap().is_none());
    for i in 1..=8 {
        db.internal(|tx| bump(tx)).unwrap();
        assert!(svc.automatic(now + i * 3600000).unwrap().is_some());
    }
    let list = svc.list().unwrap();
    assert_eq!(list.iter().filter(|s| s.kind == "automatic").count(), 7);
    assert!(list.iter().any(|s| s.id == safety.id));
    assert!(svc.automatic(now + 10 * 3600000).unwrap().is_none());
}

#[test]
fn failed_snapshot_verification_keeps_existing_snapshot_files() {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open_memory().unwrap());
    let svc = SnapshotService::new(db.clone(), dir.path().into());
    let existing = svc.create("automatic").unwrap();
    let original = std::fs::read(&existing.path).unwrap();
    db.read(|connection| {
        connection.execute_batch("PRAGMA foreign_keys=OFF; CREATE TABLE broken_parent(id INTEGER PRIMARY KEY); CREATE TABLE broken_child(parent_id INTEGER REFERENCES broken_parent(id)); INSERT INTO broken_child VALUES(99); PRAGMA foreign_keys=ON;")?;
        Ok(())
    }).unwrap();
    assert!(svc.create("automatic").is_err());
    assert_eq!(svc.list().unwrap().len(), 1);
    assert_eq!(std::fs::read(&existing.path).unwrap(), original);
    assert!(svc.extract(&existing.id).is_ok());
}
#[test]
fn snapshot_is_verified_and_safe_path_only() {
    let dir = tempfile::tempdir().unwrap();
    let svc = SnapshotService::new(
        Arc::new(Database::open_memory().unwrap()),
        dir.path().into(),
    );
    let snap = svc.create("pre-restore").unwrap();
    assert_eq!(svc.list().unwrap().len(), 1);
    assert!(svc.path("../escape.db").is_err());
    assert!(svc.extract(&snap.id).is_ok());
    svc.delete(&snap.id).unwrap();
    assert!(svc.list().unwrap().is_empty());
}
