use crate::{
    db::{meta, records, settings},
    domain::*,
};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    io::Write,
    path::Path,
};
pub fn last_export_at(c: &rusqlite::Connection) -> Result<Option<i64>> {
    let value: Option<String> = c
        .query_row(
            "SELECT value FROM device_settings WHERE key='last_export'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    Ok(value
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|v| validation::valid_time(*v)))
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableEntry {
    pub id: String,
    pub title: String,
    pub note: Option<String>,
    pub source: Source,
    pub status: Status,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableSettings {
    pub reporting_time_zone: String,
    pub week_starts_on: u8,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub workspace_id: String,
    pub portable_settings: PortableSettings,
    pub work_entries: Vec<PortableEntry>,
    pub work_segments: Vec<WorkSegment>,
    #[serde(default)]
    pub review_items: Vec<ReviewItem>,
    #[serde(default)]
    pub time_zone_data_version: Option<String>,
    #[serde(default)]
    pub report_summaries: Vec<super::reports::MonthTotal>,
}
impl Backup {
    pub fn entries(&self) -> Result<Vec<EntryDetail>> {
        let mut segments: BTreeMap<&str, Vec<WorkSegment>> = BTreeMap::new();
        for s in &self.work_segments {
            segments.entry(&s.entry_id).or_default().push(s.clone());
        }
        let mut reviews: BTreeMap<&str, Vec<ReviewItem>> = BTreeMap::new();
        for r in &self.review_items {
            reviews.entry(&r.entry_id).or_default().push(r.clone());
        }
        let mut result = vec![];
        for e in &self.work_entries {
            result.push(EntryDetail {
                id: e.id.clone(),
                title: e.title.clone(),
                note: e.note.clone(),
                source: e.source,
                status: e.status,
                version: 1,
                created_at: e.created_at,
                updated_at: e.updated_at,
                deleted_at: e.deleted_at,
                segments: segments.remove(e.id.as_str()).unwrap_or_default(),
                review_items: reviews.remove(e.id.as_str()).unwrap_or_default(),
            });
        }
        if !segments.is_empty() || !reviews.is_empty() {
            return Err(AppError::new("VALIDATION", "备份包含不存在的记录引用"));
        }
        Ok(result)
    }
}
pub fn capture(c: &rusqlite::Connection) -> Result<Backup> {
    capture_inner(c, false)
}
pub fn capture_snapshot(c: &rusqlite::Connection) -> Result<Backup> {
    capture_inner(c, true)
}
fn capture_inner(c: &rusqlite::Connection, allow_active: bool) -> Result<Backup> {
    let entries = records::all(c)?;
    if !allow_active && entries.iter().any(|e| e.status.active()) {
        return Err(AppError::new(
            "ACTIVE_TIMER",
            "请先结束计时或转为待核对，再导出完整备份",
        ));
    }
    let settings = settings(c)?;
    let report_summaries = super::reports::month_totals(&entries, &settings.reporting_time_zone)?;
    let mut work_entries = vec![];
    let mut work_segments = vec![];
    let mut review_items = vec![];
    for e in entries {
        work_entries.push(PortableEntry {
            id: e.id,
            title: e.title,
            note: e.note,
            source: e.source,
            status: if e.status.active() {
                Status::NeedsReview
            } else {
                e.status
            },
            created_at: e.created_at,
            updated_at: e.updated_at,
            deleted_at: e.deleted_at,
        });
        work_segments.extend(e.segments);
        review_items.extend(e.review_items);
    }
    Ok(Backup {
        format: "timefolio-backup".into(),
        format_version: 1,
        app_version: env!("CARGO_PKG_VERSION").into(),
        exported_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        workspace_id: meta(c, "workspace_id")?,
        portable_settings: PortableSettings {
            reporting_time_zone: settings.reporting_time_zone,
            week_starts_on: settings.week_starts_on,
        },
        work_entries,
        work_segments,
        review_items,
        time_zone_data_version: Some(chrono_tz::IANA_TZDB_VERSION.into()),
        report_summaries,
    })
}
pub fn parse(bytes: &[u8], now: i64) -> Result<Backup> {
    if bytes.len() > 50 * 1024 * 1024 {
        return Err(AppError::new("VALIDATION", "备份超过 50 MiB 上限"));
    }
    let Strict(value) = serde_json::from_slice::<Strict>(bytes)?;
    let backup: Backup = serde_json::from_value(value)?;
    validate(&backup, now)?;
    Ok(backup)
}
pub fn validate(b: &Backup, now: i64) -> Result<()> {
    if b.format != "timefolio-backup" || b.format_version != 1 {
        return Err(AppError::new(
            "UNSUPPORTED_FORMAT",
            "不支持此备份格式，请使用兼容版本",
        ));
    }
    if uuid::Uuid::parse_str(&b.workspace_id).is_err()
        || chrono::DateTime::parse_from_rfc3339(&b.exported_at).is_err()
    {
        return Err(AppError::new("VALIDATION", "备份标识或导出时间无效"));
    }
    super::reports::zone(&b.portable_settings.reporting_time_zone)?;
    if b.portable_settings.week_starts_on > 6 {
        return Err(AppError::new("VALIDATION", "每周起点无效"));
    }
    if b.work_entries.len() > 100000
        || b.work_segments.len() > 500000
        || b.review_items.len() > 500000
    {
        return Err(AppError::new("VALIDATION", "备份记录数量超过上限"));
    }
    let mut ids = HashSet::new();
    for i in b
        .work_entries
        .iter()
        .map(|e| &e.id)
        .chain(b.work_segments.iter().map(|s| &s.id))
        .chain(b.review_items.iter().map(|r| &r.id))
    {
        if !ids.insert(i) {
            return Err(AppError::new("VALIDATION", "备份包含重复 ID"));
        }
    }
    if b.report_summaries.len() > 1202
        || b.report_summaries
            .iter()
            .any(|r| r.duration_ms < 0 || r.duration_ms > MAX_TIME - MIN_TIME)
    {
        return Err(AppError::new("VALIDATION", "报表比较元数据无效"));
    }
    let entries = b.entries()?;
    let mut intervals = vec![];
    for e in &entries {
        if e.status.active() {
            return Err(AppError::new("ACTIVE_TIMER", "备份不能包含活动计时器"));
        }
        validate_entry(e, now)?;
        if e.status == Status::Completed && e.deleted_at.is_none() {
            for s in &e.segments {
                intervals.push((s.start_at, s.end_at.unwrap()));
            }
        }
    }
    intervals.sort_unstable();
    if intervals.windows(2).any(|w| w[1].0 < w[0].1) {
        return Err(AppError::new("OVERLAP", "备份中的正式工作时间重叠"));
    }
    Ok(())
}
pub fn atomic_write(destination: &Path, bytes: &[u8]) -> Result<()> {
    let parent = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| AppError::new("VALIDATION", "请选择完整保存路径"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist_noclobber(destination).map_err(|e| {
        AppError::new(
            "IO_ERROR",
            format!("无法保存文件（已有同名文件时请另选名称）：{}", e.error),
        )
    })?;
    #[cfg(unix)]
    std::fs::File::open(parent)?.sync_all()?;
    Ok(())
}
// The custom visitor rejects duplicate keys at every nesting level before typed decoding.
struct Strict(Value);
impl<'de> Deserialize<'de> for Strict {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        struct V;
        impl<'de> serde::de::Visitor<'de> for V {
            type Value = Strict;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("JSON without duplicate keys")
            }
            fn visit_bool<E: serde::de::Error>(self, v: bool) -> std::result::Result<Strict, E> {
                Ok(Strict(v.into()))
            }
            fn visit_i64<E: serde::de::Error>(self, v: i64) -> std::result::Result<Strict, E> {
                Ok(Strict(v.into()))
            }
            fn visit_u64<E: serde::de::Error>(self, v: u64) -> std::result::Result<Strict, E> {
                Ok(Strict(v.into()))
            }
            fn visit_f64<E: serde::de::Error>(self, v: f64) -> std::result::Result<Strict, E> {
                serde_json::Number::from_f64(v)
                    .map(|v| Strict(Value::Number(v)))
                    .ok_or_else(|| E::custom("invalid number"))
            }
            fn visit_str<E: serde::de::Error>(self, v: &str) -> std::result::Result<Strict, E> {
                Ok(Strict(v.into()))
            }
            fn visit_string<E: serde::de::Error>(
                self,
                v: String,
            ) -> std::result::Result<Strict, E> {
                Ok(Strict(v.into()))
            }
            fn visit_unit<E: serde::de::Error>(self) -> std::result::Result<Strict, E> {
                Ok(Strict(Value::Null))
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> std::result::Result<Strict, A::Error> {
                let mut v = vec![];
                while let Some(Strict(item)) = seq.next_element()? {
                    v.push(item);
                    if v.len() > 500000 {
                        return Err(serde::de::Error::custom("collection too large"));
                    }
                }
                Ok(Strict(Value::Array(v)))
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> std::result::Result<Strict, A::Error> {
                let mut v = serde_json::Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    if v.contains_key(&key) {
                        return Err(serde::de::Error::custom("duplicate JSON key"));
                    }
                    let Strict(item) = map.next_value()?;
                    v.insert(key, item);
                }
                Ok(Strict(Value::Object(v)))
            }
        }
        d.deserialize_any(V)
    }
}
