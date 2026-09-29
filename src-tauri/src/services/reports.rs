use crate::domain::*;
use chrono::{
    DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveDateTime, Offset, TimeZone, Utc,
};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayReport {
    pub date: String,
    pub duration_ms: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRow {
    pub work_date: String,
    pub entry_id: String,
    pub title: String,
    pub start_at: i64,
    pub end_at: i64,
    pub duration_ms: i64,
    pub note: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthReport {
    pub month: String,
    pub reporting_time_zone: String,
    pub duration_ms: i64,
    pub worked_day_count: usize,
    pub days: Vec<DayReport>,
    pub rows: Vec<ReportRow>,
    pub pending_count: usize,
    pub active_count: usize,
}
pub fn zone(input: &str) -> Result<Tz> {
    input
        .parse()
        .map_err(|_| AppError::new("VALIDATION", "无法识别统计时区"))
}
pub fn parse_local(input: &str, tz: &str, offset: Option<i32>) -> Result<i64> {
    let tz = zone(tz)?;
    let local = NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M"))
        .map_err(|_| AppError::new("VALIDATION", "日期时间格式无效"))?;
    match tz.from_local_datetime(&local) {
        LocalResult::Single(t) => Ok(t.timestamp_millis()),
        LocalResult::None => Err(AppError::new(
            "VALIDATION",
            "夏令时变化使这个当地时间不存在，请重新选择",
        )),
        LocalResult::Ambiguous(a, b) => {
            if let Some(o) = offset {
                if a.offset().fix().local_minus_utc() == o {
                    return Ok(a.timestamp_millis());
                }
                if b.offset().fix().local_minus_utc() == o {
                    return Ok(b.timestamp_millis());
                }
            }
            let mut error = AppError::new("AMBIGUOUS_TIME", "该时间出现两次，请选择 UTC 偏移");
            error.details = serde_json::json!({"offsets":[a.offset().fix().local_minus_utc(),b.offset().fix().local_minus_utc()]});
            Err(error)
        }
    }
}
fn boundary(date: NaiveDate, tz: Tz) -> Result<i64> {
    let midnight = date.and_hms_opt(0, 0, 0).unwrap();
    for m in 0..=2880 {
        if let Some(t) = tz
            .from_local_datetime(&(midnight + Duration::minutes(m)))
            .earliest()
        {
            return Ok(t.timestamp_millis());
        }
    }
    Err(AppError::new("VALIDATION", "无法解析当地日期边界"))
}
pub fn report(entries: &[EntryDetail], month: &str, time_zone: &str) -> Result<MonthReport> {
    let tz = zone(time_zone)?;
    if month.len() != 7 {
        return Err(AppError::new("VALIDATION", "月份格式须为 YYYY-MM"));
    }
    let first = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| AppError::new("VALIDATION", "月份无效"))?;
    if !(1999..=2100).contains(&first.year()) {
        return Err(AppError::new("VALIDATION", "月份超出支持范围"));
    }
    let next = if first.month() == 12 {
        NaiveDate::from_ymd_opt(first.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(first.year(), first.month() + 1, 1)
    }
    .unwrap();
    let start = boundary(first, tz)?;
    let end = boundary(next, tz)?;
    let mut days = BTreeMap::new();
    let mut date = first;
    while date < next {
        days.insert(date.to_string(), 0i64);
        date = date.succ_opt().unwrap();
    }
    let mut rows = vec![];
    let mut pending_count = 0;
    let mut active_count = 0;
    for e in entries.iter().filter(|e| e.deleted_at.is_none()) {
        let intersects = e
            .segments
            .iter()
            .any(|s| overlaps((s.start_at, s.end_at.unwrap_or(i64::MAX)), (start, end)))
            || (e.segments.is_empty() && e.updated_at >= start && e.updated_at < end);
        if e.status == Status::NeedsReview {
            if intersects {
                pending_count += 1;
            }
            continue;
        }
        if e.status.active() {
            if intersects {
                active_count += 1;
            }
            continue;
        }
        for s in &e.segments {
            let Some(s_end) = s.end_at else { continue };
            let mut cursor = s.start_at.max(start);
            let limit = s_end.min(end);
            while cursor < limit {
                let local = DateTime::<Utc>::from_timestamp_millis(cursor)
                    .ok_or_else(|| AppError::new("VALIDATION", "时间无效"))?
                    .with_timezone(&tz);
                let day = local.date_naive();
                let until = boundary(day.succ_opt().unwrap(), tz)?.min(limit);
                if until <= cursor {
                    return Err(AppError::new("VALIDATION", "日期边界没有前进"));
                }
                let duration = until - cursor;
                *days.entry(day.to_string()).or_default() += duration;
                rows.push(ReportRow {
                    work_date: day.to_string(),
                    entry_id: e.id.clone(),
                    title: e.title.clone(),
                    start_at: cursor,
                    end_at: until,
                    duration_ms: duration,
                    note: e.note.clone(),
                });
                cursor = until;
            }
        }
    }
    rows.sort_by_key(|r| r.start_at);
    let duration_ms = days.values().sum();
    let worked_day_count = days.values().filter(|&&v| v > 0).count();
    Ok(MonthReport {
        month: month.into(),
        reporting_time_zone: time_zone.into(),
        duration_ms,
        worked_day_count,
        days: days
            .into_iter()
            .map(|(date, duration_ms)| DayReport { date, duration_ms })
            .collect(),
        rows,
        pending_count,
        active_count,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonthTotal {
    pub month: String,
    pub duration_ms: i64,
}
pub fn month_totals(entries: &[EntryDetail], time_zone: &str) -> Result<Vec<MonthTotal>> {
    let tz = zone(time_zone)?;
    let mut totals = BTreeMap::<String, i64>::new();
    for e in entries
        .iter()
        .filter(|e| e.status == Status::Completed && e.deleted_at.is_none())
    {
        for segment in &e.segments {
            let mut cursor = segment.start_at;
            let Some(end) = segment.end_at else { continue };
            while cursor < end {
                let t = tz
                    .timestamp_millis_opt(cursor)
                    .single()
                    .ok_or_else(|| AppError::new("VALIDATION", "时间无效"))?;
                let next = if t.month() == 12 {
                    NaiveDate::from_ymd_opt(t.year() + 1, 1, 1)
                } else {
                    NaiveDate::from_ymd_opt(t.year(), t.month() + 1, 1)
                }
                .unwrap();
                let stop = boundary(next, tz)?.min(end);
                if stop <= cursor {
                    return Err(AppError::new("VALIDATION", "月份边界无效"));
                }
                *totals
                    .entry(format!("{:04}-{:02}", t.year(), t.month()))
                    .or_default() += stop - cursor;
                cursor = stop;
            }
        }
    }
    Ok(totals
        .into_iter()
        .map(|(month, duration_ms)| MonthTotal { month, duration_ms })
        .collect())
}
