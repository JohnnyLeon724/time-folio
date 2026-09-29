use crate::{
    domain::*,
    services::{
        backup::atomic_write,
        reports::{zone, MonthReport},
    },
};
use chrono::{SecondsFormat, TimeZone};
use std::path::Path;
fn cell(s: &str) -> String {
    let t = s.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    if t.starts_with(['=', '+', '-', '@']) || s.starts_with(['\t', '\r', '\n']) {
        format!("'{s}")
    } else {
        s.into()
    }
}
pub fn bytes(report: &MonthReport) -> Result<Vec<u8>> {
    let mut writer = csv::WriterBuilder::new()
        .terminator(csv::Terminator::CRLF)
        .from_writer(Vec::new());
    let err = |e: csv::Error| AppError::new("IO_ERROR", e.to_string());
    writer
        .write_record([
            "workDate",
            "taskTitle",
            "startAt",
            "endAt",
            "reportingTimeZone",
            "durationMs",
            "decimalHours",
            "note",
        ])
        .map_err(err)?;
    let tz = zone(&report.reporting_time_zone)?;
    for r in &report.rows {
        writer
            .write_record([
                r.work_date.clone(),
                cell(&r.title),
                tz.timestamp_millis_opt(r.start_at)
                    .single()
                    .unwrap()
                    .to_rfc3339_opts(SecondsFormat::Millis, false),
                tz.timestamp_millis_opt(r.end_at)
                    .single()
                    .unwrap()
                    .to_rfc3339_opts(SecondsFormat::Millis, false),
                report.reporting_time_zone.clone(),
                r.duration_ms.to_string(),
                format!("{:.6}", r.duration_ms as f64 / 3600000.0),
                cell(r.note.as_deref().unwrap_or("")),
            ])
            .map_err(err)?;
    }
    let mut result = vec![0xef, 0xbb, 0xbf];
    result.extend(
        writer
            .into_inner()
            .map_err(|e| AppError::new("IO_ERROR", e.to_string()))?,
    );
    Ok(result)
}
pub fn export(report: &MonthReport, path: &Path) -> Result<()> {
    atomic_write(path, &bytes(report)?)
}
