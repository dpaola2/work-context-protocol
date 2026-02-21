import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import type { WcpConfig } from "@wcp/shared";

export function readConfig(dataPath: string): WcpConfig {
  const configPath = path.join(dataPath, ".wcp", "config.yaml");
  const raw = fs.readFileSync(configPath, "utf-8");
  return yaml.load(raw) as WcpConfig;
}

export function writeConfig(dataPath: string, config: WcpConfig): void {
  const configPath = path.join(dataPath, ".wcp", "config.yaml");
  fs.writeFileSync(configPath, yaml.dump(config), "utf-8");
}
