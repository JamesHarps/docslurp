import chalk from "chalk";
import fs from "fs";
import path from "path";
import { getServersDir } from "../utils.js";

interface ServerConfig {
  name: string;
  sourceUrl: string;
  createdAt: string;
  pageCount: number;
  chunkCount: number;
}

export async function listServers(): Promise<void> {
  const serversDir = getServersDir();

  if (!fs.existsSync(serversDir)) {
    console.log(chalk.gray("\nNo servers created yet."));
    console.log(chalk.gray("Run 'docslurp <url> --name <name>' to create one.\n"));
    return;
  }

  const entries = fs.readdirSync(serversDir, { withFileTypes: true });
  const servers: ServerConfig[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(serversDir, entry.name, "config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        servers.push(config);
      }
    }
  }

  if (servers.length === 0) {
    console.log(chalk.gray("\nNo servers created yet."));
    console.log(chalk.gray("Run 'docslurp <url> --name <name>' to create one.\n"));
    return;
  }

  console.log(chalk.bold("\nYour MCP Servers:\n"));

  for (const server of servers) {
    console.log(chalk.cyan(`  ${server.name}`));
    console.log(chalk.gray(`    Source: ${server.sourceUrl}`));
    console.log(chalk.gray(`    Pages: ${server.pageCount} | Chunks: ${server.chunkCount}`));
    console.log(chalk.gray(`    Created: ${new Date(server.createdAt).toLocaleDateString()}`));
    console.log();
  }
}
