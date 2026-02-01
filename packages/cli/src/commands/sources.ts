import fs from "fs";
import path from "path";
import chalk from "chalk";
import { getServersDir } from "../utils.js";
import { openDatabase, migrateDatabase, getSources } from "../db-utils.js";

/**
 * List all sources for an MCP server.
 */
export async function listSources(serverName: string): Promise<void> {
  const serverDir = path.join(getServersDir(), serverName);
  const configPath = path.join(serverDir, "config.json");
  const dbPath = path.join(serverDir, "vectors.db");

  // Check if server exists
  if (!fs.existsSync(serverDir)) {
    console.error(chalk.red(`Server "${serverName}" doesn't exist.`));
    console.error(chalk.gray(`Run: docslurp list to see available servers.`));
    process.exit(1);
  }

  // Open database and run migrations
  const db = openDatabase(dbPath);
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Migrate legacy config sources to database
  const legacySources = config.sources || (config.sourceUrl ? [{ url: config.sourceUrl, addedAt: config.createdAt }] : []);
  migrateDatabase(db, legacySources);

  // Get sources from database
  const sources = getSources(db);
  db.close();

  if (sources.length === 0) {
    console.log(chalk.yellow(`\nNo sources found for "${serverName}".`));
    return;
  }

  console.log(chalk.blue(`\nSources for ${serverName}:\n`));
  console.log(chalk.gray("ID  URL                                              Pages  Chunks  Added"));
  console.log(chalk.gray("─".repeat(80)));

  for (const source of sources) {
    const urlDisplay = source.url.length > 45 ? source.url.substring(0, 42) + "..." : source.url.padEnd(45);
    const addedDate = new Date(source.added_at).toLocaleDateString();
    const hasResume = source.crawl_state ? chalk.yellow(" (resumable)") : "";

    console.log(
      `${String(source.id).padStart(2)}  ${urlDisplay}  ${String(source.page_count).padStart(5)}  ${String(source.chunk_count).padStart(6)}  ${addedDate}${hasResume}`
    );
  }

  console.log(chalk.gray("─".repeat(80)));
  console.log(chalk.gray(`Total: ${sources.length} source(s)\n`));

  console.log(chalk.gray("To update a specific source:"));
  console.log(chalk.gray(`  docslurp update ${serverName} --url <url>\n`));
}
