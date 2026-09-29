use crate::{domain::*, services::timer::TimerService};
use std::sync::atomic::Ordering;
pub struct LifecycleService {
    pub timer: TimerService,
}
impl LifecycleService {
    pub fn new(timer: TimerService) -> Self {
        Self { timer }
    }
    pub fn can_hide(&self, tray_ready: bool) -> bool {
        tray_ready
    }
    pub fn request_quit(&self) -> Result<bool> {
        self.timer.quitting.store(true, Ordering::SeqCst);
        Ok(self.timer.state()?.active_entry.is_some())
    }
    pub fn cancel_quit(&self) {
        self.timer.quitting.store(false, Ordering::SeqCst);
    }
    pub fn quit_pending(&self) -> Result<()> {
        if let Some(e) = self.timer.state()?.active_entry {
            let ctx = MutationContext {
                request_id: id(),
                workspace_revision: self.timer.db.revision()?,
                expected_entry_version: Some(e.version),
            };
            self.timer.stop(ctx, &e.id)?;
        }
        Ok(())
    }
}
