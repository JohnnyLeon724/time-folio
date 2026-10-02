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
    assert!(s.contains("日期,任务,开始时间,结束时间,时长\r\n"));
    assert!(s.contains("01:00:00.001"));
    assert!(s.contains("2026-09-29 00:00:00,2026-09-29 01:00:00.001"));
    assert!(s.contains("\r\n"));
}

#[test]
fn csv_keeps_separate_periods_and_splits_midnight() {
    let t = chrono::DateTime::parse_from_rfc3339("2026-09-29T09:00:00+08:00")
        .unwrap()
        .timestamp_millis();
    let e = EntryDetail::manual(
        "开发".into(),
        vec![
            WorkSegment::closed("", t, t + 3 * 3600000),
            WorkSegment::closed("", t + 5 * 3600000, t + 7 * 3600000),
            WorkSegment::closed("", t + 14 * 3600000, t + 16 * 3600000),
        ],
    );
    let bytes = csv::bytes(&report(&[e], "2026-09", "Asia/Shanghai").unwrap()).unwrap();
    let mut reader = ::csv::Reader::from_reader(&bytes[3..]);
    assert_eq!(reader.headers().unwrap().len(), 5);
    let rows: Vec<_> = reader.records().map(|r| r.unwrap()).collect();
    assert_eq!(rows.len(), 4);
    assert_eq!(&rows[0][2], "2026-09-29 09:00:00");
    assert_eq!(&rows[0][3], "2026-09-29 12:00:00");
    assert_eq!(&rows[2][3], "2026-09-30 00:00:00");
    assert_eq!(&rows[3][2], "2026-09-30 00:00:00");
    assert_eq!(&rows[0][4], "03:00:00");
    assert_eq!(&rows[1][4], "02:00:00");
    assert_eq!(&rows[2][0], "2026-09-29");
    assert_eq!(&rows[3][0], "2026-09-30");
    assert_eq!(&rows[3][4], "01:00:00");
}
