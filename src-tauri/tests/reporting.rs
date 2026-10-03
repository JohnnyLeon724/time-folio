mod common;
use common::*;
use timefolio::{domain::*, services::reports::*};
fn entry(a: &str, b: &str) -> EntryDetail {
    EntryDetail::manual("work".into(), vec![WorkSegment::closed("", at(a), at(b))])
}
#[test]
fn month_split_and_review_excluded() {
    let mut e = entry("2026-09-30T23:30:00+08:00", "2026-10-01T00:30:00+08:00");
    assert_eq!(
        report(&[e.clone()], "2026-09", "Asia/Shanghai")
            .unwrap()
            .duration_ms,
        1_800_000
    );
    assert_eq!(
        report(&[e.clone()], "2026-10", "Asia/Shanghai")
            .unwrap()
            .duration_ms,
        1_800_000
    );
    e.status = Status::NeedsReview;
    assert_eq!(
        report(&[e], "2026-09", "Asia/Shanghai")
            .unwrap()
            .duration_ms,
        0
    );
}
#[test]
fn dst_elapsed_time_and_input() {
    let e = entry("2026-03-08T01:30:00-05:00", "2026-03-08T03:30:00-04:00");
    assert_eq!(
        report(&[e], "2026-03", "America/New_York")
            .unwrap()
            .duration_ms,
        3_600_000
    );
    assert!(parse_local("2026-03-08T02:30", "America/New_York", None).is_err());
    assert!(parse_local("2026-11-01T01:30", "America/New_York", None).is_err());
    let early = parse_local("2026-11-01T01:30", "America/New_York", Some(-14400)).unwrap();
    let late = parse_local("2026-11-01T01:30", "America/New_York", Some(-18000)).unwrap();
    assert_eq!(late - early, 3_600_000);
}

#[test]
fn weekly_report_keeps_complete_cross_month_week() {
    let e = entry("2026-09-30T23:30:00+08:00", "2026-10-01T00:30:00+08:00");
    let r = week_report(&[e], "2026-10-01", "Asia/Shanghai", 1).unwrap();
    assert_eq!(r.week_start, "2026-09-28");
    assert_eq!(r.week_end, "2026-10-04");
    assert_eq!(r.days.len(), 7);
    assert_eq!(r.duration_ms, 3_600_000);
    assert_eq!(r.rows.len(), 2);
    assert_eq!(
        r.rows.iter().map(|r| r.duration_ms).sum::<i64>(),
        r.duration_ms
    );
}
#[test]
fn weekly_boundaries_do_not_double_count_and_respect_start_day() {
    let e = entry("2026-10-04T23:30:00+08:00", "2026-10-05T00:30:00+08:00");
    for date in ["2026-10-04", "2026-10-05"] {
        assert_eq!(
            week_report(std::slice::from_ref(&e), date, "Asia/Shanghai", 1)
                .unwrap()
                .duration_ms,
            1_800_000
        );
    }
    let sunday = week_report(&[e], "2026-10-04", "Asia/Shanghai", 0).unwrap();
    assert_eq!(sunday.week_start, "2026-10-04");
    assert_eq!(sunday.duration_ms, 3_600_000);
    let year = week_report(&[], "2027-01-01", "Etc/UTC", 1).unwrap();
    assert_eq!(year.week_start, "2026-12-28");
    assert_eq!(year.week_end, "2027-01-03");
}
#[test]
fn weekly_report_handles_dst_and_excludes_unconfirmed_and_deleted() {
    for (start, end, hours) in [
        ("2026-03-08T00:00:00-05:00", "2026-03-09T00:00:00-04:00", 23),
        ("2026-11-01T00:00:00-04:00", "2026-11-02T00:00:00-05:00", 25),
    ] {
        let e = entry(start, end);
        let mut pending = e.clone();
        pending.status = Status::NeedsReview;
        let mut active = e.clone();
        active.status = Status::Paused;
        let mut deleted = e.clone();
        deleted.deleted_at = Some(at(end));
        let r = week_report(
            &[e, pending, active, deleted],
            &start[..10],
            "America/New_York",
            0,
        )
        .unwrap();
        assert_eq!(r.duration_ms, hours * 3_600_000);
        assert_eq!(r.pending_count, 1);
        assert_eq!(r.active_count, 1);
    }
    assert!(week_report(&[], "invalid", "Etc/UTC", 1).is_err());
    assert!(week_report(&[], "2026-10-01", "Etc/UTC", 7).is_err());
    assert!(week_report(&[], "9999-10-01", "Etc/UTC", 1).is_err());
}
