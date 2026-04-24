import path from "node:path";
import { validateRepository } from "../tools/jispec/validator";

async function main(): Promise<number> {
  const repoRoot = path.resolve(__dirname, "..");
  const result = validateRepository(repoRoot);
  console.log(result.renderText());
  return result.ok ? 0 : 1;
}

void main().then((code) => {
  process.exitCode = code;
});
