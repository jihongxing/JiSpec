import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { AIConfig } from "../ai-provider";

export function loadAIConfigFromRoot(root: string): AIConfig | undefined {
  const projectPath = path.join(path.resolve(root), "jiproject", "project.yaml");
  if (!fs.existsSync(projectPath)) {
    return undefined;
  }

  const content = fs.readFileSync(projectPath, "utf-8");
  const parsed = yaml.load(content) as { ai?: AIConfig } | undefined;
  return parsed?.ai;
}
