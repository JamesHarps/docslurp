import ora from "ora";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { crawlUrl } from "../crawl.js";
import { crawlWithFirecrawl } from "../firecrawl.js";
import { crawlWithPlaywright } from "../playwright.js";
import { chunkDocuments } from "../chunk.js";
import { generateEmbeddings } from "../embed.js";
import { generateMcpServer } from "../generate.js";
import { getServersDir } from "../utils.js";

interface CreateOptions {
  name: string;
  depth: string;
  maxPages: string;
  firecrawl?: boolean;
  playwright?: boolean;
}

export async function createServer(url: string, options: CreateOptions): Promise<void> {
  const { name, depth, maxPages } = options;

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.red("\nError: OPENAI_API_KEY environment variable is required."));
    console.error(chalk.gray("Get your API key at: https://platform.openai.com/api-keys\n"));
    process.exit(1);
  }

  const serverDir = path.join(getServersDir(), name);

  // Check if server already exists
  if (fs.existsSync(serverDir)) {
    console.error(chalk.red(`\nError: Server "${name}" already exists.`));
    console.error(chalk.gray(`Run 'docslurp remove ${name}' to delete it first.\n`));
    process.exit(1);
  }

  console.log(chalk.bold(`\nCreating MCP server: ${name}`));
  console.log(chalk.gray(`Source: ${url}\n`));

  // Step 1: Crawl
  const crawlMethod = options.firecrawl ? "firecrawl" : options.playwright ? "playwright" : "default";
  const crawlSpinner = ora(
    crawlMethod === "firecrawl"
      ? "Crawling with Firecrawl..."
      : crawlMethod === "playwright"
      ? "Crawling with Playwright (this may take a while)..."
      : "Crawling documentation..."
  ).start();
  let documents;
  try {
    if (crawlMethod === "firecrawl") {
      documents = await crawlWithFirecrawl(url, {
        maxPages: parseInt(maxPages),
      });
    } else if (crawlMethod === "playwright") {
      documents = await crawlWithPlaywright(url, {
        maxDepth: parseInt(depth),
        maxPages: parseInt(maxPages),
      });
    } else {
      documents = await crawlUrl(url, {
        maxDepth: parseInt(depth),
        maxPages: parseInt(maxPages),
      });
    }
    crawlSpinner.succeed(`Found ${documents.length} pages`);
  } catch (error) {
    crawlSpinner.fail("Failed to crawl documentation");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  if (documents.length === 0) {
    console.error(chalk.red("\nNo pages found. Check the URL and try again.\n"));
    process.exit(1);
  }

  // Step 2: Chunk
  const chunkSpinner = ora("Chunking content...").start();
  const chunks = chunkDocuments(documents);
  chunkSpinner.succeed(`Created ${chunks.length} chunks`);

  // Step 3: Embed
  const embedSpinner = ora("Generating embeddings (this may take a minute)...").start();
  try {
    await generateEmbeddings(chunks);
    embedSpinner.succeed("Embeddings generated");
  } catch (error) {
    embedSpinner.fail("Failed to generate embeddings");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Step 4: Generate MCP server
  const generateSpinner = ora("Generating MCP server...").start();
  try {
    await generateMcpServer(name, url, chunks);
    generateSpinner.succeed("MCP server created");
  } catch (error) {
    generateSpinner.fail("Failed to generate MCP server");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Done!
  console.log(chalk.green("\n✓ Success!\n"));
  console.log(chalk.bold("To add to Claude Code:"));
  console.log(chalk.gray("  # Add to current project only"));
  console.log(chalk.cyan(`  claude mcp add ${name} -- node ${serverDir}/index.js\n`));
  console.log(chalk.gray("  # Add globally (available in all projects)"));
  console.log(chalk.cyan(`  claude mcp add -s user ${name} -- node ${serverDir}/index.js\n`));
}
