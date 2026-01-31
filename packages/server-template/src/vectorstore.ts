import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SearchResult {
  content: string;
  url: string;
  title: string;
  distance: number;
}

export interface SourcePage {
  url: string;
  title: string;
}

/**
 * Handles all vector database operations.
 * Uses SQLite with the sqlite-vec extension for efficient similarity search.
 */
export class VectorStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(__dirname, "vectors.db");
    this.db = new Database(resolvedPath);
    sqliteVec.load(this.db);
  }

  /**
   * Find chunks similar to the given embedding vector.
   */
  findSimilar(embedding: number[], limit: number): SearchResult[] {
    const embeddingBuffer = new Float32Array(embedding).buffer;

    const results = this.db
      .prepare(
        `
      SELECT
        chunks.content,
        chunks.url,
        chunks.title,
        vec_chunks.distance
      FROM vec_chunks
      LEFT JOIN chunks ON chunks.id = vec_chunks.rowid
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `
      )
      .all(new Uint8Array(embeddingBuffer), limit) as SearchResult[];

    return results;
  }

  /**
   * Get all unique source pages in the database.
   */
  getSources(): SourcePage[] {
    return this.db
      .prepare("SELECT DISTINCT url, title FROM chunks ORDER BY title")
      .all() as SourcePage[];
  }

  close() {
    this.db.close();
  }
}
