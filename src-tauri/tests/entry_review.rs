mod common;
use common::*;
use std::sync::Arc;
use timefolio::{
    db::Database,
    domain::*,
    services::{entries::EntryService, timer::TimerService},
};

#[test]
fn correcting_a_conflict_checks_other_records_and_ignores_trash() {
    let db = Arc::new(Database::open_memory().unwrap());
    let base = at("2026-10-03T00:00:00+08:00");
    let clock = TestClock::at(base + 4 * 3600000);
    let svc = EntryService::new(TimerService::new(db.clone(), clock));
    let a = svc
        .save(
            ctx(&db, None),
            EntryDetail::manual(
                "A".into(),
                vec![WorkSegment::closed("", base, base + 3600000)],
            ),
        )
        .unwrap()
        .value;
    let other = svc
        .save(
            ctx(&db, None),
            EntryDetail::manual(
                "task1-test".into(),
                vec![WorkSegment::closed("", base + 5278819, base + 5342000)],
            ),
        )
        .unwrap()
        .value;
    let mut b = EntryDetail::manual(
        "B".into(),
        vec![WorkSegment::closed("", base + 180000, base + 3780000)],
    );
    let first = svc.save(ctx(&db, None), b.clone()).unwrap_err();
    assert_eq!(first.details["entryId"], a.id);
    b.segments[0].start_at = base + 3600000;
    b.segments[0].end_at = Some(base + 7200000);
    let next = svc.save(ctx(&db, None), b.clone()).unwrap_err();
    assert_eq!(next.details["entryId"], other.id);
    assert_eq!(next.details["startAt"], base + 5278819);
    svc.delete(ctx(&db, Some(&other)), &other.id).unwrap();
    let saved = svc.save(ctx(&db, None), b).unwrap().value;
    assert_eq!(saved.duration(), 3600000);
    assert_eq!(
        svc.list()
            .unwrap()
            .iter()
            .filter(|e| e.deleted_at.is_none())
            .count(),
        2
    );
}

#[test]
fn conflict_details_identify_the_exact_period_among_same_named_entries() {
    let db = Arc::new(Database::open_memory().unwrap());
    let clock = TestClock::at(MIN_TIME + 10000);
    let svc = EntryService::new(TimerService::new(db.clone(), clock));
    let other = EntryDetail::manual(
        "同名任务".into(),
        vec![WorkSegment::closed("", MIN_TIME + 4000, MIN_TIME + 6000)],
    );
    let other = svc.save(ctx(&db, None), other).unwrap().value;
    let draft = EntryDetail::manual(
        "同名任务".into(),
        vec![
            WorkSegment::closed("", MIN_TIME, MIN_TIME + 1000),
            WorkSegment::closed("", MIN_TIME + 5000, MIN_TIME + 7000),
        ],
    );
    let period_id = draft.segments[1].id.clone();
    let error = svc.save(ctx(&db, None), draft).unwrap_err();
    assert_eq!(error.code, "OVERLAP");
    assert_eq!(error.details["segmentId"], period_id);
    assert_eq!(error.details["entryId"], other.id);
    assert_eq!(error.details["title"], "同名任务");
    assert_eq!(error.details["startAt"], MIN_TIME + 4000);
    assert_eq!(error.details["endAt"], MIN_TIME + 6000);
}

#[test]
fn internal_overlap_identifies_both_draft_periods() {
    let draft = EntryDetail::manual(
        "开发".into(),
        vec![
            WorkSegment::closed("", MIN_TIME, MIN_TIME + 3000),
            WorkSegment::closed("", MIN_TIME + 2000, MIN_TIME + 4000),
        ],
    );
    let error = validation::validate_entry(&draft, MIN_TIME + 10000).unwrap_err();
    assert_eq!(error.details["segmentId"], draft.segments[0].id);
    assert_eq!(error.details["conflictingSegmentId"], draft.segments[1].id);
    assert_eq!(error.details["entryId"], draft.id);
}
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
