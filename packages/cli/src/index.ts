#!/usr/bin/env node

import { Command } from "commander";
import { createServer } from "./commands/create.js";
import { addToServer } from "./commands/add.js";
import { listServers } from "./commands/list.js";
import { removeServer } from "./commands/remove.js";
import { connectServer } from "./commands/connect.js";

const program = new Command();

program
  .name("docslurp")
  .description("Turn any documentation into an MCP server with RAG capabilities")
  .version("0.1.0");

program
  .command("create")
  .description("Create an MCP server from a documentation URL")
  .argument("<url>", "The documentation URL to crawl")
  .requiredOption("-n, --name <name>", "Name for the MCP server")
  .option("-d, --depth <number>", "Maximum crawl depth", "3")
  .option("-m, --max-pages <number>", "Maximum pages to crawl", "100")
  .option("-f, --firecrawl", "Use Firecrawl for JS-rendered sites")
  .option("-p, --playwright", "Use Playwright for JS-rendered sites (slower but free)")
  .action(async (url, options) => {
    await createServer(url, options);
  });

// Shorthand: docslurp <url> --name <name>
program
  .argument("[url]", "The documentation URL to crawl")
  .option("-n, --name <name>", "Name for the MCP server")
  .option("-d, --depth <number>", "Maximum crawl depth", "3")
  .option("-m, --max-pages <number>", "Maximum pages to crawl", "100")
  .option("-f, --firecrawl", "Use Firecrawl for JS-rendered sites")
  .option("-p, --playwright", "Use Playwright for JS-rendered sites (slower but free)")
  .action(async (url, options) => {
    if (url && options.name) {
      await createServer(url, options);
    }
  });

program
  .command("add")
  .description("Add more documentation to an existing server")
  .argument("<url>", "The documentation URL to add")
  .requiredOption("-t, --to <name>", "Name of the server to add to")
  .option("-d, --depth <number>", "Maximum crawl depth", "3")
  .option("-m, --max-pages <number>", "Maximum pages to crawl", "100")
  .option("-f, --firecrawl", "Use Firecrawl for JS-rendered sites")
  .option("-p, --playwright", "Use Playwright for JS-rendered sites (slower but free)")
  .action(async (url, options) => {
    await addToServer(url, options);
  });

program
  .command("list")
  .description("List all created MCP servers")
  .action(async () => {
    await listServers();
  });

program
  .command("remove")
  .description("Remove an MCP server")
  .argument("<name>", "Name of the server to remove")
  .action(async (name) => {
    await removeServer(name);
  });

program
  .command("connect")
  .description("Get the claude mcp add command for a server")
  .argument("<name>", "Name of the server")
  .action(async (name) => {
    await connectServer(name);
  });

program.parse();
