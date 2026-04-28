import fs from "node:fs";
import path from "node:path";
import { extractBusinessVocabularyFromText } from "../bootstrap/business-vocabulary";
import { resolveDomainTaxonomyPacks } from "../bootstrap/domain-taxonomy";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Bootstrap Domain Generality Audit Test ===\n");

  const results: TestResult[] = [];

  const bootstrapRoot = path.resolve(__dirname, "..", "bootstrap");
  const coreFiles = fs
    .readdirSync(bootstrapRoot)
    .filter((fileName) => fileName.endsWith(".ts") && fileName !== "domain-taxonomy.ts")
    .map((fileName) => path.join(bootstrapRoot, fileName));

  const forbiddenPatterns = [
    /\bBUSINESS_VOCABULARY\b/u,
    /\bBUSINESS_LABEL_TO_AGGREGATE\b/u,
    /\bSERVICE_CONTEXT_RULES\b/u,
    /\bDOMAIN_BOUNDARY_PATTERNS\b/u,
    /family asset/iu,
    /alpha-ledger/iu,
    /broker-sync/iu,
    /phantom/iu,
    /投资组合/u,
    /家庭资产/u,
    /券商同步/u,
  ];

  const violations = coreFiles.flatMap((filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    return forbiddenPatterns
      .filter((pattern) => pattern.test(content))
      .map((pattern) => `${path.relative(process.cwd(), filePath)} matched ${pattern}`);
  });

  results.push({
    name: "bootstrap core has no old-project domain lexicon outside taxonomy packs",
    passed: violations.length === 0,
    error: `Expected no hardcoded legacy domain terms in core files, got ${violations.join("; ")}`,
  });

  const unconfiguredTerms = extractBusinessVocabularyFromText("Broker sync reporting keeps portfolio governance auditable.", {
    sourcePath: "docs/sample.md",
    sourceKind: "architecture",
  });
  const configuredTerms = extractBusinessVocabularyFromText("Broker sync reporting keeps portfolio governance auditable.", {
    sourcePath: "docs/sample.md",
    sourceKind: "architecture",
    taxonomyPacks: resolveDomainTaxonomyPacks(["finance-portfolio"]),
  });

  results.push({
    name: "business vocabulary is opt-in through taxonomy packs",
    passed:
      unconfiguredTerms.length === 0 &&
      configuredTerms.some((term) => term.label === "portfolio" && term.taxonomyPackId === "finance-portfolio") &&
      configuredTerms.some((term) => term.label === "broker-sync" && term.taxonomyPackId === "finance-portfolio"),
    error: `Expected no default vocabulary and taxonomy-backed configured terms. unconfigured=${JSON.stringify(unconfiguredTerms)}, configured=${JSON.stringify(configuredTerms)}.`,
  });

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

main();
