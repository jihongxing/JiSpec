import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { scoreEvidenceAsset, type AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Bootstrap Evidence Ranking Score Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-ranking-score-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const rankedPath = path.join(tempRoot, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
    const ranked = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
    const rankedPaths = ranked.evidence.map((entry) => entry.path);
    const rankedSourceFiles = ranked.evidence.flatMap((entry) => entry.sourceFiles);

    results.push({
      name: "business semantic scoring promotes governance docs and protocol schemas",
      passed:
        ranked.evidence[0]?.path === "docs/governance/README.md" &&
        rankedPaths.indexOf("api/proto/control-plane.proto") >= 0 &&
        rankedPaths.indexOf("schemas/schema.prisma") >= 0 &&
        rankedPaths.indexOf("package.json") > rankedPaths.indexOf("api/proto/control-plane.proto"),
      error: `Expected governance/protocol/schema assets to outrank package manifest, got ${JSON.stringify(ranked.evidence)}`,
    });

    results.push({
      name: "source inventory promotes Go interfaces, Rust traits, entrypoints, and SDK surfaces",
      passed:
        rankedSourceFiles.includes("internal/ports/gateway.go") &&
        rankedSourceFiles.includes("crates/core/src/lib.rs") &&
        rankedSourceFiles.includes("cmd/server/main.go") &&
        rankedSourceFiles.includes("sdk/client.ts"),
      error: `Expected semantic source surfaces to appear in ranked source files, got ${JSON.stringify(ranked.evidence)}`,
    });

    const protoScore = scoreEvidenceAsset({
      kind: "schema",
      path: "api/proto/gateway.proto",
      confidenceScore: 0.98,
      schemaFormat: "protobuf",
    });
    const vendorManifestScore = scoreEvidenceAsset({
      kind: "manifest",
      path: "vendor/pandas/pyproject.toml",
      confidenceScore: 0.98,
      manifestKind: "pyproject",
    });
    const stubScore = scoreEvidenceAsset({
      kind: "source",
      path: "src/generated/client.stub.ts",
      confidenceScore: 0.8,
      sourceCategory: "service",
    });

    results.push({
      name: "scoreEvidenceAsset penalizes third-party mirrors and generated stubs",
      passed:
        protoScore.score > vendorManifestScore.score &&
        protoScore.score > stubScore.score &&
        vendorManifestScore.reasons.includes("third-party or audit mirror asset") &&
        stubScore.reasons.includes("generated or stub-like asset"),
      error: `Expected proto to outrank vendor/stub assets, got proto=${JSON.stringify(protoScore)}, vendor=${JSON.stringify(vendorManifestScore)}, stub=${JSON.stringify(stubScore)}.`,
    });

    const governanceDoc = ranked.evidence.find((entry) => entry.path === "docs/governance/README.md");
    const protoSchema = ranked.evidence.find((entry) => entry.path === "api/proto/control-plane.proto");
    const explicitEndpoint = ranked.evidence.find((entry) => entry.path === "/orders");
    const entrypoint = ranked.evidence.find((entry) => entry.path === "cmd/server/main.go");
    const weakCandidate = ranked.evidence.find((entry) => entry.path === "src/controllers/unknown-controller.ts");

    results.push({
      name: "boundary-first ranking labels strong surfaces and keeps weak candidates behind them",
      passed:
        governanceDoc?.metadata?.boundarySignal === "governance_document" &&
        protoSchema?.metadata?.boundarySignal === "schema_truth_source" &&
        explicitEndpoint?.metadata?.boundarySignal === "explicit_endpoint" &&
        entrypoint?.metadata?.boundarySignal === "service_entrypoint" &&
        weakCandidate?.metadata?.boundarySignal === "weak_candidate" &&
        governanceDoc?.rankTier === "adoption_ready" &&
        protoSchema?.rankTier === "adoption_ready" &&
        explicitEndpoint?.rankTier === "adoption_ready" &&
        entrypoint?.rankTier === "adoption_ready" &&
        weakCandidate?.rankTier === "owner_review" &&
        (ranked.summary.adoptionReadyCount ?? 0) > (ranked.summary.ownerReviewCount ?? 0) &&
        rankedPaths.indexOf("/orders") < rankedPaths.indexOf("src/controllers/unknown-controller.ts") &&
        rankedPaths.indexOf("api/proto/control-plane.proto") < rankedPaths.indexOf("src/controllers/unknown-controller.ts"),
      error: `Expected boundarySignal metadata and weak-candidate ordering, got ${JSON.stringify(ranked.evidence)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap evidence ranking score execution",
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
  writeProject(root, ["network-gateway", "finance-portfolio"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Semantic Ranking Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "semantic-ranking-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "README.md"), "# Governance\n\nControl-plane approval policy.\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "control-plane.proto"),
    'syntax = "proto3";\nservice ControlPlane { rpc ApplyPolicy (PolicyRequest) returns (PolicyResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "schema.prisma"), "model Policy { id String @id }\n", "utf-8");

  fs.mkdirSync(path.join(root, "internal", "ports"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "internal", "ports", "gateway.go"),
    "package ports\n\ntype Gateway interface {\n  ApplyPolicy(id string) error\n}\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "crates", "core", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "crates", "core", "src", "lib.rs"), "pub trait SessionRecovery { fn recover(&self); }\n", "utf-8");

  fs.mkdirSync(path.join(root, "cmd", "server"), { recursive: true });
  fs.writeFileSync(path.join(root, "cmd", "server", "main.go"), "package main\nfunc main() {}\n", "utf-8");

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "orders.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "controllers"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "controllers", "unknown-controller.ts"), "export class UnknownController {}\n", "utf-8");

  fs.mkdirSync(path.join(root, "sdk"), { recursive: true });
  fs.writeFileSync(path.join(root, "sdk", "client.ts"), "export class Client {}\n", "utf-8");
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "semantic-ranking-repo",
      name: "Semantic Ranking Repo",
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: { packs },
      source_documents: {
        requirements: "README.md",
        technical_solution: "README.md",
      },
      global_gates: ["contracts_validated"],
    }),
    "utf-8",
  );
}

main();
