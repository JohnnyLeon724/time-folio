mod common;
use common::*;
use hourtrail::{
    db::Database,
    domain::*,
    services::{settings::SettingsService, timer::TimerService},
};
use std::sync::Arc;
#[test]
fn settings_require_fresh_preview_and_no_active_timer() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 1000);
    let svc = SettingsService::new(db.clone(), clock.clone());
    let preview = svc.preview("Asia/Shanghai").unwrap();
    let c = ctx(&db, None);
    let timer = TimerService::new(db.clone(), clock);
    timer.start(ctx(&db, None), "task".into(), None).unwrap();
    assert!(svc.apply(c, &preview.token).is_err());
    assert!(svc.preview("Etc/UTC").is_err());
    assert_eq!(db.settings().unwrap().reporting_time_zone, "Etc/UTC");
}
