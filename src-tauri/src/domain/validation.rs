use super::*;
use std::collections::HashSet;
pub fn overlaps(a: (i64, i64), b: (i64, i64)) -> bool {
    a.0 < b.1 && b.0 < a.1
}
pub fn valid_time(t: i64) -> bool {
    (MIN_TIME..MAX_TIME).contains(&t)
}
pub fn validate_entry(e: &EntryDetail, now: i64) -> Result<()> {
    let fail = |m| AppError::new("VALIDATION", m);
    if uuid::Uuid::parse_str(&e.id).is_err() {
        return Err(fail("记录 ID 无效"));
    }
    if e.title.trim().is_empty() || e.title.trim().chars().count() > 200 {
        return Err(fail("标题须为 1–200 个字符"));
    }
    if e.note.as_ref().is_some_and(|n| n.chars().count() > 10000) {
        return Err(fail("备注最多 10,000 个字符"));
    }
    if !valid_time(e.created_at)
        || !valid_time(e.updated_at)
        || e.deleted_at.is_some_and(|t| !valid_time(t))
    {
        return Err(fail("记录时间超出支持范围"));
    }
    if e.segments.len() > 1000 || e.review_items.len() > 1000 {
        return Err(fail("单条记录最多 1,000 个时段和核对项"));
    }
    if e.status == Status::Completed && e.segments.is_empty() {
        return Err(fail("至少添加一个记录时段"));
    }
    let mut ids = HashSet::new();
    let mut opens = 0;
    for s in &e.segments {
        if s.entry_id != e.id || uuid::Uuid::parse_str(&s.id).is_err() || !ids.insert(s.id.clone())
        {
            return Err(fail("记录时段 ID 或所属记录无效"));
        }
        if !valid_time(s.start_at) {
            return Err(fail("开始时间超出支持范围"));
        }
        if let Some(end) = s.end_at {
            if !valid_time(end) || end <= s.start_at || end > now {
                return Err(fail("结束时间必须晚于开始且不能晚于当前时间"));
            }
        } else {
            opens += 1;
        }
    }
    if (e.status == Status::Running && opens != 1)
        || (matches!(e.status, Status::Paused | Status::Completed) && opens != 0)
    {
        return Err(fail("记录状态与开放时段不一致"));
    }
    for (i, a) in e.segments.iter().enumerate() {
        for b in &e.segments[i + 1..] {
            if overlaps(
                (a.start_at, a.end_at.unwrap_or(i64::MAX)),
                (b.start_at, b.end_at.unwrap_or(i64::MAX)),
            ) {
                let mut err = fail("同一记录中的记录时段不能重叠");
                err.details = serde_json::json!({"segmentId":a.id,"conflictingSegmentId":b.id,"entryId":e.id,"title":e.title,"startAt":b.start_at,"endAt":b.end_at});
                return Err(err);
            }
        }
    }
    let mut review_ids = HashSet::new();
    for r in &e.review_items {
        if r.entry_id != e.id || uuid::Uuid::parse_str(&r.id).is_err() || !review_ids.insert(&r.id)
        {
            return Err(fail("核对项 ID 或所属记录无效"));
        }
        if !["sleep", "interruption", "clock_change", "recovery"].contains(&r.reason.as_str())
            || !["observed", "estimated"].contains(&r.boundary_quality.as_str())
            || !["unresolved", "included", "excluded", "adjusted"].contains(&r.resolution.as_str())
        {
            return Err(fail("核对项类型无效"));
        }
        if r.candidate_start_at.is_some_and(|t| !valid_time(t))
            || r.candidate_end_at.is_some_and(|t| !valid_time(t))
            || r.resolved_at.is_some_and(|t| !valid_time(t))
        {
            return Err(fail("核对时间超出支持范围"));
        }
        if (r.resolution == "unresolved") != r.resolved_at.is_none() {
            return Err(fail("核对项处理状态不一致"));
        }
        if e.status != Status::NeedsReview && r.resolution == "unresolved" {
            return Err(fail("请先处理所有核对项"));
        }
    }
    if e.deleted_at.is_some() && e.status.active() {
        return Err(fail("活动记录不能删除"));
    }
    Ok(())
}
pub fn validate_conflicts(entry: &EntryDetail, others: &[EntryDetail]) -> Result<()> {
    if entry.deleted_at.is_some() || entry.status == Status::NeedsReview {
        return Ok(());
    }
    for other in others
        .iter()
        .filter(|o| o.id != entry.id && o.deleted_at.is_none() && o.status != Status::NeedsReview)
    {
        for a in &entry.segments {
            for b in &other.segments {
                if overlaps(
                    (a.start_at, a.end_at.unwrap_or(i64::MAX)),
                    (b.start_at, b.end_at.unwrap_or(i64::MAX)),
                ) {
                    let mut err =
                        AppError::new("OVERLAP", format!("与「{}」的记录时段重叠", other.title));
                    err.details = serde_json::json!({"segmentId":a.id,"conflictingSegmentId":b.id,"entryId":other.id,"title":other.title,"startAt":b.start_at,"endAt":b.end_at});
                    return Err(err);
                }
            }
        }
    }
    Ok(())
}
