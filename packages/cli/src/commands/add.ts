import fs from "fs";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import { crawlUrl } from "../crawl.js";
import { crawlWithFirecrawl } from "../firecrawl.js";
import { crawlWithPlaywright } from "../playwright.js";
import { chunkDocuments } from "../chunk.js";
import { generateEmbeddings } from "../embed.js";
import { getServersDir } from "../utils.js";
import {
  openDatabase,
  migrateDatabase,
  findSourceByUrl,
  getOrCreateSource,
  deleteChunksForSource,
  rebuildVectorTable,
  insertChunkWithEmbedding,
  updateSourceMetadata,
  getCrawlState,
  saveCrawlState,
  clearCrawlState,
} from "../db-utils.js";

interface AddOptions {
  to: string;
  depth?: string;
  maxPages?: string;
  firecrawl?: boolean;
  playwright?: boolean;
  force?: boolean;
  continue?: boolean;
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

  // Open database and run migrations
  const db = openDatabase(dbPath);
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Migrate legacy config sources to database
  const legacySources = config.sources || (config.sourceUrl ? [{ url: config.sourceUrl, addedAt: config.createdAt }] : []);
  migrateDatabase(db, legacySources);

  // Check for existing source (deduplication)
  const existingSource = findSourceByUrl(db, url);
  let sourceId: number;
  let isUpdate = false;

  if (existingSource && !options.force) {
    // Handle continue option
    if (options.continue) {
      const crawlState = getCrawlState(db, existingSource.id);
      if (!crawlState || !crawlState.pendingUrls?.length) {
        console.error(chalk.red("No pending crawl to continue for this URL."));
        console.error(chalk.gray("Use without --continue to start fresh."));
        db.close();
        process.exit(1);
      }
      console.log(chalk.yellow(`Resuming crawl with ${crawlState.pendingUrls.length} pending URLs...`));
      sourceId = existingSource.id;
      // TODO: Pass crawlState to crawler when resume is fully implemented
    } else {
      console.log(chalk.yellow(`\nSource already exists. Updating (replacing old content)...`));

      // Delete old chunks for this source
      const deletedCount = deleteChunksForSource(db, existingSource.id);
      console.log(chalk.gray(`Removed ${deletedCount} old chunks`));

      sourceId = existingSource.id;
      isUpdate = true;
    }
  } else {
    // Create new source
    sourceId = getOrCreateSource(db, url);
  }

  // Crawl
  const crawlMethod = options.firecrawl ? "firecrawl" : options.playwright ? "playwright" : "default";
  const crawlSpinner = ora(
    crawlMethod === "firecrawl"
      ? "Crawling with Firecrawl..."
      : crawlMethod === "playwright"
      ? "Crawling with Playwright (this may take a while)..."
      : "Crawling pages..."
  ).start();

  let documents;
  if (crawlMethod === "firecrawl") {
    documents = await crawlWithFirecrawl(url, { maxPages });
  } else if (crawlMethod === "playwright") {
    documents = await crawlWithPlaywright(url, { maxDepth, maxPages });
  } else {
    documents = await crawlUrl(url, { maxDepth, maxPages });
  }
  crawlSpinner.succeed(`Crawled ${documents.length} pages`);

  if (documents.length === 0) {
    console.error(chalk.red("No content found. Check the URL."));
    db.close();
    process.exit(1);
  }

  // Check if max pages was hit (for resume feature)
  const maxPagesReached = documents.length >= maxPages;
  if (maxPagesReached) {
    console.log(chalk.yellow(`\nHit max-pages limit (${maxPages}). Use --continue to crawl more.`));
    // TODO: Save pending URLs when crawler supports returning them
  }

  // Chunk
  const chunkSpinner = ora("Chunking content...").start();
  const chunks = chunkDocuments(documents);
  chunkSpinner.succeed(`Created ${chunks.length} chunks`);

  // Embed
  const embedSpinner = ora("Generating embeddings...").start();
  await generateEmbeddings(chunks);
  embedSpinner.succeed("Embeddings generated");

  // Add to database
  const dbSpinner = ora("Adding to database...").start();

  for (const chunk of chunks) {
    insertChunkWithEmbedding(db, chunk, sourceId);
  }

  // Update source metadata
  const pageCount = new Set(chunks.map((c) => c.url)).size;
  updateSourceMetadata(db, sourceId, pageCount, chunks.length);

  // If we deleted chunks (update), rebuild the vector table
  if (isUpdate) {
    rebuildVectorTable(db);
  }

  // Clear crawl state if crawl completed successfully
  if (!maxPagesReached) {
    clearCrawlState(db, sourceId);
  }

  db.close();
  dbSpinner.succeed("Added to database");

  // Update config.json for backwards compatibility
  if (!config.sources) {
    config.sources = legacySources;
  }

  // Only add to sources if it's a new source
  if (!existingSource || options.force) {
    config.sources.push({ url, addedAt: new Date().toISOString() });
  }

  // Recalculate totals
  config.pageCount = (config.pageCount || 0) + pageCount;
  config.chunkCount = (config.chunkCount || 0) + chunks.length;
  config.updatedAt = new Date().toISOString();

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const action = isUpdate ? "Updated" : "Added";
  console.log(chalk.green(`\nDone! ${action} ${documents.length} pages in ${serverName}`));
  console.log(chalk.gray(`\nTotal sources: ${config.sources.length}`));
  config.sources.forEach((s: { url: string }) => {
    console.log(chalk.gray(`  - ${s.url}`));
  });
}
