use hourtrail::{
    domain::*,
    services::{csv, reports::report},
};
#[test]
fn csv_escapes_text_and_preserves_exact_duration() {
    let t = chrono::DateTime::parse_from_rfc3339("2026-09-29T00:00:00Z")
        .unwrap()
        .timestamp_millis();
    let mut e = EntryDetail::manual(
        "=SUM(1,2)".into(),
        vec![WorkSegment::closed("", t, t + 3600001)],
    );
    e.note = Some("两行\n\"注释\"".into());
    let bytes = csv::bytes(&report(&[e], "2026-09", "Etc/UTC").unwrap()).unwrap();
    assert!(bytes.starts_with(&[0xef, 0xbb, 0xbf]));
    let s = String::from_utf8(bytes).unwrap();
    assert!(s.contains("'=SUM(1,2)"));
    assert!(s.contains("3600001,1.000000"));
    assert!(s.contains("\r\n"));
}
