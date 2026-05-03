import assert from "node:assert/strict";
import {
  DECISION_COMPANION_SECTION_TITLES,
  renderDecisionCompanionSections,
  summarizeDecisionCompanion,
} from "../companion/decision-sections";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Reviewer Companion Consolidation Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("shared renderer emits the fixed reviewer decision sections in order", () => {
    const text = renderDecisionCompanionSections({
      subject: "change CHG-123",
      truthSources: [".spec/deltas/CHG-123/impact-graph.json", ".spec/deltas/CHG-123/verify-focus.yaml"],
      strongestEvidence: ["impact graph touches contracts/payment.yaml"],
      inferredEvidence: ["handoff packet infers payment tests from verify focus"],
      drift: ["no conflict detected"],
      impact: ["contract: contracts/payment.yaml", "test: tests/payment.spec.ts"],
      nextSteps: ["run npm run gate:quick"],
      maxLines: 150,
    });

    assertSectionOrder(text);
    assert.match(text, /\.spec\/deltas\/CHG-123\/impact-graph\.json/);
    assert.match(text, /\.spec\/deltas\/CHG-123\/verify-focus\.yaml/);
    assert.ok(text.split(/\r?\n/).length <= 150);
  }));

  results.push(record("renderer marks empty inferred or drift sections as none without dropping headings", () => {
    const text = renderDecisionCompanionSections({
      subject: "takeover bootstrap",
      truthSources: [".spec/bootstrap/evidence-inventory.json"],
      strongestEvidence: ["ranked evidence has package.json"],
      inferredEvidence: [],
      drift: [],
      impact: ["contract: docs/v1-mainline-stable-contract.md"],
      nextSteps: ["review adoption summary"],
      maxLines: 150,
    });

    assertSectionOrder(text);
    assert.match(text, /推断证据\n- none/);
    assert.match(text, /冲突\/drift\n- none/);
  }));

  results.push(record("takeover companion contract uses fixed headings and truth source references", () => {
    const rendered = renderDecisionCompanionSections({
      subject: "takeover legacy repository",
      truthSources: [".spec/handoffs/bootstrap-takeover.json", ".spec/facts/bootstrap/adoption-ranked-evidence.json"],
      strongestEvidence: ["legacy routes map to domain scenarios"],
      inferredEvidence: ["feature vocabulary inferred from controller names"],
      drift: ["missing source snapshot: not_available_yet"],
      impact: ["contract: docs/v1-mainline-stable-contract.md"],
      nextSteps: ["open .spec/handoffs/adopt-summary.md"],
      maxLines: 150,
    });

    assertSectionOrder(rendered);
    assert.match(rendered, /\.spec\/handoffs\/bootstrap-takeover\.json/);
    assert.match(rendered, /\.spec\/facts\/bootstrap\/adoption-ranked-evidence\.json/);
  }));

  results.push(record("change and implement companions can share the same decision section contract", () => {
    const changeCompanion = renderDecisionCompanionSections({
      subject: "change delta",
      truthSources: [".spec/deltas/CHG-1/impact-graph.json", ".spec/deltas/CHG-1/verify-focus.yaml"],
      strongestEvidence: ["delta edits contracts/order.yaml"],
      inferredEvidence: ["verify focus selects order regression"],
      drift: ["impact graph freshness: fresh"],
      impact: ["contract: contracts/order.yaml", "test: tools/jispec/tests/order.ts"],
      nextSteps: ["run node --import tsx tools/jispec/cli.ts verify --change CHG-1"],
      maxLines: 150,
    });
    const implementCompanion = renderDecisionCompanionSections({
      subject: "implementation handoff",
      truthSources: [".jispec/handoff/session-1.json", ".spec/deltas/CHG-1/verify-focus.yaml"],
      strongestEvidence: ["handoff records replay command"],
      inferredEvidence: ["missing verification hint maps to order regression"],
      drift: ["no conflict detected"],
      impact: ["contract: contracts/order.yaml", "test: tools/jispec/tests/order.ts"],
      nextSteps: ["run npm run gate:quick"],
      maxLines: 150,
    });

    assertSectionOrder(changeCompanion);
    assertSectionOrder(implementCompanion);
  }));

  results.push(record("console summary exposes path and summary only", () => {
    const summary = summarizeDecisionCompanion({
      path: ".spec/deltas/CHG-1/impact-report.md",
      text: renderDecisionCompanionSections({
        subject: "change delta",
        truthSources: [".spec/deltas/CHG-1/impact-graph.json"],
        strongestEvidence: ["contract graph edge: A -> B"],
        inferredEvidence: ["verify focus inferred from changed files"],
        drift: ["no conflict detected"],
        impact: ["contract: A", "test: B"],
        nextSteps: ["review owner action"],
        maxLines: 150,
      }),
    });

    assert.deepEqual(Object.keys(summary).sort(), ["path", "summary"].sort());
    assert.equal(summary.path, ".spec/deltas/CHG-1/impact-report.md");
    assert.doesNotMatch(JSON.stringify(summary), /gateStatus|blocking|parsedMarkdown/);
  }));

  results.push(record("P9-T4 suite is registered in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-reviewer-companion-consolidation.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T4");
  }));

  printResults(results);
}

function assertSectionOrder(text: string): void {
  const positions = DECISION_COMPANION_SECTION_TITLES.map((title) => text.indexOf(`## ${title}`));
  for (let index = 0; index < positions.length; index += 1) {
    assert.ok(positions[index] >= 0, `missing section ${DECISION_COMPANION_SECTION_TITLES[index]}`);
  }
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(
      positions[index] > positions[index - 1],
      `${DECISION_COMPANION_SECTION_TITLES[index]} is out of order`,
    );
  }
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function printResults(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
