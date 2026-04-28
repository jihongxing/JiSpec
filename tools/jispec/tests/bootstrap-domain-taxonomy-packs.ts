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
    taxonomy_packs?: string[];
    aggregate_roots?: Array<{
      name?: string;
      provenance_note?: string;
    }>;
    business_vocabulary?: Array<{
      label?: string;
      phrase?: string;
      taxonomyPackId?: string;
    }>;
  };
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Domain Taxonomy Packs Test ===\n");

  const genericRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-taxonomy-generic-"));
  const financeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-taxonomy-finance-"));
  const networkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-taxonomy-network-"));
  const nonOverrideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-taxonomy-nonoverride-"));
  const customLearningRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-taxonomy-learning-"));
  const results: TestResult[] = [];

  try {
    seedGenericGatewayRepository(genericRoot, []);
    seedFinanceRepository(financeRoot);
    seedNetworkRepository(networkRoot);
    seedGenericGatewayRepository(nonOverrideRoot, ["finance-portfolio"]);
    seedCustomLearningRepository(customLearningRoot);

    const genericDraft = await discoverAndDraftDomain(genericRoot);
    const financeDraft = await discoverAndDraftDomain(financeRoot);
    const networkDraft = await discoverAndDraftDomain(networkRoot);
    const nonOverrideDraft = await discoverAndDraftDomain(nonOverrideRoot);
    const customLearningDraft = await discoverAndDraftDomain(customLearningRoot);
    const financeRanked = readRankedEvidence(financeRoot);
    const learningRanked = readRankedEvidence(customLearningRoot);

    results.push({
      name: "unconfigured repositories keep generic takeover inference",
      passed:
        containsAny(genericDraft.contexts, ["gateway", "control-plane", "protocol"]) &&
        genericDraft.taxonomyPacks.length === 0,
      error: `Expected generic gateway inference without configured taxonomy packs, got ${JSON.stringify(genericDraft)}.`,
    });

    results.push({
      name: "finance-portfolio pack boosts finance vocabulary, ranking, and aggregates",
      passed:
        containsAll(financeDraft.contexts, ["portfolio", "governance", "ledger", "reporting"]) &&
        containsAll(financeDraft.aggregateRoots, ["Portfolio", "GovernanceDecision", "Ledger", "ReportingView"]) &&
        financeDraft.taxonomyPacks.some((entry) => entry.includes("finance-portfolio")) &&
        financeRanked.evidence.some((entry) =>
          entry.reason.includes("finance-portfolio") &&
          (entry.reason.includes("portfolio") || entry.reason.includes("reporting")),
        ),
      error: `Expected finance taxonomy to boost contexts, aggregates, and ranked reasons. Draft=${JSON.stringify(financeDraft)}, ranked=${JSON.stringify(financeRanked.evidence)}.`,
    });

    results.push({
      name: "network-gateway pack boosts gateway, session, protocol, and control-plane vocabulary",
      passed:
        containsAll(networkDraft.contexts, ["gateway", "control-plane", "protocol", "session"]) &&
        containsAll(networkDraft.aggregateRoots, ["Gateway", "ControlCommand", "Session"]) &&
        networkDraft.taxonomyPacks.some((entry) => entry.includes("network-gateway")),
      error: `Expected network taxonomy contexts and aggregates, got ${JSON.stringify(networkDraft)}.`,
    });

    const configuredFinanceScore = scoreEvidenceAsset({
      kind: "document",
      path: "docs/holdings/rebalance.md",
      documentKind: "architecture",
      confidenceScore: 0.82,
      taxonomyPacks: [],
    }).score;
    const boostedFinanceScore = scoreEvidenceAsset({
      kind: "document",
      path: "docs/holdings/rebalance.md",
      documentKind: "architecture",
      confidenceScore: 0.82,
      taxonomyPacks: [
        {
          id: "finance-portfolio",
          title: "Finance Portfolio",
          terms: [
            {
              label: "portfolio",
              phrases: ["holdings", "rebalance"],
              weight: 118,
              aggregateName: "Portfolio",
            },
          ],
          pathHints: [
            {
              label: "portfolio",
              patterns: [/holdings/i, /rebalance/i],
              boost: 18,
            },
          ],
        },
      ],
    }).score;

    results.push({
      name: "configured taxonomy packs do not override direct unrelated evidence",
      passed:
        boostedFinanceScore > configuredFinanceScore &&
        containsAny(nonOverrideDraft.contexts, ["gateway", "control-plane", "protocol"]) &&
        !containsAny(nonOverrideDraft.contexts, ["portfolio", "ledger", "broker-sync"]),
      error: `Expected taxonomy scoring boost without overriding gateway evidence. baseScore=${configuredFinanceScore}, boostedScore=${boostedFinanceScore}, draft=${JSON.stringify(nonOverrideDraft)}.`,
    });

    results.push({
      name: "custom project taxonomy packs support unrelated domains",
      passed:
        containsAll(customLearningDraft.contexts, ["course", "enrollment", "assessment", "learner-progress"]) &&
        containsAll(customLearningDraft.aggregateRoots, ["Course", "Enrollment", "Assessment", "LearnerProgress"]) &&
        customLearningDraft.taxonomyPacks.some((entry) => entry.includes("education-learning")) &&
        learningRanked.evidence.some((entry) => entry.reason.includes("education-learning") && entry.reason.includes("course")),
      error: `Expected custom education taxonomy to drive contexts and aggregates. Draft=${JSON.stringify(customLearningDraft)}, ranked=${JSON.stringify(learningRanked.evidence)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap domain taxonomy packs execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(genericRoot, { recursive: true, force: true });
    fs.rmSync(financeRoot, { recursive: true, force: true });
    fs.rmSync(networkRoot, { recursive: true, force: true });
    fs.rmSync(nonOverrideRoot, { recursive: true, force: true });
    fs.rmSync(customLearningRoot, { recursive: true, force: true });
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

async function discoverAndDraftDomain(root: string): Promise<{
  contexts: string[];
  taxonomyPacks: string[];
  aggregateRoots: string[];
}> {
  runBootstrapDiscover({ root });
  const draftResult = await runBootstrapDraft({ root });
  const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
  if (!domainArtifact) {
    throw new Error("Expected domain artifact to exist.");
  }
  const parsed = yaml.load(domainArtifact.content) as DomainDraft;
  return {
    contexts: parsed.domain?.primary_contexts ?? [],
    taxonomyPacks: parsed.domain?.taxonomy_packs ?? [],
    aggregateRoots: (parsed.domain?.aggregate_roots ?? []).map((entry) => entry.name).filter((name): name is string => Boolean(name)),
  };
}

function readRankedEvidence(root: string): AdoptionRankedEvidence {
  const rankedPath = path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
  return JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
}

function seedGenericGatewayRepository(root: string, packs: string[]): void {
  writeProject(root, packs);
  fs.writeFileSync(path.join(root, "README.md"), "# Gateway Control Plane\n\nGateway protocol policy rollout.\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "taxonomy-gateway", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "protocols"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "protocols", "README.md"), "# Protocol\n\nGateway control-plane protocol.\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice GatewayService { rpc Switch(SwitchRequest) returns (SwitchResult); }\nmessage SwitchRequest {}\nmessage SwitchResult {}\n',
    "utf-8",
  );
}

function seedFinanceRepository(root: string): void {
  writeProject(root, ["finance-portfolio"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# Holdings Workbench",
      "",
      "The platform manages holdings, rebalance approval, capital ledger updates, and statement workspace review.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "taxonomy-finance", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "holdings"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "holdings", "rebalance.md"),
    "Rebalance approval moves holdings through a capital ledger and performance statement workspace.",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schema"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "schema", "portfolio.prisma"),
    "model Portfolio { id String @id }\nmodel GovernanceDecision { id String @id }\nmodel Ledger { id String @id }\nmodel ReportingView { id String @id }\n",
    "utf-8",
  );
}

function seedNetworkRepository(root: string): void {
  writeProject(root, ["network-gateway"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# Edge Ingress Runtime",
      "",
      "Edge ingress uses policy rollout, tunnel protocol contracts, and failover session continuity.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "taxonomy-network", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "runtime", "sessions.md"),
    "Failover session handoff depends on the tunnel protocol and control command rollout.",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "edge.proto"),
    'syntax = "proto3";\nservice GatewayService { rpc Apply(ControlCommandRequest) returns (ControlCommandResult); }\nmessage ControlCommandRequest {}\nmessage ControlCommandResult {}\nmessage Session {}\n',
    "utf-8",
  );
}

function seedCustomLearningRepository(root: string): void {
  fs.mkdirSync(path.join(root, "jiproject", "taxonomies"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "learning-fixture",
      name: "Learning Fixture",
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: {
        files: ["jiproject/taxonomies/learning.yaml"],
      },
      source_documents: {
        requirements: "README.md",
        technical_solution: "README.md",
      },
      global_gates: ["contracts_validated"],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "jiproject", "taxonomies", "learning.yaml"),
    yaml.dump({
      id: "education-learning",
      title: "Education Learning",
      terms: [
        {
          label: "course",
          phrases: ["course catalog", "curriculum map"],
          weight: 128,
          aggregate_name: "Course",
        },
        {
          label: "enrollment",
          phrases: ["student enrollment", "cohort enrollment"],
          weight: 124,
          aggregate_name: "Enrollment",
        },
        {
          label: "assessment",
          phrases: ["rubric assessment", "mastery assessment"],
          weight: 120,
          aggregate_name: "Assessment",
        },
        {
          label: "learner-progress",
          phrases: ["learner progress", "progress checkpoint"],
          weight: 118,
          aggregate_name: "LearnerProgress",
        },
      ],
      path_hints: [
        {
          label: "course",
          patterns: ["curriculum", "course"],
          boost: 18,
        },
        {
          label: "assessment",
          patterns: ["assessment", "rubric"],
          boost: 16,
        },
      ],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# Learning Operations",
      "",
      "The course catalog follows a curriculum map.",
      "Student enrollment assigns learners into cohorts.",
      "Rubric assessment and learner progress checkpoints drive promotion decisions.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "taxonomy-learning", private: true }, null, 2), "utf-8");
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "taxonomy-fixture",
      name: "Taxonomy Fixture",
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: {
        packs,
      },
      source_documents: {
        requirements: "README.md",
        technical_solution: "README.md",
      },
      global_gates: ["contracts_validated"],
    }),
    "utf-8",
  );
}

function containsAll(values: string[], expected: string[]): boolean {
  return expected.every((value) => values.includes(value));
}

function containsAny(values: string[], expected: string[]): boolean {
  return expected.some((value) => values.includes(value));
}

void main();
