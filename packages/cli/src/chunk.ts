import { CrawledDocument } from "./crawl.js";

export interface DocumentChunk {
  content: string;
  url: string;
  title: string;
  chunkIndex: number;
  embedding?: number[];
}

const CHUNK_SIZE = 500; // tokens (roughly 4 chars per token)
const CHUNK_OVERLAP = 50;

/**
 * Splits documents into smaller chunks for embedding.
 * Uses a simple character-based approach with overlap to maintain context.
 */
export function chunkDocuments(documents: CrawledDocument[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const charSize = CHUNK_SIZE * 4; // Approximate chars per chunk
  const charOverlap = CHUNK_OVERLAP * 4;

  for (const doc of documents) {
    const text = doc.content;

    // For short documents, keep as single chunk
    if (text.length <= charSize) {
      chunks.push({
        content: text,
        url: doc.url,
        title: doc.title,
        chunkIndex: 0,
      });
      continue;
    }

    // Split into overlapping chunks
    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      let end = start + charSize;

      // Try to end at a sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf(".", end);
        const lastNewline = text.lastIndexOf("\n", end);
        const boundary = Math.max(lastPeriod, lastNewline);

        if (boundary > start + charSize / 2) {
          end = boundary + 1;
        }
      }

      const chunkText = text.slice(start, end).trim();

      if (chunkText.length > 50) {
        chunks.push({
          content: chunkText,
          url: doc.url,
          title: doc.title,
          chunkIndex,
        });
        chunkIndex++;
      }

      start = end - charOverlap;
    }
  }

  return chunks;
}
