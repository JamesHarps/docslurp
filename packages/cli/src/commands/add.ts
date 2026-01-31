import fs from "fs";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { crawlUrl } from "../crawl.js";
import { crawlWithFirecrawl } from "../firecrawl.js";
import { chunkDocuments } from "../chunk.js";
import { generateEmbeddings } from "../embed.js";
import { getServersDir } from "../utils.js";

interface AddOptions {
  to: string;
  depth?: string;
  maxPages?: string;
  firecrawl?: boolean;
}

/**
 * Add more documentation to an existing MCP server.
 */
export async function addToServer(url: string, options: AddOptions): Promise<void> {
  const serverName = options.to;
  const serverDir = path.join(getServersDir(), serverName);
  const configPath = path.join(serverDir, "config.json");
  const dbPath = path.join(serverDir, "vectors.db");

  // Check if server exists
  if (!fs.existsSync(serverDir)) {
    console.error(chalk.red(`Server "${serverName}" doesn't exist.`));
    console.error(chalk.gray(`Run: docslurp ${url} --name ${serverName}`));
    process.exit(1);
  }

  const maxDepth = parseInt(options.depth || "3", 10);
  const maxPages = parseInt(options.maxPages || "100", 10);

  console.log(chalk.blue(`\nAdding docs to ${serverName}\n`));

  // Crawl
  const useFirecrawl = options.firecrawl;
  const crawlSpinner = ora(
    useFirecrawl ? "Crawling with Firecrawl..." : "Crawling pages..."
  ).start();

  let documents;
  if (useFirecrawl) {
    documents = await crawlWithFirecrawl(url, { maxPages });
  } else {
    documents = await crawlUrl(url, { maxDepth, maxPages });
  }
  crawlSpinner.succeed(`Crawled ${documents.length} pages`);

  if (documents.length === 0) {
    console.error(chalk.red("No content found. Check the URL."));
    process.exit(1);
  }

  // Chunk
  const chunkSpinner = ora("Chunking content...").start();
  const chunks = chunkDocuments(documents);
  chunkSpinner.succeed(`Created ${chunks.length} chunks`);

  // Embed
  const embedSpinner = ora("Generating embeddings...").start();
  await generateEmbeddings(chunks);
  embedSpinner.succeed("Embeddings generated");

  // Add to existing database
  const dbSpinner = ora("Adding to database...").start();

  const db = new Database(dbPath);
  // Disable BigInt mode so rowids are regular numbers (sqlite-vec requires this)
  db.defaultSafeIntegers(false);
  sqliteVec.load(db);

  const insertChunk = db.prepare(
    "INSERT INTO chunks (content, url, title, chunk_index) VALUES (?, ?, ?, ?)"
  );

  // Get the current max ID to continue from
  const maxIdResult = db.prepare("SELECT MAX(id) as maxId FROM chunks").get() as { maxId: number | null };
  const startRowId = (maxIdResult?.maxId || 0) + 1;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    insertChunk.run(
      chunk.content,
      chunk.url,
      chunk.title,
      chunk.chunkIndex
    );

    if (chunk.embedding) {
      const embeddingBuffer = new Float32Array(chunk.embedding).buffer;
      const embeddingBytes = new Uint8Array(embeddingBuffer);
      // Use raw SQL with vec_f32 function to insert the embedding
      db.exec(`INSERT INTO vec_chunks (rowid, embedding) VALUES (${startRowId + i}, vec_f32(x'${Buffer.from(embeddingBytes).toString('hex')}'))`);
    }
  }
  db.close();
  dbSpinner.succeed("Added to database");

  // Update config
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  if (!config.sources) {
    // Migrate old single-source config to multi-source
    config.sources = [{ url: config.sourceUrl, addedAt: config.createdAt }];
  }

  config.sources.push({ url, addedAt: new Date().toISOString() });
  config.pageCount = (config.pageCount || 0) + new Set(chunks.map((c) => c.url)).size;
  config.chunkCount = (config.chunkCount || 0) + chunks.length;
  config.updatedAt = new Date().toISOString();

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green(`\nDone! Added ${documents.length} pages to ${serverName}`));
  console.log(chalk.gray(`\nTotal sources: ${config.sources.length}`));
  config.sources.forEach((s: { url: string }) => {
    console.log(chalk.gray(`  - ${s.url}`));
  });
}
