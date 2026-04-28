import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { scoreEvidenceAsset, type AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DomainDraft {
  domain?: {
    primary_contexts?: string[];
    areas?: Array<{ name?: string; provenance_note?: string; source_files?: string[] }>;
  };
}

const BLOCKED_PRIMARY_CONTEXTS = new Set([
  "api-server",
  "bootstrap",
  "database",
  "dist",
  "generated",
  "go",
  "migration",
  "proto",
  "sdk",
  "web",
]);

async function main(): Promise<void> {
  console.log("=== Bootstrap Technical Boundary Suppression Test ===\n");

  const results: TestResult[] = [];
  const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-tech-boundary-mixed-"));
  const routeOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-tech-boundary-route-"));
  const brandParent = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-tech-boundary-brand-"));
  const brandRoot = path.join(brandParent, "ReMirage");

  try {
    fs.mkdirSync(brandRoot, { recursive: true });
    seedMixedRepository(mixedRoot);
    seedRouteOnlyRepository(routeOnlyRoot);
    seedBrandRepository(brandRoot);

    const mixedDraft = await discoverAndDraftDomain(mixedRoot);
    const routeOnlyDraft = await discoverAndDraftDomain(routeOnlyRoot);
    const brandDraft = await discoverAndDraftDomain(brandRoot);
    const mixedRanked = readRankedEvidence(mixedRoot);

    const mixedContexts = mixedDraft.domain?.primary_contexts ?? [];
    const mixedAreaNames = new Set((mixedDraft.domain?.areas ?? []).map((area) => area.name).filter(Boolean));
    const routeOnlyContexts = routeOnlyDraft.domain?.primary_contexts ?? [];
    const brandContexts = brandDraft.domain?.primary_contexts ?? [];
    const rankedPaths = mixedRanked.evidence.map((entry) => entry.path);

    results.push({
      name: "technical implementation labels do not become primary contexts",
      passed:
        noBlockedPrimaryContexts(mixedContexts) &&
        mixedContexts.includes("control-plane") &&
        mixedContexts.includes("governance") &&
        (mixedContexts.includes("ledger") || mixedAreaNames.has("ledger")),
      error: `Expected control-plane/governance/ledger without technical labels, got contexts=${JSON.stringify(mixedContexts)}, areas=${JSON.stringify([...mixedAreaNames])}.`,
    });

    results.push({
      name: "technical evidence remains visible for inventory and adoption ranking",
      passed:
        rankedPaths.includes("database/schema.prisma") &&
        rankedPaths.includes("db/migrations/20240101_add_ledger.sql") &&
        mixedRanked.evidence.some((entry) => entry.reason.includes("technical boundary label treated as supporting evidence")),
      error: `Expected database/migration evidence to remain visible with supporting-evidence reasoning, got ${JSON.stringify(mixedRanked.evidence)}.`,
    });

    results.push({
      name: "route-only repositories use source business object instead of route technology words",
      passed:
        routeOnlyContexts.includes("ledger") &&
        noBlockedPrimaryContexts(routeOnlyContexts),
      error: `Expected route-only context to resolve to ledger without database/migration/api-server, got ${JSON.stringify(routeOnlyContexts)}.`,
    });

    results.push({
      name: "brand-level names are suppressed when a more specific boundary exists",
      passed:
        brandContexts.includes("gateway") &&
        !brandContexts.includes("mirage") &&
        noBlockedPrimaryContexts(brandContexts),
      error: `Expected gateway to outrank brand-level mirage, got ${JSON.stringify(brandContexts)}.`,
    });

    const sdkScore = scoreEvidenceAsset({
      kind: "source",
      path: "sdk/client.ts",
      confidenceScore: 0.8,
      sourceCategory: "sdk",
    });
    const protoScore = scoreEvidenceAsset({
      kind: "schema",
      path: "api/proto/control-plane.proto",
      confidenceScore: 0.98,
      schemaFormat: "protobuf",
    });
    results.push({
      name: "evidence scoring downranks pure technology labels but keeps business-backed proto strong",
      passed:
        sdkScore.reasons.includes("technical boundary without business object") &&
        protoScore.reasons.includes("technical boundary label treated as supporting evidence") &&
        protoScore.score > sdkScore.score,
      error: `Expected SDK to be technical-only and proto to remain business-backed, got sdk=${JSON.stringify(sdkScore)}, proto=${JSON.stringify(protoScore)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap technical boundary suppression execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(mixedRoot, { recursive: true, force: true });
    fs.rmSync(routeOnlyRoot, { recursive: true, force: true });
    fs.rmSync(brandParent, { recursive: true, force: true });
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

async function discoverAndDraftDomain(root: string): Promise<DomainDraft> {
  runBootstrapDiscover({ root });
  const draftResult = await runBootstrapDraft({ root });
  const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
  if (!domainArtifact) {
    throw new Error("Expected domain artifact to exist.");
  }
  return yaml.load(domainArtifact.content) as DomainDraft;
}

function readRankedEvidence(root: string): AdoptionRankedEvidence {
  const rankedPath = path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
  return JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
}

function noBlockedPrimaryContexts(contexts: string[]): boolean {
  return !contexts.some((context) => BLOCKED_PRIMARY_CONTEXTS.has(context));
}

function seedMixedRepository(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "# Control Plane Ledger\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "boundary-suppression", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "README.md"), "# Governance\n\nPolicy approval and audit evidence.\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "control-plane.proto"),
    'syntax = "proto3";\nservice ControlPlane { rpc ApplyPolicy(PolicyRequest) returns (PolicyResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "database"), { recursive: true });
  fs.writeFileSync(path.join(root, "database", "schema.prisma"), "model LedgerEntry { id String @id }\n", "utf-8");

  fs.mkdirSync(path.join(root, "db", "migrations"), { recursive: true });
  fs.writeFileSync(path.join(root, "db", "migrations", "20240101_add_ledger.sql"), "create table ledger_entries(id text primary key);\n", "utf-8");

  fs.mkdirSync(path.join(root, "go"), { recursive: true });
  fs.writeFileSync(path.join(root, "go", "main.go"), "package main\nfunc main() {}\n", "utf-8");

  fs.mkdirSync(path.join(root, "web", "api-server"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "web", "api-server", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/api/v1/database/migrations", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "sdk"), { recursive: true });
  fs.writeFileSync(path.join(root, "sdk", "client.ts"), "export class Client {}\n", "utf-8");
}

function seedRouteOnlyRepository(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "# Route Only Ledger\n", "utf-8");
  fs.mkdirSync(path.join(root, "src", "ledger", "api-server"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "ledger", "api-server", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/api/v1/database/migrations", () => "ok");\n',
    "utf-8",
  );
}

function seedBrandRepository(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "# ReMirage Gateway\n", "utf-8");

  fs.mkdirSync(path.join(root, "src", "mirage"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "mirage", "service.ts"), "export const brand = true;\n", "utf-8");

  fs.mkdirSync(path.join(root, "src", "gateway"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "gateway", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/gateway/sessions/recover", () => "ok");\n',
    "utf-8",
  );
}

void main();
