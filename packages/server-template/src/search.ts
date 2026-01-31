import OpenAI from "openai";
import { VectorStore } from "./vectorstore.js";

const openai = new OpenAI();

/**
 * Generate an embedding for the given text using OpenAI's API.
 */
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Search the documentation for passages relevant to the query.
 * Returns formatted results with titles, content, and source URLs.
 */
export async function search(
  store: VectorStore,
  query: string,
  limit: number
): Promise<string> {
  const embedding = await getEmbedding(query);
  const results = store.findSimilar(embedding, limit);

  if (results.length === 0) {
    return "No results found.";
  }

  return results
    .map(
      (r, i) => `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`
    )
    .join("\n\n---\n\n");
}

/**
 * Answer a question using the documentation as context.
 * Returns relevant passages with their source URLs.
 */
export async function ask(
  store: VectorStore,
  question: string
): Promise<string> {
  const embedding = await getEmbedding(question);
  const results = store.findSimilar(embedding, 5);

  if (results.length === 0) {
    return "I couldn't find any relevant information in the documentation.";
  }

  const context = results.map((r) => r.content).join("\n\n");
  const sources = [...new Set(results.map((r) => r.url))];

  return `Based on the documentation:\n\n${context}\n\nSources:\n${sources.map((s) => `- ${s}`).join("\n")}`;
}

/**
 * List all indexed documentation pages.
 */
export function listSources(store: VectorStore): string {
  const pages = store.getSources();

  if (pages.length === 0) {
    return "No pages have been indexed.";
  }

  const list = pages.map((p) => `- ${p.title}: ${p.url}`).join("\n");
  return `Indexed ${pages.length} pages:\n\n${list}`;
}
