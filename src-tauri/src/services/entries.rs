use crate::{db::records, domain::*, services::timer::TimerService};
#[derive(Clone)]
pub struct EntryService {
    pub timer: TimerService,
}
impl EntryService {
    pub fn new(timer: TimerService) -> Self {
        Self { timer }
    }
    pub fn list(&self) -> Result<Vec<EntryDetail>> {
        self.timer.db.read(records::all)
    }
    pub fn save(
        &self,
        ctx: MutationContext,
        entry: EntryDetail,
    ) -> Result<MutationResult<EntryDetail>> {
        self.write(ctx, entry, false, false)
    }
    pub fn resolve(
        &self,
        ctx: MutationContext,
        entry: EntryDetail,
        continue_timer: bool,
    ) -> Result<MutationResult<EntryDetail>> {
        self.write(ctx, entry, true, continue_timer)
    }
    fn write(
        &self,
        ctx: MutationContext,
        mut e: EntryDetail,
        review: bool,
        continue_timer: bool,
    ) -> Result<MutationResult<EntryDetail>> {
        let now = self.timer.clock.utc_now();
        let expected = ctx.expected_entry_version;
        let digest = serde_json::to_string(&("save", &e, review, continue_timer, expected))?;
        self.timer.db.mutate(ctx, &digest, now, |tx| {
            let others = records::all(tx)?;
            let old = others.iter().find(|old| old.id == e.id);
            if let Some(old) = old {
                records::check_version(old, expected)?;
                if old.deleted_at.is_some() {
                    return Err(AppError::new("STATE_CONFLICT", "请先找回已删除记录"));
                }
                e.source = old.source;
                e.created_at = old.created_at;
                e.version = old.version + 1;
                e.deleted_at = None;
                if old.status.active() {
                    if review
                        || old.segments != e.segments
                        || old.review_items != e.review_items
                        || old.status != e.status
                    {
                        return Err(AppError::new("ACTIVE_TIMER", "请先结束计时再修改时段"));
                    }
                } else if review {
                    if old.status != Status::NeedsReview {
                        return Err(AppError::new("STATE_CONFLICT", "记录不需要核对"));
                    }
                } else if old.status != Status::Completed {
                    return Err(AppError::new("UNRESOLVED_REVIEW", "请从核对入口处理记录"));
                }
                if review {
                    if old.review_items.len() != e.review_items.len() {
                        return Err(AppError::new("VALIDATION", "核对项不能省略"));
                    }
                    for r in &mut e.review_items {
                        let original = old
                            .review_items
                            .iter()
                            .find(|o| o.id == r.id)
                            .ok_or_else(|| AppError::new("VALIDATION", "未知核对项"))?;
                        let resolution = r.resolution.clone();
                        *r = original.clone();
                        r.resolution = resolution;
                        if r.resolution == "unresolved" {
                            return Err(AppError::new("UNRESOLVED_REVIEW", "请处理所有核对项"));
                        }
                        r.resolved_at = Some(now);
                    }
                } else if !old.status.active() {
                    e.status = Status::Completed;
                    e.review_items = old.review_items.clone();
                }
            } else {
                if expected.is_some() || review {
                    return Err(AppError::new("NOT_FOUND", "原记录不存在"));
                }
                e.source = Source::Manual;
                e.created_at = now;
                e.version = 1;
                e.deleted_at = None;
                e.status = Status::Completed;
                e.review_items.clear();
            }
            if review {
                e.status = Status::Completed;
                validate_entry(&e, now)?;
                if continue_timer {
                    if self
                        .timer
                        .quitting
                        .load(std::sync::atomic::Ordering::SeqCst)
                        || self.timer.storage_error.lock().unwrap().is_some()
                    {
                        return Err(AppError::new("STATE_CONFLICT", "当前不能继续计时"));
                    }
                    if others
                        .iter()
                        .any(|o| o.deleted_at.is_none() && o.status.active())
                    {
                        return Err(AppError::new("ACTIVE_TIMER", "请先结束其他活动任务"));
                    }
                    e.status = Status::Running;
                    e.segments.push(WorkSegment {
                        id: id(),
                        entry_id: e.id.clone(),
                        start_at: now,
                        end_at: None,
                    });
                }
            }
            e.title = e.title.trim().into();
            e.updated_at = now;
            validate_entry(&e, now)?;
            validate_conflicts(&e, &others)?;
            records::put(tx, &e)?;
            if continue_timer {
                self.timer.runtime(tx, &e, now)?;
            }
            Ok(e)
        })
    }
    pub fn delete(&self, ctx: MutationContext, id: &str) -> Result<MutationResult<EntryDetail>> {
        self.deleted(ctx, id, true, false)
    }
    pub fn restore(
        &self,
        ctx: MutationContext,
        id: &str,
        as_review: bool,
    ) -> Result<MutationResult<EntryDetail>> {
        self.deleted(ctx, id, false, as_review)
    }
    fn deleted(
        &self,
        ctx: MutationContext,
        id: &str,
        deleted: bool,
        as_review: bool,
    ) -> Result<MutationResult<EntryDetail>> {
        let now = self.timer.clock.utc_now();
        let expected = ctx.expected_entry_version;
        let digest = serde_json::to_string(&("delete", id, deleted, as_review, expected))?;
        self.timer.db.mutate(ctx, &digest, now, |tx| {
            let mut e = records::get(tx, id)?;
            records::check_version(&e, expected)?;
            if e.status.active() {
                return Err(AppError::new("ACTIVE_TIMER", "活动记录不能删除"));
            }
            if deleted == e.deleted_at.is_some() {
                return Err(AppError::new("STATE_CONFLICT", "记录状态已经改变"));
            }
            e.deleted_at = if deleted { Some(now) } else { None };
            if as_review {
                e.status = Status::NeedsReview;
            }
            e.version += 1;
            e.updated_at = now;
            validate_conflicts(&e, &records::all(tx)?)?;
            records::put(tx, &e)?;
            Ok(e)
        })
    }
}
