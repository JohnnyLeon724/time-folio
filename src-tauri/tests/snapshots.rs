use hourtrail::{db::Database, services::snapshots::SnapshotService};
use std::sync::Arc;
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
