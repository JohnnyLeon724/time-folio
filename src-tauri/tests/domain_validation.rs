use timefolio::domain::*;
fn entry() -> EntryDetail {
    EntryDetail::manual(
        "开发登录页".into(),
        vec![WorkSegment::closed("", MIN_TIME + 1000, MIN_TIME + 2000)],
    )
}
#[test]
fn adjacent_intervals_are_valid() {
    assert!(!overlaps((0, 10), (10, 20)));
    assert!(overlaps((0, 11), (10, 20)));
}
#[test]
fn title_counts_unicode_codepoints() {
    let mut e = entry();
    e.title = "😀".repeat(200);
    assert!(validate_entry(&e, MAX_TIME - 1).is_ok());
    e.title.push('😀');
    assert!(validate_entry(&e, MAX_TIME - 1).is_err());
}
#[test]
fn invalid_intervals_and_states_rejected() {
    let mut e = entry();
    e.segments[0].end_at = Some(e.segments[0].start_at);
    assert!(validate_entry(&e, MAX_TIME - 1).is_err());
    e.segments.clear();
    assert!(validate_entry(&e, MAX_TIME - 1).is_err());
    e.status = Status::NeedsReview;
    assert!(validate_entry(&e, MAX_TIME - 1).is_ok());
}
#[test]
fn bounds_and_future_end_rejected() {
    let mut e = entry();
    assert!(validate_entry(&e, MIN_TIME).is_err());
    e.segments[0].start_at = MIN_TIME - 1;
    assert!(validate_entry(&e, MAX_TIME - 1).is_err());
}
