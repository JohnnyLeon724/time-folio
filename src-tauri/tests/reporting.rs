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
