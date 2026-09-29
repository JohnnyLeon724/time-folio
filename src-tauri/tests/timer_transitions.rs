mod common;
use common::*;
use hourtrail::{db::Database, domain::*, services::timer::TimerService};
use std::sync::Arc;
#[test]
fn full_workday_excludes_lunch_and_stop_releases_slot() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(at("2026-09-29T09:00:00+08:00"));
    let svc = TimerService::new(db.clone(), clock.clone());
    let e = svc
        .start(ctx(&db, None), "登录页".into(), None)
        .unwrap()
        .value;
    advance(&svc, &clock, at("2026-09-29T12:00:00+08:00"));
    let e = svc.pause(ctx(&db, Some(&e)), &e.id).unwrap().value;
    assert!(svc.start(ctx(&db, None), "另一个".into(), None).is_err());
    clock.set(at("2026-09-29T13:30:00+08:00"));
    let e = svc.resume(ctx(&db, Some(&e)), &e.id).unwrap().value;
    advance(&svc, &clock, at("2026-09-29T18:00:00+08:00"));
    let e = svc.stop(ctx(&db, Some(&e)), &e.id).unwrap().value;
    assert_eq!(e.duration(), 27_000_000);
    assert_eq!(e.status, Status::NeedsReview);
    assert_eq!(e.segments.len(), 2);
    assert!(svc.state().unwrap().active_entry.is_none());
}
#[test]
fn repeated_request_does_not_start_twice() {
    let db = Arc::new(Database::open_memory().unwrap());
    let svc = TimerService::new(db.clone(), TestClock::at(MIN_TIME + 100));
    let c = ctx(&db, None);
    let first = svc.start(c.clone(), "任务".into(), None).unwrap();
    let second = svc.start(c, "任务".into(), None).unwrap();
    assert_eq!(first, second);
}
#[test]
fn instant_stop_leaves_review_without_zero_interval() {
    let db = Arc::new(Database::open_memory().unwrap());
    let svc = TimerService::new(db.clone(), TestClock::at(MIN_TIME + 100));
    let e = svc
        .start(ctx(&db, None), "任务".into(), None)
        .unwrap()
        .value;
    let e = svc.stop(ctx(&db, Some(&e)), &e.id).unwrap().value;
    assert!(e.segments.is_empty());
    assert_eq!(e.status, Status::NeedsReview);
}

fn advance(timer: &TimerService, clock: &TestClock, until: i64) {
    use hourtrail::platform::clock::Clock;
    let recovery = hourtrail::services::recovery::RecoveryService::new(timer.clone());
    while clock.utc_now() < until {
        clock.set((clock.utc_now() + 15000).min(until));
        recovery.checkpoint().unwrap();
    }
}
