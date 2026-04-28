import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { extractBusinessVocabularyFromText, type BusinessVocabularyTerm } from "../bootstrap/business-vocabulary";
import { resolveDomainTaxonomyPacks } from "../bootstrap/domain-taxonomy";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DomainDraft {
  domain?: {
    primary_contexts?: string[];
    business_vocabulary?: Array<{
      label?: string;
      phrase?: string;
      language?: string;
      source_path?: string;
    }>;
  };
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Domain Multilingual Vocabulary Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-domain-vocabulary-"));
  const results: TestResult[] = [];

  try {
    seedFinanceRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
    if (!domainArtifact) {
      throw new Error("Expected domain artifact to exist.");
    }

    const domainDraft = yaml.load(domainArtifact.content) as DomainDraft;
    const contexts = domainDraft.domain?.primary_contexts ?? [];
    const vocabulary = domainDraft.domain?.business_vocabulary ?? [];
    const ranked = readRankedEvidence(tempRoot);

    results.push({
      name: "Chinese finance documents produce business primary contexts",
      passed:
        containsAll(contexts, ["portfolio", "governance", "broker-sync", "alpha-ledger", "reporting"]) &&
        !containsAny(contexts, ["login", "deposit", "database"]),
      error: `Expected portfolio/governance/broker-sync/alpha-ledger/reporting without login/deposit/database, got ${JSON.stringify(contexts)}.`,
    });

    results.push({
      name: "document-derived vocabulary outranks route-level nouns",
      passed:
        draftResult.qualitySummary.businessVocabularySignalsUsed.length >= 5 &&
        !draftResult.qualitySummary.primaryContextNames.includes("login") &&
        !draftResult.qualitySummary.primaryContextNames.includes("deposit") &&
        !draftResult.qualitySummary.primaryContextNames.includes("database"),
      error: `Expected vocabulary-backed contexts to outrank routes, got quality=${JSON.stringify(draftResult.qualitySummary)}.`,
    });

    results.push({
      name: "ranked evidence reasons expose multilingual business vocabulary",
      passed:
        ranked.evidence.some((entry) =>
          entry.path === "README.md" &&
          entry.reason.includes("business vocabulary") &&
          entry.reason.includes("portfolio") &&
          entry.reason.includes("governance"),
        ) &&
        vocabulary.some((term) => term.label === "broker-sync" && term.language === "chinese") &&
        vocabulary.some((term) => term.label === "alpha-ledger" && term.language === "mixed"),
      error: `Expected ranked evidence and draft vocabulary to expose multilingual terms, ranked=${JSON.stringify(ranked.evidence)}, vocabulary=${JSON.stringify(vocabulary)}.`,
    });

    const financeTaxonomyPacks = resolveDomainTaxonomyPacks(["finance-portfolio"]);
    const englishTerms = extractBusinessVocabularyFromText("Broker sync reporting keeps portfolio governance auditable.", {
      sourcePath: "docs/en.md",
      sourceKind: "architecture",
      taxonomyPacks: financeTaxonomyPacks,
    });
    const chineseTerms = extractBusinessVocabularyFromText("投资组合治理需要策略审批和券商同步。", {
      sourcePath: "docs/zh.md",
      sourceKind: "architecture",
      taxonomyPacks: financeTaxonomyPacks,
    });
    const mixedTerms = extractBusinessVocabularyFromText("Alpha账本 drives reporting and 审计留痕.", {
      sourcePath: "docs/mixed.md",
      sourceKind: "architecture",
      taxonomyPacks: financeTaxonomyPacks,
    });

    results.push({
      name: "English-only, Chinese-only, and mixed-language documents produce stable signals",
      passed:
        hasLabel(englishTerms, "broker-sync", "english") &&
        hasLabel(englishTerms, "reporting", "english") &&
        hasLabel(chineseTerms, "portfolio", "chinese") &&
        hasLabel(chineseTerms, "governance", "chinese") &&
        hasLabel(mixedTerms, "alpha-ledger", "mixed") &&
        hasLabel(mixedTerms, "reporting"),
      error: `Expected multilingual extraction, got english=${JSON.stringify(englishTerms)}, chinese=${JSON.stringify(chineseTerms)}, mixed=${JSON.stringify(mixedTerms)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap domain multilingual vocabulary execution",
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

function readRankedEvidence(root: string): AdoptionRankedEvidence {
  const rankedPath = path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
  return JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
}

function seedFinanceRepository(root: string): void {
  writeProject(root, ["finance-portfolio"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# 投资组合治理",
      "",
      "系统围绕家庭资产和投资组合提供策略审批、风控治理与审计留痕。",
      "每一次资产组合调整都必须进入报表和对账流程。",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "finance-vocabulary", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "architecture"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "architecture", "broker-sync.md"),
    [
      "# 券商同步",
      "",
      "券商同步负责把 broker sync 快照转换成可审计的 portfolio 状态。",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "product", "alpha-ledger.md"),
    [
      "# Alpha账本 Reporting",
      "",
      "Alpha账本记录策略实验收益，并把 reconciliation report 推送到 reporting 工作台。",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "login.ts"),
    'const app = { post: () => undefined };\napp.post("/login", () => "ok");\n',
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "src", "routes", "deposit.ts"),
    'const app = { post: () => undefined };\napp.post("/deposit", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "database"), { recursive: true });
  fs.writeFileSync(path.join(root, "database", "schema.prisma"), "model Deposit { id String @id }\n", "utf-8");
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "finance-vocabulary",
      name: "Finance Vocabulary",
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

function containsAll(values: string[], expected: string[]): boolean {
  return expected.every((value) => values.includes(value));
}

function containsAny(values: string[], expected: string[]): boolean {
  return expected.some((value) => values.includes(value));
}

function hasLabel(terms: BusinessVocabularyTerm[], label: string, language?: string): boolean {
  return terms.some((term) => term.label === label && (!language || term.language === language));
}

void main();
