import OpenAI from "openai";
import { DocumentChunk } from "./chunk.js";

const BATCH_SIZE = 50;

/**
 * Generates embeddings for document chunks using OpenAI's API.
 * Processes in batches to avoid rate limits.
 */
export async function generateEmbeddings(chunks: DocumentChunk[]): Promise<void> {
  const openai = new OpenAI();

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });

    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = response.data[j].embedding;
    }

    // Small delay between batches to be nice to the API
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
