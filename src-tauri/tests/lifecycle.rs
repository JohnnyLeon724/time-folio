mod common;
use common::*;
use hourtrail::{
    db::Database, domain::*, platform::lifecycle::LifecycleService, services::timer::TimerService,
};
use std::sync::Arc;
#[test]
fn quit_guard_and_cancel() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 100);
    let timer = TimerService::new(db.clone(), clock.clone());
    let life = LifecycleService::new(timer.clone());
    assert!(!life.can_hide(false));
    assert!(life.can_hide(true));
    let e = timer.start(ctx(&db, None), "A".into(), None).unwrap().value;
    assert!(life.request_quit().unwrap());
    assert!(timer.start(ctx(&db, None), "B".into(), None).is_err());
    clock.set(MIN_TIME + 1000);
    life.quit_pending().unwrap();
    assert!(timer.state().unwrap().active_entry.is_none());
    life.cancel_quit();
    assert!(timer.start(ctx(&db, None), "B".into(), None).is_ok());
    assert_eq!(e.status, Status::Running);
}
