use crate::{
    db::{meta, records},
    domain::*,
    services::timer::{close_segment, TimerService},
};
use rusqlite::{params, OptionalExtension};
pub struct RecoveryService {
    pub timer: TimerService,
}
impl RecoveryService {
    pub fn new(timer: TimerService) -> Self {
        Self { timer }
    }
    pub fn suspend(&self) -> Result<()> {
        self.interrupt("sleep", true, false)
    }
    pub fn resume(&self) -> Result<()> {
        let now = self.timer.clock.utc_now();
        self.timer.db.internal(|tx| {
            let pending: Option<String> = tx
                .query_row(
                    "SELECT value FROM device_settings WHERE key='pending_sleep'",
                    [],
                    |r| r.get(0),
                )
                .optional()?;
            let mut changed = false;
            for mut e in records::all(tx)? {
                let mut dirty = false;
                for r in &mut e.review_items {
                    if pending.as_deref() == Some(r.id.as_str())
                        && r.reason == "sleep"
                        && r.resolution == "unresolved"
                        && r.candidate_end_at.is_none()
                    {
                        r.candidate_end_at = Some(now);
                        dirty = true;
                    }
                }
                if dirty {
                    e.version += 1;
                    e.updated_at = now;
                    records::put(tx, &e)?;
                    changed = true;
                }
            }
            if changed {
                tx.execute("DELETE FROM device_settings WHERE key='pending_sleep'", [])?;
                bump(tx)?;
            }
            Ok(())
        })?;
        // A wake without a delivered suspend still needs review.
        if self
            .timer
            .state()?
            .active_entry
            .is_some_and(|e| e.status == Status::Running)
        {
            self.interrupt("interruption", false, true)?;
        }
        *self.timer.clock_sample.lock().unwrap() = (now, self.timer.clock.monotonic_now());
        Ok(())
    }
    pub fn recover_on_startup(&self) -> Result<()> {
        self.interrupt("recovery", false, true)?;
        self.resume()?;
        Ok(())
    }
    pub fn checkpoint(&self) -> Result<()> {
        let now = self.timer.clock.utc_now();
        let mono = self.timer.clock.monotonic_now();
        let mut sample = self.timer.clock_sample.lock().unwrap();
        let (old, previous) = *sample;
        let elapsed = mono.saturating_sub(previous).as_millis() as i64;
        let active = self.timer.state()?.active_entry;
        if active.as_ref().is_some_and(|e| e.status == Status::Running) {
            if now - old > 60000 || elapsed > 60000 {
                self.interrupt("interruption", false, true)?;
            } else if ((now - old) - elapsed).abs() > 2000 || now < old {
                self.interrupt("clock_change", false, true)?;
            } else {
                self.timer.db.internal(|tx|{tx.execute("UPDATE timer_runtime SET last_checkpoint_at=?1 WHERE process_session_id=?2",params![now,self.timer.session])?;Ok(())})?;
            }
        }
        *sample = (now, mono);
        Ok(())
    }
    pub fn tick(&self) {
        let had_error = self.timer.storage_error.lock().unwrap().is_some();
        let result = if had_error {
            self.recover_on_startup()
        } else {
            self.checkpoint()
        };
        *self.timer.storage_error.lock().unwrap() = result.err().map(|e| e.message);
    }
    fn interrupt(&self, reason: &str, observed: bool, closed_candidate: bool) -> Result<()> {
        let now = self.timer.clock.utc_now();
        self.timer.db.internal(|tx| {
            for mut e in records::all(tx)?
                .into_iter()
                .filter(|e| e.deleted_at.is_none() && e.status.active())
            {
                if e.status == Status::Paused && reason != "recovery" {
                    continue;
                }
                if e.status == Status::Running {
                    let start = e
                        .segments
                        .iter()
                        .find(|s| s.end_at.is_none())
                        .ok_or_else(|| AppError::new("STATE_CONFLICT", "缺少开放时段"))?
                        .start_at;
                    let checkpoint: Option<i64> = tx
                        .query_row(
                            "SELECT last_checkpoint_at FROM timer_runtime WHERE entry_id=?1",
                            [&e.id],
                            |r| r.get(0),
                        )
                        .optional()?;
                    let boundary = if observed && now >= start {
                        now
                    } else {
                        checkpoint.unwrap_or(start).max(start)
                    };
                    close_segment(&mut e, boundary)?;
                    let review_id = id();
                    if reason == "sleep" { tx.execute("INSERT INTO device_settings VALUES('pending_sleep',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [&review_id])?; }
                    e.review_items.push(ReviewItem {
                        id: review_id,
                        entry_id: e.id.clone(),
                        reason: reason.into(),
                        candidate_start_at: Some(boundary),
                        candidate_end_at: if closed_candidate { Some(now) } else { None },
                        boundary_quality: if observed { "observed" } else { "estimated" }.into(),
                        resolution: "unresolved".into(),
                        resolved_at: None,
                    });
                }
                e.status = Status::NeedsReview;
                e.updated_at = now;
                e.version += 1;
                records::put(tx, &e)?;
                tx.execute("DELETE FROM timer_runtime", [])?;
                bump(tx)?;
            }
            Ok(())
        })
    }
}
pub fn bump(c: &rusqlite::Connection) -> Result<()> {
    let _ = meta(c, "mutation_revision")?;
    c.execute(
        "UPDATE app_metadata SET value=?1 WHERE key='mutation_revision'",
        [id()],
    )?;
    Ok(())
}
