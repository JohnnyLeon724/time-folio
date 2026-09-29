use hourtrail::{db::Database, domain::*};
use rusqlite::params;
fn ctx(db: &Database) -> MutationContext {
    MutationContext {
        request_id: id(),
        workspace_revision: db.revision().unwrap(),
        expected_entry_version: None,
    }
}
#[test]
fn receipt_retries_and_stale_revisions() {
    let db = Database::open_memory().unwrap();
    let c = ctx(&db);
    let first = db
        .mutate(c.clone(), "x", 1_800_000_000_000, |_| Ok(42))
        .unwrap();
    let retry = db
        .mutate(c.clone(), "x", 1_800_000_000_000, |_| Ok(99))
        .unwrap();
    assert_eq!(first, retry);
    assert!(db
        .mutate(c.clone(), "y", 1_800_000_000_000, |_| Ok(99))
        .is_err());
    let stale = MutationContext {
        request_id: id(),
        ..c
    };
    assert!(db
        .mutate(stale, "x", 1_800_000_000_000, |_| Ok(99))
        .is_err());
}
#[test]
fn rollback_preserves_revision() {
    let db = Database::open_memory().unwrap();
    let c = ctx(&db);
    let old = db.revision().unwrap();
    let result: Result<MutationResult<()>> = db.mutate(c, "x", 1_800_000_000_000, |tx| {
        tx.execute("INSERT INTO device_settings(key,value) VALUES('x','y')", [])?;
        Err(AppError::new("TEST", "rollback"))
    });
    assert!(result.is_err());
    assert_eq!(old, db.revision().unwrap());
    assert_eq!(
        db.read(|c| Ok(
            c.query_row("SELECT count(*) FROM device_settings", [], |r| r
                .get::<_, i64>(0))?
        ))
        .unwrap(),
        0
    );
}
#[test]
fn active_constraint_is_in_database() {
    let db = Database::open_memory().unwrap();
    db.read(|c|{c.execute("INSERT INTO work_entries(id,title,source,status,version,created_at,updated_at) VALUES(?1,'x','timer','paused',1,?2,?2)",params![id(),MIN_TIME])?;assert!(c.execute("INSERT INTO work_entries(id,title,source,status,version,created_at,updated_at) VALUES(?1,'x','timer','running',1,?2,?2)",params![id(),MIN_TIME]).is_err());Ok(())}).unwrap();
}
