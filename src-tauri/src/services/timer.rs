use crate::{
    db::{records, Database},
    domain::*,
    platform::clock::Clock,
};
use rusqlite::{params, Connection};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
#[derive(Clone)]
pub struct TimerService {
    pub db: Arc<Database>,
    pub clock: Arc<dyn Clock>,
    pub session: String,
    pub storage_error: Arc<Mutex<Option<String>>>,
    pub quitting: Arc<AtomicBool>,
    pub clock_sample: Arc<Mutex<(i64, std::time::Duration)>>,
}
impl TimerService {
    pub fn new(db: Arc<Database>, clock: Arc<dyn Clock>) -> Self {
        let sample = (clock.utc_now(), clock.monotonic_now());
        Self {
            clock_sample: Arc::new(Mutex::new(sample)),
            db,
            clock,
            session: id(),
            storage_error: Arc::new(Mutex::new(None)),
            quitting: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn state(&self) -> Result<TimerState> {
        self.db.read(|c| {
            let active_entry = records::all(c)?
                .into_iter()
                .find(|e| e.deleted_at.is_none() && e.status.active());
            Ok(TimerState {
                closed_duration_ms: active_entry.as_ref().map_or(0, |e| e.duration()),
                active_entry,
                server_now: self.clock.utc_now(),
                workspace_revision: crate::db::meta(c, "mutation_revision")?,
                storage_error: self.storage_error.lock().unwrap().clone(),
            })
        })
    }
    fn available(&self) -> Result<()> {
        if self.quitting.load(Ordering::SeqCst) {
            return Err(AppError::new("STATE_CONFLICT", "正在退出，请先取消退出"));
        }
        if self.storage_error.lock().unwrap().is_some() {
            return Err(AppError::new("STORAGE", "存储异常，请先恢复并核对记录"));
        }
        Ok(())
    }
    pub fn start(
        &self,
        ctx: MutationContext,
        title: String,
        note: Option<String>,
    ) -> Result<MutationResult<EntryDetail>> {
        self.available()?;
        if self.state()?.active_entry.is_none() {
            *self.clock_sample.lock().unwrap() = (self.clock.utc_now(), self.clock.monotonic_now());
        }
        let now = self.clock.utc_now();
        let digest = serde_json::to_string(&("start", &title, &note))?;
        self.db.mutate(ctx, &digest, now, |tx| {
            if records::all(tx)?
                .iter()
                .any(|e| e.deleted_at.is_none() && e.status.active())
            {
                return Err(AppError::new("ACTIVE_TIMER", "请先结束当前任务"));
            }
            let mut e = EntryDetail::manual(title.trim().into(), vec![]);
            e.note = note;
            e.source = Source::Timer;
            e.status = Status::Running;
            e.created_at = now;
            e.updated_at = now;
            e.segments.push(WorkSegment {
                id: id(),
                entry_id: e.id.clone(),
                start_at: now,
                end_at: None,
            });
            validate_entry(&e, now)?;
            validate_conflicts(&e, &records::all(tx)?)?;
            records::put(tx, &e)?;
            self.runtime(tx, &e, now)?;
            Ok(e)
        })
    }
    pub fn pause(
        &self,
        ctx: MutationContext,
        entry_id: &str,
    ) -> Result<MutationResult<EntryDetail>> {
        self.transition(ctx, entry_id, "pause")
    }
    pub fn resume(
        &self,
        ctx: MutationContext,
        entry_id: &str,
    ) -> Result<MutationResult<EntryDetail>> {
        self.available()?;
        if self
            .state()?
            .active_entry
            .is_some_and(|e| e.id == entry_id && e.status == Status::Paused)
        {
            *self.clock_sample.lock().unwrap() = (self.clock.utc_now(), self.clock.monotonic_now());
        }
        self.transition(ctx, entry_id, "resume")
    }
    pub fn stop(
        &self,
        ctx: MutationContext,
        entry_id: &str,
    ) -> Result<MutationResult<EntryDetail>> {
        self.transition(ctx, entry_id, "stop")
    }
    fn transition(
        &self,
        ctx: MutationContext,
        entry_id: &str,
        action: &str,
    ) -> Result<MutationResult<EntryDetail>> {
        let now = self.clock.utc_now();
        let expected = ctx.expected_entry_version;
        let digest = serde_json::to_string(&(action, entry_id, expected))?;
        if let Some(receipt) = self.db.receipt(&ctx.request_id, &digest)? {
            return Ok(receipt);
        }
        if action != "resume" {
            let revision = self.db.revision()?;
            if self.storage_error.lock().unwrap().is_some() {
                crate::services::recovery::RecoveryService::new(self.clone())
                    .recover_on_startup()?;
            } else {
                crate::services::recovery::RecoveryService::new(self.clone()).checkpoint()?;
            }
            if revision != self.db.revision()? {
                return Err(AppError::new(
                    "CLOCK_UNCERTAIN",
                    "计时发生中断或系统时间变化，记录已保留，请到待核对列表处理",
                ));
            }
        }
        self.db.mutate(ctx, &digest, now, |tx| {
            let mut e = records::get(tx, entry_id)?;
            records::check_version(&e, expected)?;
            if e.deleted_at.is_some()
                || !matches!(
                    (action, e.status),
                    ("pause", Status::Running)
                        | ("resume", Status::Paused)
                        | ("stop", Status::Running | Status::Paused)
                )
            {
                return Err(AppError::new("STATE_CONFLICT", "当前状态不能执行此操作"));
            }
            if action == "resume" {
                e.status = Status::Running;
                e.segments.push(WorkSegment {
                    id: id(),
                    entry_id: e.id.clone(),
                    start_at: now,
                    end_at: None,
                });
            } else {
                close_segment(&mut e, now)?;
                e.status = if action == "pause" {
                    Status::Paused
                } else {
                    Status::NeedsReview
                };
            }
            e.updated_at = now;
            e.version += 1;
            validate_entry(&e, now)?;
            validate_conflicts(&e, &records::all(tx)?)?;
            records::put(tx, &e)?;
            self.runtime(tx, &e, now)?;
            Ok(e)
        })
    }
    pub fn runtime(&self, c: &Connection, e: &EntryDetail, now: i64) -> Result<()> {
        c.execute("DELETE FROM timer_runtime", [])?;
        if e.status == Status::Running {
            let s = e
                .segments
                .iter()
                .find(|s| s.end_at.is_none())
                .ok_or_else(|| AppError::new("STATE_CONFLICT", "缺少开放时段"))?;
            c.execute(
                "INSERT INTO timer_runtime VALUES(1,?1,?2,?3,?4)",
                params![e.id, s.id, now, self.session],
            )?;
        }
        Ok(())
    }
}
pub fn close_segment(e: &mut EntryDetail, at: i64) -> Result<()> {
    for s in &mut e.segments {
        if s.end_at.is_none() {
            if at < s.start_at {
                return Err(AppError::new(
                    "CLOCK_UNCERTAIN",
                    "系统时间早于开始时间，请核对记录",
                ));
            }
            s.end_at = Some(at);
        }
    }
    e.segments.retain(|s| s.end_at != Some(s.start_at));
    Ok(())
}
