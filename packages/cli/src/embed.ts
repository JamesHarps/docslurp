import OpenAI from "openai";
import { DocumentChunk } from "./chunk.js";

const BATCH_SIZE = 25;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generates embeddings for document chunks using OpenAI's API.
 * Processes in batches with retry logic for rate limits.
 */
export async function generateEmbeddings(chunks: DocumentChunk[]): Promise<void> {
  const openai = new OpenAI();

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    let retries = 0;
    let success = false;

    while (!success && retries < MAX_RETRIES) {
      try {
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: texts,
        });

        for (let j = 0; j < batch.length; j++) {
          batch[j].embedding = response.data[j].embedding;
        }
        success = true;
      } catch (error: unknown) {
        const isRateLimit =
          error instanceof Error &&
          "status" in error &&
          (error as { status: number }).status === 429;

        if (isRateLimit) {
          retries++;
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = BASE_DELAY_MS * Math.pow(2, retries - 1);

          // Check for retry-after header
          let retryAfterMs = delay;
          if (error && typeof error === "object" && "headers" in error) {
            const headers = (error as { headers?: Record<string, string> }).headers;
            if (headers?.["retry-after-ms"]) {
              retryAfterMs = Math.max(parseInt(headers["retry-after-ms"], 10) + 100, delay);
            }
          }

          if (retries < MAX_RETRIES) {
            await sleep(retryAfterMs);
          } else {
            throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries`);
          }
        } else {
          throw error;
        }
      }
    }

    // Delay between batches to stay under rate limits
    if (i + BATCH_SIZE < chunks.length) {
      await sleep(500);
    }
  }
}
