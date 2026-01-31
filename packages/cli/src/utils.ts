import path from "path";
import os from "os";

export function getServersDir(): string {
  return path.join(os.homedir(), ".docslurp", "servers");
}

export function getDataDir(): string {
  return path.join(os.homedir(), ".docslurp");
}
