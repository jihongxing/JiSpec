import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FIXTURE_ENTRIES = [
  "agents",
  "contexts",
  "docs",
  "jiproject",
  "schemas",
] as const;

export const FIXED_GENERATED_AT = "2026-04-27T00:00:00.000Z";

export function getRepoRoot(): string {
  const candidateRoot = path.resolve(__dirname, "..", "..", "..");

  for (const entry of FIXTURE_ENTRIES) {
    const entryPath = path.join(candidateRoot, entry);
    if (!fs.existsSync(entryPath)) {
      continue;
    }

    try {
      const realEntryPath = fs.realpathSync(entryPath);
      const realRoot = path.dirname(realEntryPath);
      if (realRoot !== candidateRoot && fs.existsSync(path.join(realRoot, "tools", "jispec", "cli.ts"))) {
        return realRoot;
      }
    } catch {
      continue;
    }
  }

  return candidateRoot;
}

export function createVerifyFixture(prefix: string): string {
  const repoRoot = getRepoRoot();
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `jispec-${prefix}-`));

  for (const entry of FIXTURE_ENTRIES) {
    fs.cpSync(path.join(repoRoot, entry), path.join(fixtureRoot, entry), { recursive: true, dereference: true });
  }

  return fixtureRoot;
}

export function cleanupVerifyFixture(fixtureRoot: string): void {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
