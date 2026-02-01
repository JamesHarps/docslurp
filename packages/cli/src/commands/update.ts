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
  getSources,
  findSourceByUrl,
  deleteChunksForSource,
  rebuildVectorTable,
  insertChunkWithEmbedding,
  updateSourceMetadata,
  clearCrawlState,
  Source,
} from "../db-utils.js";

interface UpdateOptions {
  depth?: string;
  maxPages?: string;
  firecrawl?: boolean;
  playwright?: boolean;
  url?: string;
}

/**
 * Update (re-scrape) sources for an MCP server.
 */
export async function updateServer(serverName: string, options: UpdateOptions): Promise<void> {
  const serverDir = path.join(getServersDir(), serverName);
  const configPath = path.join(serverDir, "config.json");
  const dbPath = path.join(serverDir, "vectors.db");

  // Check if server exists
  if (!fs.existsSync(serverDir)) {
    console.error(chalk.red(`Server "${serverName}" doesn't exist.`));
    console.error(chalk.gray(`Run: docslurp list to see available servers.`));
    process.exit(1);
  }

  const maxDepth = parseInt(options.depth || "3", 10);
  const maxPages = parseInt(options.maxPages || "100", 10);

  // Open database and run migrations
  const db = openDatabase(dbPath);
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Migrate legacy config sources to database
  const legacySources = config.sources || (config.sourceUrl ? [{ url: config.sourceUrl, addedAt: config.createdAt }] : []);
  migrateDatabase(db, legacySources);

  // Determine which sources to update
  let sourcesToUpdate: Source[];

  if (options.url) {
    const source = findSourceByUrl(db, options.url);
    if (!source) {
      console.error(chalk.red(`Source "${options.url}" not found.`));
      console.error(chalk.gray(`Run: docslurp sources ${serverName} to see available sources.`));
      db.close();
      process.exit(1);
    }
    sourcesToUpdate = [source];
  } else {
    sourcesToUpdate = getSources(db);
  }

  if (sourcesToUpdate.length === 0) {
    console.error(chalk.red(`No sources to update.`));
    db.close();
    process.exit(1);
  }

  console.log(chalk.blue(`\nUpdating ${sourcesToUpdate.length} source(s) for ${serverName}\n`));

  const crawlMethod = options.firecrawl ? "firecrawl" : options.playwright ? "playwright" : "default";
  let totalPages = 0;
  let totalChunks = 0;

  for (const source of sourcesToUpdate) {
    console.log(chalk.cyan(`\n→ ${source.url}`));

    // Delete old chunks for this source
    const deletedCount = deleteChunksForSource(db, source.id);
    console.log(chalk.gray(`  Removed ${deletedCount} old chunks`));

    // Crawl
    const crawlSpinner = ora(
      crawlMethod === "firecrawl"
        ? "  Crawling with Firecrawl..."
        : crawlMethod === "playwright"
        ? "  Crawling with Playwright..."
        : "  Crawling pages..."
    ).start();

    let documents;
    try {
      if (crawlMethod === "firecrawl") {
        documents = await crawlWithFirecrawl(source.url, { maxPages });
      } else if (crawlMethod === "playwright") {
        documents = await crawlWithPlaywright(source.url, { maxDepth, maxPages });
      } else {
        documents = await crawlUrl(source.url, { maxDepth, maxPages });
      }
      crawlSpinner.succeed(`  Crawled ${documents.length} pages`);
    } catch (error) {
      crawlSpinner.fail(`  Failed to crawl: ${(error as Error).message}`);
      continue; // Skip this source but continue with others
    }

    if (documents.length === 0) {
      console.log(chalk.yellow("  No content found, skipping"));
      continue;
    }

    // Chunk
    const chunkSpinner = ora("  Chunking content...").start();
    const chunks = chunkDocuments(documents);
    chunkSpinner.succeed(`  Created ${chunks.length} chunks`);

    // Embed
    const embedSpinner = ora("  Generating embeddings...").start();
    await generateEmbeddings(chunks);
    embedSpinner.succeed("  Embeddings generated");

    // Insert new chunks
    for (const chunk of chunks) {
      insertChunkWithEmbedding(db, chunk, source.id);
    }

    // Update source metadata
    const pageCount = new Set(chunks.map((c) => c.url)).size;
    updateSourceMetadata(db, source.id, pageCount, chunks.length);
    clearCrawlState(db, source.id);

    totalPages += pageCount;
    totalChunks += chunks.length;

    console.log(chalk.green(`  ✓ Updated with ${pageCount} pages, ${chunks.length} chunks`));
  }

  // Rebuild vector table once after all updates
  const rebuildSpinner = ora("Rebuilding vector index...").start();
  rebuildVectorTable(db);
  rebuildSpinner.succeed("Vector index rebuilt");

  db.close();

  // Update config.json
  config.pageCount = totalPages;
  config.chunkCount = totalChunks;
  config.updatedAt = new Date().toISOString();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green(`\n✓ Update complete!`));
  console.log(chalk.gray(`  Total: ${totalPages} pages, ${totalChunks} chunks across ${sourcesToUpdate.length} source(s)`));
}
