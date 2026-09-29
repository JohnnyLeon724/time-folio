use std::time::{Duration, Instant};
pub trait Clock: Send + Sync {
    fn utc_now(&self) -> i64;
    fn monotonic_now(&self) -> Duration;
}
pub struct SystemClock {
    start: Instant,
}
impl Default for SystemClock {
    fn default() -> Self {
        Self {
            start: Instant::now(),
        }
    }
}
impl Clock for SystemClock {
    fn utc_now(&self) -> i64 {
        chrono::Utc::now().timestamp_millis()
    }
    fn monotonic_now(&self) -> Duration {
        self.start.elapsed()
    }
}
