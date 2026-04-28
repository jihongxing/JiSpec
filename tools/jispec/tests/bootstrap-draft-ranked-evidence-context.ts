import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Draft Ranked Evidence Context Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-draft-ranked-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");

    if (!domainArtifact) {
      throw new Error("Expected domain artifact to exist.");
    }

    results.push({
      name: "draft quality summary includes ranked evidence signals",
      passed:
        draftResult.qualitySummary.manifestSignalsUsed.some((entry) => entry.includes("docs/governance/README.md")) &&
        draftResult.qualitySummary.manifestSignalsUsed.some((entry) => entry.includes("api/proto/control-plane.proto")),
      error: `Expected ranked evidence signals in quality summary, got ${JSON.stringify(draftResult.qualitySummary)}.`,
    });

    results.push({
      name: "ranked evidence influences primary contexts instead of raw source volume",
      passed:
        draftResult.qualitySummary.primaryContextNames.includes("governance") &&
        draftResult.qualitySummary.primaryContextNames.includes("control-plane") &&
        !draftResult.qualitySummary.primaryContextNames.includes("src") &&
        !draftResult.qualitySummary.primaryContextNames.includes("package"),
      error: `Expected semantic primary contexts, got ${JSON.stringify(draftResult.qualitySummary.primaryContextNames)}.`,
    });

    results.push({
      name: "domain artifact carries high-value ranked sources",
      passed:
        domainArtifact.content.includes("docs/governance/README.md") &&
        domainArtifact.content.includes("api/proto/control-plane.proto") &&
        domainArtifact.content.includes("schemas/schema.prisma"),
      error: `Expected domain draft to carry ranked sources, got ${domainArtifact.content}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap draft ranked evidence context execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function seedRepository(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "# Control Plane Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "control-plane-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "README.md"), "# Governance\n\nPolicy approval and audit trail.\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "control-plane.proto"),
    'syntax = "proto3";\nservice ControlPlane { rpc ApplyPolicy (PolicyRequest) returns (PolicyResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "schema.prisma"), "model AuditLog { id String @id }\n", "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  for (let index = 0; index < 12; index += 1) {
    fs.writeFileSync(path.join(root, "src", `helper-${index}.ts`), `export const helper${index} = ${index};\n`, "utf-8");
  }
}

void main();
