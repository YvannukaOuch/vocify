import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface Clip {
  id: number;
  ownerId: number;
  title: string;
  tags: string[];
  videoId: string;
  videoTitle: string | null;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Telegram's handle for the uploaded voice — re-sending it costs no bandwidth. */
  fileId: string;
  fileUniqueId: string;
  useCount: number;
  createdAt: number;
  lastUsedAt: number | null;
}

export type NewClip = Omit<Clip, 'id' | 'useCount' | 'createdAt' | 'lastUsedAt'>;

interface ClipRow {
  id: number;
  owner_id: number;
  title: string;
  tags: string;
  video_id: string;
  video_title: string | null;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  file_id: string;
  file_unique_id: string;
  use_count: number;
  created_at: number;
  last_used_at: number | null;
}

/** Append-only: each entry upgrades the schema by one version (tracked in PRAGMA user_version). */
const MIGRATIONS = [
  `CREATE TABLE clips (
     id             INTEGER PRIMARY KEY,
     owner_id       INTEGER NOT NULL,
     title          TEXT    NOT NULL,
     tags           TEXT    NOT NULL DEFAULT '[]',
     search_text    TEXT    NOT NULL,
     video_id       TEXT    NOT NULL,
     video_title    TEXT,
     start_ms       INTEGER NOT NULL,
     end_ms         INTEGER NOT NULL,
     duration_ms    INTEGER NOT NULL,
     file_id        TEXT    NOT NULL,
     file_unique_id TEXT    NOT NULL,
     use_count      INTEGER NOT NULL DEFAULT 0,
     created_at     INTEGER NOT NULL,
     last_used_at   INTEGER
   );
   CREATE INDEX clips_owner_created ON clips (owner_id, created_at DESC);`,
];

/** Lowercase and strip accents so "Café" matches "cafe". */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

function searchText(clip: { title: string; tags: string[]; videoTitle: string | null }): string {
  return normalizeSearch([clip.title, ...clip.tags, clip.videoTitle ?? ''].join(' '));
}

function toClip(row: ClipRow): Clip {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    tags: JSON.parse(row.tags) as string[],
    videoId: row.video_id,
    videoTitle: row.video_title,
    startMs: row.start_ms,
    endMs: row.end_ms,
    durationMs: row.duration_ms,
    fileId: row.file_id,
    fileUniqueId: row.file_unique_id,
    useCount: row.use_count,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  migrate(db);

  const insertClip = db.prepare(
    `INSERT INTO clips (owner_id, title, tags, search_text, video_id, video_title, start_ms, end_ms, duration_ms, file_id, file_unique_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  );
  const selectOne = db.prepare('SELECT * FROM clips WHERE owner_id = ? AND id = ?');
  const selectAll = db.prepare('SELECT * FROM clips WHERE owner_id = ? ORDER BY created_at DESC, id DESC');
  const updateClip = db.prepare('UPDATE clips SET title = ?, tags = ?, search_text = ? WHERE owner_id = ? AND id = ? RETURNING *');
  const deleteClip = db.prepare('DELETE FROM clips WHERE owner_id = ? AND id = ?');
  const touchClip = db.prepare('UPDATE clips SET use_count = use_count + 1, last_used_at = ? WHERE owner_id = ? AND id = ?');

  return {
    insert(clip: NewClip): Clip {
      const row = insertClip.get(
        clip.ownerId, clip.title, JSON.stringify(clip.tags), searchText(clip), clip.videoId, clip.videoTitle,
        clip.startMs, clip.endMs, clip.durationMs, clip.fileId, clip.fileUniqueId, Date.now(),
      );
      return toClip(row as unknown as ClipRow);
    },

    get(ownerId: number, id: number): Clip | undefined {
      const row = selectOne.get(ownerId, id);
      return row ? toClip(row as unknown as ClipRow) : undefined;
    },

    list(ownerId: number): Clip[] {
      return (selectAll.all(ownerId) as unknown as ClipRow[]).map(toClip);
    },

    /** Every word must appear in the title, tags or video title. Recently used/created first. */
    search(ownerId: number, query: string, limit: number, offset: number): Clip[] {
      const words = normalizeSearch(query).split(' ').filter(Boolean).slice(0, 8);
      const filters = words.map(() => 'AND instr(search_text, ?) > 0').join(' ');
      const statement = db.prepare(
        `SELECT * FROM clips WHERE owner_id = ? ${filters}
         ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`,
      );
      return (statement.all(ownerId, ...words, limit, offset) as unknown as ClipRow[]).map(toClip);
    },

    update(ownerId: number, id: number, changes: { title?: string; tags?: string[] }): Clip | undefined {
      const current = this.get(ownerId, id);
      if (!current) return undefined;
      const next = { ...current, ...changes };
      const row = updateClip.get(next.title, JSON.stringify(next.tags), searchText(next), ownerId, id);
      return toClip(row as unknown as ClipRow);
    },

    remove(ownerId: number, id: number): boolean {
      return Number(deleteClip.run(ownerId, id).changes) > 0;
    },

    markUsed(ownerId: number, id: number): void {
      touchClip.run(Date.now(), ownerId, id);
    },

    close(): void {
      db.close();
    },
  };
}

export type Store = ReturnType<typeof openStore>;

function migrate(db: DatabaseSync) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let next = version; next < MIGRATIONS.length; next++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[next]!);
      db.exec(`PRAGMA user_version = ${next + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
