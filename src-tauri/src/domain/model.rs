use serde::{Deserialize, Serialize};
use uuid::Uuid;
pub const MIN_TIME: i64 = 946684800000;
pub const MAX_TIME: i64 = 4102444800000;
pub fn id() -> String {
    Uuid::new_v4().to_string()
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Running,
    Paused,
    NeedsReview,
    Completed,
}
impl Status {
    pub fn active(self) -> bool {
        matches!(self, Self::Running | Self::Paused)
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Manual,
    Timer,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkSegment {
    pub id: String,
    pub entry_id: String,
    pub start_at: i64,
    pub end_at: Option<i64>,
}
impl WorkSegment {
    pub fn closed(entry_id: &str, start_at: i64, end_at: i64) -> Self {
        Self {
            id: id(),
            entry_id: entry_id.into(),
            start_at,
            end_at: Some(end_at),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewItem {
    pub id: String,
    pub entry_id: String,
    pub reason: String,
    pub candidate_start_at: Option<i64>,
    pub candidate_end_at: Option<i64>,
    pub boundary_quality: String,
    pub resolution: String,
    pub resolved_at: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryDetail {
    pub id: String,
    pub title: String,
    pub note: Option<String>,
    pub source: Source,
    pub status: Status,
    pub version: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub segments: Vec<WorkSegment>,
    pub review_items: Vec<ReviewItem>,
}
impl EntryDetail {
    pub fn manual(title: String, mut segments: Vec<WorkSegment>) -> Self {
        let id = id();
        for s in &mut segments {
            s.entry_id = id.clone();
        }
        Self {
            id,
            title,
            note: None,
            source: Source::Manual,
            status: Status::Completed,
            version: 1,
            created_at: MIN_TIME,
            updated_at: MIN_TIME,
            deleted_at: None,
            segments,
            review_items: vec![],
        }
    }
    pub fn duration(&self) -> i64 {
        self.segments
            .iter()
            .filter_map(|s| s.end_at.map(|end| end - s.start_at))
            .sum()
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationContext {
    pub request_id: String,
    pub workspace_revision: String,
    pub expected_entry_version: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult<T> {
    pub value: T,
    pub workspace_revision: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub reporting_time_zone: String,
    pub week_starts_on: u8,
    pub confirmed: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            reporting_time_zone: "Etc/UTC".into(),
            week_starts_on: 1,
            confirmed: false,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub active_entry: Option<EntryDetail>,
    pub closed_duration_ms: i64,
    pub server_now: i64,
    pub workspace_revision: String,
    pub storage_error: Option<String>,
}
