import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

function assertIncludes(haystack: string, needle: string, context: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${context} is missing '${needle}'.`);
  }
}

function extractSection(help: string, heading: string): string {
  const section = help
    .split(/\n\n+/)
    .find((block) => block.startsWith(heading));

  if (!section) {
    throw new Error(`help text is missing section '${heading}'.`);
  }

  return section;
}

function main(): void {
  console.log("=== CLI Help Surface Tests ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliEntry, "--help"],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    },
  );

  let passed = 0;
  let failed = 0;

  try {
    if (result.status !== 0) {
      throw new Error(`CLI help exited with status ${result.status}. stderr: ${result.stderr}`);
    }

    const help = result.stdout;

    assertIncludes(help, "Semantic entry surface:", "help text");
    assertIncludes(help, "Derived operational surfaces:", "help text");
    assertIncludes(help, "Legacy compatibility surface:", "help text");
    assertIncludes(help, "Mainline workflow shortcuts:", "help text");
    console.log("✓ Test 1: help text is split into semantic entry, derived operational, compatibility, and workflow shortcut surfaces");
    passed++;

    const semanticSection = extractSection(help, "Semantic entry surface:");
    assertIncludes(semanticSection, "jispec-cli change <summary> [--mode prompt|execute] [--json]", "semantic entry surface");
    assert.equal((semanticSection.match(/jispec-cli /g) ?? []).length, 1);
    assert.equal(semanticSection.includes("verify"), false);
    assert.equal(semanticSection.includes("implement"), false);

    const derivedSection = extractSection(help, "Derived operational surfaces:");
    assertIncludes(derivedSection, "jispec-cli verify [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli init --requirements <path> [--technical-solution <path>] [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli first-run [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli source refresh [--change <id|latest>] [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli source diff [--change <id|latest>] [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli change default-mode show|set|reset [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli review list|adopt|reject|defer|waive|brief [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli spec-debt repay|cancel|owner-review <id> [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli release snapshot --version <version> [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli console dashboard [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli console ui [--out <path>] [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli console actions [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli console export-governance [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli console aggregate-governance [--snapshot <paths...>] [--dir <paths...>] [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli privacy report [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli pilot package [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli north-star acceptance [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli integrations payload --provider github|gitlab|jira|linear --kind scm_comment|issue_link [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli handoff adapter --from-handoff <path-or-session> --tool codex|claude_code|cursor|copilot|devin [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli implement [--fast] [--external-patch <path>] [--from-handoff <path-or-session>] [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli bootstrap discover [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli bootstrap draft [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli adopt --interactive [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli policy approval status|record [--json]", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli doctor mainline", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli doctor global", "derived operational surfaces");
    assertIncludes(derivedSection, "jispec-cli doctor runtime", "derived operational surfaces");
    const ciSection = extractSection(help, "Current CI wrapper:");
    assertIncludes(ciSection, "npm run ci:verify", "CI wrapper");
    console.log("✓ Test 2: change remains the only semantic entry while derived surfaces still enumerate operational commands");
    passed++;

    assertIncludes(help, "jispec-cli slice ...", "legacy surface");
    assertIncludes(help, "jispec-cli template ...", "legacy surface");
    assertIncludes(help, "npm run validate:repo", "compatibility aliases");
    assertIncludes(help, "change --mode prompt -> follow next commands manually", "workflow shortcuts");
    assertIncludes(help, "change --mode execute -> orchestrate implementation mediation -> verify", "workflow shortcuts");
    assertIncludes(help, "implement --fast -> verify --fast", "workflow shortcuts");
    console.log("✓ Test 3: compatibility surface, aliases, and workflow shortcuts are explicitly listed");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
