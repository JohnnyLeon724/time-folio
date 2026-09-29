use crate::domain::*;
use rusqlite::{params, Connection};
pub fn all(c: &Connection) -> Result<Vec<EntryDetail>> {
    let mut q=c.prepare("SELECT id,title,note,source,status,version,created_at,updated_at,deleted_at FROM work_entries ORDER BY created_at DESC,id")?;
    let rows = q.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, u64>(5)?,
            r.get::<_, i64>(6)?,
            r.get::<_, i64>(7)?,
            r.get::<_, Option<i64>>(8)?,
        ))
    })?;
    let mut entries = vec![];
    for row in rows {
        let (id, title, note, source, status, version, created_at, updated_at, deleted_at) = row?;
        let mut stmt=c.prepare("SELECT id,entry_id,start_at,end_at FROM work_segments WHERE entry_id=?1 ORDER BY start_at,id")?;
        let segments = stmt
            .query_map([&id], |r| {
                Ok(WorkSegment {
                    id: r.get(0)?,
                    entry_id: r.get(1)?,
                    start_at: r.get(2)?,
                    end_at: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut stmt =
            c.prepare("SELECT payload FROM review_items WHERE entry_id=?1 ORDER BY id")?;
        let mut review_items = vec![];
        for s in stmt.query_map([&id], |r| r.get::<_, String>(0))? {
            review_items.push(serde_json::from_str(&s?)?);
        }
        entries.push(EntryDetail {
            id,
            title,
            note,
            source: serde_json::from_value(serde_json::Value::String(source))?,
            status: serde_json::from_value(serde_json::Value::String(status))?,
            version,
            created_at,
            updated_at,
            deleted_at,
            segments,
            review_items,
        });
    }
    Ok(entries)
}
pub fn get(c: &Connection, entry_id: &str) -> Result<EntryDetail> {
    all(c)?
        .into_iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| AppError::new("NOT_FOUND", "记录不存在"))
}
pub fn put(c: &Connection, e: &EntryDetail) -> Result<()> {
    let source = serde_json::to_value(e.source)?
        .as_str()
        .unwrap()
        .to_string();
    let status = serde_json::to_value(e.status)?
        .as_str()
        .unwrap()
        .to_string();
    c.execute("INSERT INTO work_entries(id,title,note,source,status,version,created_at,updated_at,deleted_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET title=excluded.title,note=excluded.note,source=excluded.source,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at",params![e.id,e.title,e.note,source,status,e.version,e.created_at,e.updated_at,e.deleted_at])?;
    c.execute("DELETE FROM work_segments WHERE entry_id=?1", [&e.id])?;
    c.execute("DELETE FROM review_items WHERE entry_id=?1", [&e.id])?;
    for s in &e.segments {
        c.execute(
            "INSERT INTO work_segments VALUES(?1,?2,?3,?4)",
            params![s.id, s.entry_id, s.start_at, s.end_at],
        )?;
    }
    for r in &e.review_items {
        c.execute(
            "INSERT INTO review_items VALUES(?1,?2,?3)",
            params![r.id, r.entry_id, serde_json::to_string(r)?],
        )?;
    }
    Ok(())
}
pub fn check_version(e: &EntryDetail, expected: Option<u64>) -> Result<()> {
    if expected != Some(e.version) {
        Err(AppError::new("STALE_REVISION", "记录已改变，请重新打开"))
    } else {
        Ok(())
    }
}
