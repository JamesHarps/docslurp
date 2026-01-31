import chalk from "chalk";
import fs from "fs";
import path from "path";
import { getServersDir } from "../utils.js";

export async function removeServer(name: string): Promise<void> {
  const serverDir = path.join(getServersDir(), name);

  if (!fs.existsSync(serverDir)) {
    console.error(chalk.red(`\nError: Server "${name}" not found.\n`));
    console.log(chalk.gray("Run 'docslurp list' to see available servers.\n"));
    process.exit(1);
  }

  // Remove the directory recursively
  fs.rmSync(serverDir, { recursive: true, force: true });

  console.log(chalk.green(`\n✓ Removed server: ${name}\n`));
  console.log(chalk.gray("Don't forget to remove it from Claude Code:"));
  console.log(chalk.cyan(`  claude mcp remove ${name}\n`));
}
