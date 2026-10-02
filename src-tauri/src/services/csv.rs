use crate::{
    domain::*,
    services::{
        backup::atomic_write,
        reports::{zone, MonthReport},
    },
};
use chrono::TimeZone;
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
        .write_record(["日期", "任务", "开始时间", "结束时间", "时长"])
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
                    .format("%Y-%m-%d %H:%M:%S%.f")
                    .to_string(),
                tz.timestamp_millis_opt(r.end_at)
                    .single()
                    .unwrap()
                    .format("%Y-%m-%d %H:%M:%S%.f")
                    .to_string(),
                elapsed(r.duration_ms),
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
fn elapsed(ms: i64) -> String {
    let seconds = ms / 1000;
    let base = format!(
        "{:02}:{:02}:{:02}",
        seconds / 3600,
        seconds / 60 % 60,
        seconds % 60
    );
    if ms % 1000 == 0 {
        base
    } else {
        format!("{base}.{:03}", ms % 1000)
    }
}
pub fn export(report: &MonthReport, path: &Path) -> Result<()> {
    atomic_write(path, &bytes(report)?)
}
