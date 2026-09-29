mod common;
use common::*;
use hourtrail::{
    db::Database,
    domain::*,
    services::{entries::EntryService, timer::TimerService},
};
use std::sync::Arc;
#[test]
fn review_completion_and_conflict_restore() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 10000);
    let svc = EntryService::new(TimerService::new(db.clone(), clock));
    let a = EntryDetail::manual(
        "A".into(),
        vec![WorkSegment::closed("", MIN_TIME, MIN_TIME + 1000)],
    );
    let a = svc.save(ctx(&db, None), a).unwrap().value;
    let a = svc.delete(ctx(&db, Some(&a)), &a.id).unwrap().value;
    let b = EntryDetail::manual(
        "B".into(),
        vec![WorkSegment::closed("", MIN_TIME, MIN_TIME + 1000)],
    );
    svc.save(ctx(&db, None), b).unwrap();
    assert!(svc.restore(ctx(&db, Some(&a)), &a.id, false).is_err());
    let restored = svc.restore(ctx(&db, Some(&a)), &a.id, true).unwrap().value;
    assert_eq!(restored.status, Status::NeedsReview);
    assert!(svc
        .resolve(ctx(&db, Some(&restored)), restored, false)
        .is_err());
}
#[test]
fn closing_review_keeps_durable_entry() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 100);
    let timer = TimerService::new(db.clone(), clock.clone());
    let e = timer
        .start(ctx(&db, None), "test".into(), None)
        .unwrap()
        .value;
    clock.set(MIN_TIME + 1000);
    let e = timer.stop(ctx(&db, Some(&e)), &e.id).unwrap().value;
    let svc = EntryService::new(timer);
    let e = svc.resolve(ctx(&db, Some(&e)), e, false).unwrap().value;
    assert_eq!(e.status, Status::Completed);
    assert_eq!(e.duration(), 900);
}
