mod common;
use common::*;
use hourtrail::{
    db::Database,
    domain::*,
    services::{recovery::RecoveryService, timer::TimerService},
};
use std::sync::Arc;
#[test]
fn sleep_wake_is_review_not_auto_resume() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 100);
    let timer = TimerService::new(db.clone(), clock.clone());
    timer.start(ctx(&db, None), "A".into(), None).unwrap();
    let recovery = RecoveryService::new(timer.clone());
    clock.set(MIN_TIME + 1000);
    recovery.suspend().unwrap();
    recovery.suspend().unwrap();
    clock.set(MIN_TIME + 2000);
    recovery.resume().unwrap();
    recovery.resume().unwrap();
    assert!(timer.state().unwrap().active_entry.is_none());
    let e = db.read(hourtrail::db::records::all).unwrap().remove(0);
    assert_eq!(e.status, Status::NeedsReview);
    assert_eq!(e.review_items.len(), 1);
    assert_eq!(e.review_items[0].candidate_end_at, Some(MIN_TIME + 2000));
    assert_eq!(e.duration(), 900);
}
#[test]
fn crash_closes_at_checkpoint_not_restart() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 100);
    let timer = TimerService::new(db.clone(), clock.clone());
    timer.start(ctx(&db, None), "A".into(), None).unwrap();
    let recovery = RecoveryService::new(timer.clone());
    clock.set(MIN_TIME + 15100);
    recovery.checkpoint().unwrap();
    clock.set(MIN_TIME + 86400000);
    recovery.recover_on_startup().unwrap();
    let e = db.read(hourtrail::db::records::all).unwrap().remove(0);
    assert_eq!(e.duration(), 15000);
    assert_eq!(e.review_items[0].reason, "recovery");
    assert_eq!(
        e.review_items[0].candidate_end_at,
        Some(MIN_TIME + 86400000)
    );
}
#[test]
fn backward_clock_creates_review_without_negative_segments() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 10000);
    let timer = TimerService::new(db.clone(), clock.clone());
    timer.start(ctx(&db, None), "A".into(), None).unwrap();
    let recovery = RecoveryService::new(timer);
    clock.set(MIN_TIME + 1000);
    recovery.recover_on_startup().unwrap();
    let e = db.read(hourtrail::db::records::all).unwrap().remove(0);
    assert!(e.segments.is_empty());
    assert!(e.review_items[0].candidate_end_at < e.review_items[0].candidate_start_at);
}
#[test]
fn imported_open_sleep_is_not_extended_on_startup() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 86400000);
    let timer = TimerService::new(db.clone(), clock);
    let mut e = EntryDetail::manual("迁移记录".into(), vec![]);
    e.status = Status::NeedsReview;
    e.review_items.push(ReviewItem {
        id: id(),
        entry_id: e.id.clone(),
        reason: "sleep".into(),
        candidate_start_at: Some(MIN_TIME + 100),
        candidate_end_at: None,
        boundary_quality: "observed".into(),
        resolution: "unresolved".into(),
        resolved_at: None,
    });
    db.internal(|tx| hourtrail::db::records::put(tx, &e))
        .unwrap();
    RecoveryService::new(timer).recover_on_startup().unwrap();
    assert_eq!(db.read(hourtrail::db::records::all).unwrap()[0], e);
}
#[test]
fn pause_cannot_hide_a_clock_jump() {
    use hourtrail::platform::clock::Clock;
    use std::sync::atomic::{AtomicI64, Ordering};
    use std::time::Duration;
    struct JumpClock(AtomicI64);
    impl Clock for JumpClock {
        fn utc_now(&self) -> i64 {
            self.0.load(Ordering::SeqCst)
        }
        fn monotonic_now(&self) -> Duration {
            Duration::from_secs(0)
        }
    }
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = Arc::new(JumpClock(AtomicI64::new(MIN_TIME + 10000)));
    let timer = TimerService::new(db.clone(), clock.clone());
    let e = timer
        .start(ctx(&db, None), "跳时钟".into(), None)
        .unwrap()
        .value;
    clock.0.store(MIN_TIME + 15000, Ordering::SeqCst);
    assert_eq!(
        timer.pause(ctx(&db, Some(&e)), &e.id).unwrap_err().code,
        "CLOCK_UNCERTAIN"
    );
    let e = db.read(hourtrail::db::records::all).unwrap().remove(0);
    assert_eq!(e.status, Status::NeedsReview);
    assert_eq!(e.duration(), 0);
    assert_eq!(e.review_items[0].reason, "clock_change");
}
