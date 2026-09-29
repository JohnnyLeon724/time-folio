mod common;
use common::*;
use hourtrail::{
    db::Database,
    domain::*,
    services::{backup::*, entries::EntryService, timer::TimerService},
};
use std::sync::Arc;
#[test]
fn portable_roundtrip_preserves_unicode_and_ids() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 10000);
    let entries = EntryService::new(TimerService::new(db.clone(), clock));
    let mut e = EntryDetail::manual(
        "开发 😀".into(),
        vec![WorkSegment::closed("", MIN_TIME, MIN_TIME + 1000)],
    );
    e.note = Some("一行\n另一行".into());
    let e = entries.save(ctx(&db, None), e).unwrap().value;
    let backup = db.read(capture).unwrap();
    let bytes = serde_json::to_vec(&backup).unwrap();
    let decoded = parse(&bytes, MIN_TIME + 10000).unwrap();
    let restored = decoded.entries().unwrap();
    assert_eq!(restored[0].id, e.id);
    assert_eq!(restored[0].note, e.note);
    assert_eq!(restored[0].segments, e.segments);
    assert!(!String::from_utf8(bytes).unwrap().contains("timerRuntime"));
}
#[test]
fn reject_duplicate_json_keys() {
    assert!(parse(
        br#"{"format":"hourtrail-backup","format":"other"}"#,
        MAX_TIME - 1
    )
    .is_err());
}
#[test]
fn active_timer_cannot_export() {
    let db = Arc::new(Database::open_memory().unwrap());
    let timer = TimerService::new(db.clone(), TestClock::at(MIN_TIME + 100));
    timer.start(ctx(&db, None), "A".into(), None).unwrap();
    assert!(db.read(capture).is_err());
}
#[test]
fn failed_publish_never_overwrites_existing_file() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("backup.json");
    std::fs::write(&file, b"older backup").unwrap();
    assert!(atomic_write(&file, b"new").is_err());
    assert_eq!(std::fs::read(file).unwrap(), b"older backup");
}
#[test]
fn sample_files_match_contract() {
    parse(
        include_bytes!("../../tests/fixtures/valid-backup-v1.hourtrail.json"),
        MAX_TIME - 1,
    )
    .unwrap();
    assert!(parse(
        include_bytes!("../../tests/fixtures/invalid-backup-v1.hourtrail.json"),
        MAX_TIME - 1
    )
    .is_err());
}
