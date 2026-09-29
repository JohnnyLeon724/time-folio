#![allow(dead_code)]
use hourtrail::{db::Database, domain::*, platform::clock::Clock};
use std::{
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc,
    },
    time::Duration,
};
pub struct TestClock(pub AtomicI64);
impl TestClock {
    pub fn at(t: i64) -> Arc<Self> {
        Arc::new(Self(AtomicI64::new(t)))
    }
    pub fn set(&self, t: i64) {
        self.0.store(t, Ordering::SeqCst);
    }
}
impl Clock for TestClock {
    fn utc_now(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
    fn monotonic_now(&self) -> Duration {
        Duration::from_millis(self.utc_now() as u64)
    }
}
pub fn ctx(db: &Database, e: Option<&EntryDetail>) -> MutationContext {
    MutationContext {
        request_id: id(),
        workspace_revision: db.revision().unwrap(),
        expected_entry_version: e.map(|e| e.version),
    }
}
pub fn at(s: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(s)
        .unwrap()
        .timestamp_millis()
}
