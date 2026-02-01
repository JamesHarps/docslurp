import chalk from "chalk";
import fs from "fs";
import path from "path";
import { getServersDir } from "../utils.js";

export async function connectServer(name: string): Promise<void> {
  const serverDir = path.join(getServersDir(), name);

  if (!fs.existsSync(serverDir)) {
    console.error(chalk.red(`\nError: Server "${name}" not found.\n`));
    console.log(chalk.gray("Run 'docslurp list' to see available servers.\n"));
    process.exit(1);
  }

  console.log(chalk.bold("\nTo add this server to Claude Code:\n"));
  console.log(chalk.gray("  # Add to current project only"));
  console.log(chalk.cyan(`  claude mcp add ${name} -- node ${serverDir}/index.js\n`));
  console.log(chalk.gray("  # Add globally (available in all projects)"));
  console.log(chalk.cyan(`  claude mcp add -s user ${name} -- node ${serverDir}/index.js\n`));
  console.log(chalk.gray("After adding, restart Claude Code and check with /mcp\n"));
}
