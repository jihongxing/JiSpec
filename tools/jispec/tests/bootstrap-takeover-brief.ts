import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { renderBootstrapAdoptText, runBootstrapAdopt } from "../bootstrap/adopt";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Takeover Brief Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-takeover-brief-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    injectRouteAndSourceEvidence(tempRoot);
    const adoptResult = await runBootstrapAdopt({
      root: tempRoot,
      session: draftResult.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "api surfaces need owner confirmation" },
        { artifactKind: "feature", kind: "accept" },
      ],
    });

    const briefPath = path.join(tempRoot, ".spec", "handoffs", "takeover-brief.md");
    const manifestPath = path.join(tempRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const brief = fs.readFileSync(briefPath, "utf-8");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      takeoverBriefPath?: string;
      takeoverReportPath?: string;
    };
    const rendered = renderBootstrapAdoptText(adoptResult);

    results.push({
      name: "adopt writes a human-readable takeover brief and exposes it on the result",
      passed:
        adoptResult.takeoverBriefPath === ".spec/handoffs/takeover-brief.md" &&
        fs.existsSync(briefPath) &&
        manifest.takeoverBriefPath === ".spec/handoffs/takeover-brief.md" &&
        manifest.takeoverReportPath === ".spec/handoffs/bootstrap-takeover.json",
      error: "Expected adopt to write and record .spec/handoffs/takeover-brief.md.",
    });

    results.push({
      name: "brief contains top adoption, owner review, deferred debt, and risk summary",
      passed:
        brief.includes("## Top Adoption Candidates") &&
        brief.includes("## Decision Snapshot") &&
        brief.includes("Current state:") &&
        brief.includes("Risk: Feature gate: accept_candidate") &&
        brief.includes("Evidence:") &&
        brief.includes("Owner: reviewer") &&
        brief.includes("Next command: `npm run jispec-cli -- verify`") &&
        brief.includes("## Owner Review Candidates") &&
        brief.includes("## Risk Summary") &&
        brief.includes("## Evidence Distribution") &&
        brief.includes("owner review") &&
        (brief.includes("`docs/governance/README.md`") || brief.includes("`api/proto/gateway.proto`")) &&
        brief.includes("## Adopted Contracts") &&
        brief.includes("[.spec/contracts/domain.yaml](../contracts/domain.yaml)") &&
        brief.includes("[.spec/contracts/behaviors.feature](../contracts/behaviors.feature)") &&
        brief.includes("## Deferred Spec Debt") &&
        brief.includes(`[.spec/spec-debt/${draftResult.sessionId}/api.json](../spec-debt/${draftResult.sessionId}/api.json)`) &&
        brief.includes("api surfaces need owner confirmation") &&
        brief.includes("## Strongest Evidence") &&
        (brief.includes("docs/governance/README.md") || brief.includes("api/proto/gateway.proto")) &&
        brief.includes("`/ledger/entries`") &&
        brief.includes("[api/routes/alpha_routes.py](../../api/routes/alpha_routes.py)") &&
        !brief.includes("[/ledger/entries]") &&
        !brief.includes("../..//ledger/entries") &&
        brief.includes("- No owner-review candidates were identified in the feature confidence gate.") &&
        brief.includes("Feature gate: accept_candidate") &&
        brief.includes("Owner-review candidates: 0") &&
        brief.includes("## Feature Confidence Gate") &&
        brief.includes("Recommendation: `accept_candidate`") &&
        brief.includes("Feature draft can be adopted as an initial behavior contract"),
      error: `Expected brief to contain decision packet sections, got:\n${brief}`,
    });

    results.push({
      name: "brief includes excluded-noise summary and next actions",
      passed:
        brief.includes("## Excluded Noise Summary") &&
        brief.includes("Total excluded files") &&
        brief.includes("vendor") &&
        brief.includes("## Next Recommended Actions") &&
        brief.includes("Review API surface classification") &&
        brief.includes("jispec-cli verify --root ."),
      error: `Expected brief to include exclusion and action guidance, got:\n${brief}`,
    });

    results.push({
      name: "CLI adopt text includes brief path and compact summary",
      passed:
        rendered.includes("Takeover brief: .spec/handoffs/takeover-brief.md") &&
        rendered.includes("Brief summary:") &&
        rendered.includes("Top adoption:") &&
        rendered.includes("Owner review:") &&
        rendered.includes("Deferred debt:") &&
        rendered.includes("Risk:") &&
        rendered.includes("Evidence distribution:") &&
        rendered.includes("Feature gate: accept_candidate") &&
        rendered.includes("Next:"),
      error: `Expected CLI output to include brief summary, got:\n${rendered}`,
    });

    results.push({
      name: "brief declares Markdown as companion and keeps machine report as source of truth",
      passed:
        brief.includes("## Source Of Truth") &&
        brief.includes("Machine report:") &&
        brief.includes("bootstrap-takeover.json") &&
        brief.includes("This Markdown file is a human-readable companion summary, not a machine API."),
      error: `Expected brief to declare source-of-truth boundary, got:\n${brief}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap takeover brief execution",
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
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    [
      "id: takeover-brief-repo",
      "name: Takeover Brief Repo",
      "domain_taxonomy:",
      "  packs:",
      "    - network-gateway",
      "    - finance-portfolio",
      "ai:",
      "  provider: mock",
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Gateway Governance\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "takeover-brief", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "README.md"), "# Governance\n\nPolicy approval and audit trail.\n", "utf-8");

  fs.mkdirSync(path.join(root, "docs", "protocols"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "protocols", "README.md"), "# Gateway Protocols\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice Gateway { rpc Switch(SwitchRequest) returns (SwitchResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "gateway-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/gateway/switch", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "gateway.test.ts"), "describe('gateway switch', () => {});\n", "utf-8");

  fs.mkdirSync(path.join(root, "vendor", "leftpad"), { recursive: true });
  fs.writeFileSync(path.join(root, "vendor", "leftpad", "README.md"), "# Vendored dependency\n", "utf-8");
  fs.writeFileSync(path.join(root, "vendor", "leftpad", "package.json"), JSON.stringify({ name: "leftpad" }, null, 2), "utf-8");
}

function injectRouteAndSourceEvidence(root: string): void {
  fs.mkdirSync(path.join(root, "api", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "routes", "alpha_routes.py"),
    'app.get("/ledger/entries")(lambda: [])\n',
    "utf-8",
  );

  const rankedPath = path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
  const ranked = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as {
    evidence?: Array<Record<string, unknown>>;
    summary?: { selectedCount?: number; topScore?: number };
  };
  const injected = [
    {
      rank: 1,
      kind: "route",
      path: "/ledger/entries",
      score: 180,
      reason: "explicit HTTP signature, GET method",
      source: "bootstrap.routes",
      confidenceScore: 0.92,
      sourceFiles: ["api/routes/alpha_routes.py"],
      metadata: {
        method: "GET",
        signal: "http_signature",
      },
    },
    {
      rank: 2,
      kind: "source",
      path: "api/routes/alpha_routes.py",
      score: 148,
      reason: "route source inventory",
      source: "bootstrap.sourceFiles",
      sourceFiles: ["api/routes/alpha_routes.py"],
      metadata: {
        sourceCategory: "route",
      },
    },
  ];
  ranked.evidence = [...injected, ...(ranked.evidence ?? [])]
    .filter((entry, index, entries) =>
      entries.findIndex((candidate) => String(candidate.kind) === String(entry.kind) && String(candidate.path) === String(entry.path)) === index)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  if (ranked.summary) {
    ranked.summary.selectedCount = ranked.evidence.length;
    ranked.summary.topScore = 180;
  }
  fs.writeFileSync(rankedPath, `${JSON.stringify(ranked, null, 2)}\n`, "utf-8");
}

void main();
