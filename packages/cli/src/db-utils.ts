import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export interface Source {
  id: number;
  url: string;
  added_at: string;
  page_count: number;
  chunk_count: number;
  crawl_state: string | null;
}

/**
 * Opens a database connection with sqlite-vec loaded.
 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.defaultSafeIntegers(false);
  sqliteVec.load(db);
  return db;
}

/**
 * Checks if a table exists in the database.
 */
function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as { name: string } | undefined;
  return !!result;
}

/**
 * Checks if a column exists in a table.
 */
function columnExists(
  db: Database.Database,
  tableName: string,
  columnName: string
): boolean {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return result.some((col) => col.name === columnName);
}

/**
 * Migrates the database schema to support sources and embedding storage.
 * Safe to call multiple times - only applies missing changes.
 */
export function migrateDatabase(
  db: Database.Database,
  configSources?: Array<{ url: string; addedAt?: string }>
): void {
  // Create sources table if it doesn't exist
  if (!tableExists(db, "sources")) {
    db.exec(`
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        added_at TEXT NOT NULL,
        page_count INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        crawl_state TEXT
      )
    `);

    // Migrate existing sources from config.json
    if (configSources && configSources.length > 0) {
      const insertSource = db.prepare(
        "INSERT INTO sources (url, added_at) VALUES (?, ?)"
      );
      for (const source of configSources) {
        insertSource.run(source.url, source.addedAt || new Date().toISOString());
      }
    }
  }

  // Add source_id column to chunks if it doesn't exist
  if (!columnExists(db, "chunks", "source_id")) {
    db.exec("ALTER TABLE chunks ADD COLUMN source_id INTEGER DEFAULT 0");
  }

  // Add embedding_blob column to chunks if it doesn't exist
  if (!columnExists(db, "chunks", "embedding_blob")) {
    db.exec("ALTER TABLE chunks ADD COLUMN embedding_blob BLOB");
  }
}

/**
 * Finds a source by URL (normalized comparison).
 */
export function findSourceByUrl(
  db: Database.Database,
  url: string
): Source | null {
  const normalizedUrl = normalizeUrl(url);

  const sources = db.prepare("SELECT * FROM sources").all() as Source[];
  for (const source of sources) {
    if (normalizeUrl(source.url) === normalizedUrl) {
      return source;
    }
  }
  return null;
}

/**
 * Normalizes a URL for comparison.
 * Removes trailing slashes, lowercases, strips common query params.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Lowercase the hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    // Remove trailing slash from pathname
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    // Remove common tracking params
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    return parsed.toString();
  } catch {
    // If URL parsing fails, just do basic normalization
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Gets all sources from the database.
 */
export function getSources(db: Database.Database): Source[] {
  if (!tableExists(db, "sources")) {
    return [];
  }
  return db.prepare("SELECT * FROM sources ORDER BY id").all() as Source[];
}

/**
 * Creates or gets a source ID for a URL.
 */
export function getOrCreateSource(
  db: Database.Database,
  url: string
): number {
  const existing = findSourceByUrl(db, url);
  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare("INSERT INTO sources (url, added_at) VALUES (?, ?)")
    .run(url, new Date().toISOString());
  return result.lastInsertRowid as number;
}

/**
 * Updates source metadata (page count, chunk count).
 */
export function updateSourceMetadata(
  db: Database.Database,
  sourceId: number,
  pageCount: number,
  chunkCount: number
): void {
  db.prepare(
    "UPDATE sources SET page_count = ?, chunk_count = ? WHERE id = ?"
  ).run(pageCount, chunkCount, sourceId);
}

/**
 * Saves crawl state for resuming later.
 */
export function saveCrawlState(
  db: Database.Database,
  sourceId: number,
  state: { pendingUrls: string[]; maxPagesReached: boolean }
): void {
  db.prepare("UPDATE sources SET crawl_state = ? WHERE id = ?").run(
    JSON.stringify(state),
    sourceId
  );
}

/**
 * Clears crawl state after successful completion.
 */
export function clearCrawlState(
  db: Database.Database,
  sourceId: number
): void {
  db.prepare("UPDATE sources SET crawl_state = NULL WHERE id = ?").run(
    sourceId
  );
}

/**
 * Gets crawl state for a source.
 */
export function getCrawlState(
  db: Database.Database,
  sourceId: number
): { pendingUrls: string[]; maxPagesReached: boolean } | null {
  const source = db
    .prepare("SELECT crawl_state FROM sources WHERE id = ?")
    .get(sourceId) as { crawl_state: string | null } | undefined;

  if (!source?.crawl_state) {
    return null;
  }

  try {
    return JSON.parse(source.crawl_state);
  } catch {
    return null;
  }
}

/**
 * Deletes all chunks for a specific source.
 */
export function deleteChunksForSource(
  db: Database.Database,
  sourceId: number
): number {
  const result = db
    .prepare("DELETE FROM chunks WHERE source_id = ?")
    .run(sourceId);
  return result.changes;
}

/**
 * Rebuilds the vec_chunks virtual table from stored embedding_blob data.
 * This is necessary because sqlite-vec vec0 tables don't support DELETE well.
 */
export function rebuildVectorTable(db: Database.Database): void {
  // Get all chunks with embeddings
  const chunks = db
    .prepare("SELECT id, embedding_blob FROM chunks WHERE embedding_blob IS NOT NULL ORDER BY id")
    .all() as Array<{ id: number; embedding_blob: Buffer }>;

  // Drop and recreate vec_chunks
  db.exec("DROP TABLE IF EXISTS vec_chunks");
  db.exec("CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding float[1536])");

  // Re-insert embeddings
  for (const chunk of chunks) {
    if (chunk.embedding_blob) {
      const hex = chunk.embedding_blob.toString("hex");
      db.exec(
        `INSERT INTO vec_chunks (rowid, embedding) VALUES (${chunk.id}, vec_f32(x'${hex}'))`
      );
    }
  }
}

/**
 * Inserts a chunk with its embedding into both chunks and vec_chunks tables.
 */
export function insertChunkWithEmbedding(
  db: Database.Database,
  chunk: {
    content: string;
    url: string;
    title: string;
    chunkIndex: number;
    embedding?: number[];
  },
  sourceId: number
): number {
  // Insert into chunks table
  let embeddingBlob: Buffer | null = null;
  if (chunk.embedding) {
    const embeddingBuffer = new Float32Array(chunk.embedding).buffer;
    embeddingBlob = Buffer.from(new Uint8Array(embeddingBuffer));
  }

  const result = db
    .prepare(
      "INSERT INTO chunks (content, url, title, chunk_index, source_id, embedding_blob) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      chunk.content,
      chunk.url,
      chunk.title,
      chunk.chunkIndex,
      sourceId,
      embeddingBlob
    );

  const chunkId = result.lastInsertRowid as number;

  // Insert into vec_chunks table
  if (embeddingBlob) {
    const hex = embeddingBlob.toString("hex");
    db.exec(
      `INSERT INTO vec_chunks (rowid, embedding) VALUES (${chunkId}, vec_f32(x'${hex}'))`
    );
  }

  return chunkId;
}
