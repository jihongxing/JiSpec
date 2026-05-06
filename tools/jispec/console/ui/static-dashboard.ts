import fs from "node:fs";
import path from "node:path";
import {
  buildConsoleGovernanceActionPlanFromSnapshot,
  type ConsoleGovernanceActionPlan,
} from "../governance-actions";
import {
  buildConsoleGovernanceDashboardFromSnapshot,
  type ConsoleGovernanceDashboard,
  type ConsoleGovernanceStatus,
} from "../governance-dashboard";
import {
  collectConsoleLocalSnapshot,
  type ConsoleGovernanceObjectSnapshot,
  type ConsoleLocalSnapshot,
} from "../read-model-snapshot";

export interface LocalConsoleUiOptions {
  root: string;
  outPath?: string;
}

export interface LocalConsoleUiModel {
  version: 1;
  root: string;
  generatedAt: string;
  outPath: string;
  boundary: {
    readOnly: true;
    offlineCapable: true;
    sourceUploadRequired: false;
    replacesCliGate: false;
    overridesVerify: false;
    scansSourceCode: false;
    executesCommands: false;
    writesLocalArtifacts: false;
    firstScreen: "governance_status";
  };
  dashboard: ConsoleGovernanceDashboard;
  snapshot: ConsoleLocalSnapshot;
  actions: ConsoleGovernanceActionPlan;
}

export interface LocalConsoleUiWriteResult {
  model: LocalConsoleUiModel;
  outPath: string;
  relativeOutPath: string;
  bytesWritten: number;
}

const DEFAULT_UI_OUT = ".spec/console/ui/index.html";

const GOVERNANCE_OBJECT_ORDER = [
  "policy_posture",
  "waiver_lifecycle",
  "spec_debt_ledger",
  "source_evolution_governance",
  "contract_drift",
  "release_baseline",
  "verify_trend",
  "takeover_quality_trend",
  "implementation_mediation_outcomes",
  "approval_workflow",
  "audit_events",
] as const;

export function buildLocalConsoleUiModel(options: LocalConsoleUiOptions): LocalConsoleUiModel {
  const root = path.resolve(options.root);
  const outPath = path.resolve(root, options.outPath ?? DEFAULT_UI_OUT);
  const snapshot = collectConsoleLocalSnapshot(root);
  const actions = buildConsoleGovernanceActionPlanFromSnapshot(snapshot, root);
  const dashboard = buildConsoleGovernanceDashboardFromSnapshot(snapshot, actions);

  return {
    version: 1,
    root,
    generatedAt: new Date().toISOString(),
    outPath,
    boundary: {
      readOnly: true,
      offlineCapable: true,
      sourceUploadRequired: false,
      replacesCliGate: false,
      overridesVerify: false,
      scansSourceCode: false,
      executesCommands: false,
      writesLocalArtifacts: false,
      firstScreen: "governance_status",
    },
    dashboard,
    snapshot,
    actions,
  };
}

export function writeLocalConsoleUi(options: LocalConsoleUiOptions): LocalConsoleUiWriteResult {
  const model = buildLocalConsoleUiModel(options);
  const html = renderLocalConsoleUiHtml(model);

  fs.mkdirSync(path.dirname(model.outPath), { recursive: true });
  fs.writeFileSync(model.outPath, html, "utf-8");

  return {
    model,
    outPath: model.outPath,
    relativeOutPath: normalizePath(path.relative(model.root, model.outPath)),
    bytesWritten: Buffer.byteLength(html, "utf-8"),
  };
}

export function renderLocalConsoleUiHtml(model: LocalConsoleUiModel): string {
  const objects = GOVERNANCE_OBJECT_ORDER
    .map((id) => model.snapshot.governance.objects.find((object) => object.id === id))
    .filter((object): object is ConsoleGovernanceObjectSnapshot => Boolean(object));
  const suggestedActions = model.actions.actions.slice(0, 6);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>JiSpec Console</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --ink: #1d2430;
      --muted: #5c6675;
      --line: #dfe3ea;
      --ok: #1f7a4d;
      --attention: #9a6100;
      --blocked: #b42318;
      --unknown: #586174;
      --accent: #2456c5;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }

    header {
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    .wrap {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
    }

    .topbar {
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    h1, h2, h3, p {
      margin: 0;
    }

    h1 {
      font-size: 21px;
      font-weight: 720;
    }

    h2 {
      font-size: 17px;
      margin-bottom: 12px;
    }

    h3 {
      font-size: 14px;
      margin-bottom: 6px;
    }

    main {
      padding: 22px 0 34px;
    }

    .stack {
      display: grid;
      gap: 18px;
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
      gap: 18px;
      align-items: stretch;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }

    .headline {
      display: grid;
      gap: 12px;
      min-height: 190px;
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-flex;
      min-height: 26px;
      align-items: center;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      border: 1px solid currentColor;
    }

    .ok { color: var(--ok); }
    .attention { color: var(--attention); }
    .blocked { color: var(--blocked); }
    .unknown { color: var(--unknown); }

    .headline-title {
      font-size: 30px;
      font-weight: 760;
      max-width: 760px;
    }

    .summary {
      color: var(--muted);
      max-width: 840px;
    }

    .signal-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .signal {
      min-width: 0;
      border-top: 1px solid var(--line);
      padding-top: 10px;
    }

    .signal-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .signal-value {
      margin-top: 4px;
      font-size: 15px;
      font-weight: 720;
      overflow-wrap: anywhere;
    }

    .signal-detail {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 74px;
      background: #fbfcfe;
    }

    .metric-label {
      color: var(--muted);
      font-size: 12px;
    }

    .metric-value {
      margin-top: 5px;
      font-size: 20px;
      font-weight: 740;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .question, .object, .action {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-height: 150px;
      background: #ffffff;
    }

    .question {
      display: grid;
      gap: 9px;
    }

    .question-special {
      gap: 14px;
    }

    .question-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .question-metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fbfcfe;
      min-height: 82px;
    }

    .question-metric-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .question-metric-value {
      margin-top: 6px;
      font-size: 20px;
      font-weight: 760;
    }

    .question-metric-detail {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
    }

    .inline-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #fbfcfe;
      color: var(--ink);
      font-size: 12px;
      font-weight: 700;
    }

    .pill.ok {
      border-color: rgba(31, 122, 77, 0.25);
      background: rgba(31, 122, 77, 0.08);
      color: var(--ok);
    }

    .pill.attention {
      border-color: rgba(154, 97, 0, 0.25);
      background: rgba(154, 97, 0, 0.08);
      color: var(--attention);
    }

    .pill.blocked {
      border-color: rgba(180, 35, 24, 0.25);
      background: rgba(180, 35, 24, 0.08);
      color: var(--blocked);
    }

    .table-wrap {
      overflow-x: auto;
    }

    table.compact {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    table.compact th,
    table.compact td {
      text-align: left;
      vertical-align: top;
      padding: 8px 10px;
      border-top: 1px solid var(--line);
    }

    table.compact th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }

    .row-attention {
      background: rgba(154, 97, 0, 0.04);
    }

    .row-blocked {
      background: rgba(180, 35, 24, 0.05);
    }

    .drilldown {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfe;
      padding: 12px;
    }

    .drilldown summary {
      cursor: pointer;
      font-weight: 700;
      list-style: none;
    }

    .drilldown summary::-webkit-details-marker {
      display: none;
    }

    .drilldown-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .drilldown-copy {
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
    }

    .drilldown-body {
      margin-top: 12px;
      display: grid;
      gap: 12px;
    }

    .evidence-stack {
      display: grid;
      gap: 6px;
    }

    .code-chip {
      display: block;
      width: fit-content;
      max-width: 100%;
      overflow-wrap: anywhere;
      padding: 4px 6px;
      border-radius: 4px;
      background: #eef2f7;
      color: #1c2b45;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .object {
      min-height: 126px;
    }

    .action {
      min-height: 132px;
    }

    .action {
      display: grid;
      gap: 10px;
    }

    .action-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .action-meta div {
      min-width: 0;
    }

    .command-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: start;
    }

    button {
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
      color: var(--ink);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .small {
      color: var(--muted);
      font-size: 12px;
    }

    ul {
      margin: 8px 0 0 18px;
      padding: 0;
    }

    code {
      display: inline-block;
      max-width: 100%;
      overflow-wrap: anywhere;
      padding: 2px 5px;
      border-radius: 4px;
      background: #eef2f7;
      color: #1c2b45;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .boundary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .boundary-item {
      min-height: 64px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fbfcfe;
    }

    .source-note {
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    @media (max-width: 860px) {
      .hero, .grid-2, .grid-3, .signal-grid, .boundary, .action-meta, .question-grid {
        grid-template-columns: 1fr;
      }

      .headline-title {
        font-size: 24px;
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
        padding: 14px 0;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topbar">
      <div>
        <h1>JiSpec Console</h1>
        <p class="source-note">${escapeHtml(normalizePath(model.root))}</p>
      </div>
      <span class="badge ${statusClass(model.dashboard.headline.status)}">${escapeHtml(model.dashboard.headline.status)}</span>
    </div>
  </header>
  <main class="wrap stack">
    <section class="hero" aria-labelledby="governance-status">
      <div class="panel headline">
        <div class="status-row">
          <span class="badge ${statusClass(model.dashboard.headline.status)}">${escapeHtml(model.dashboard.headline.status)}</span>
          <span class="small">Governance status</span>
        </div>
        <h2 id="governance-status" class="headline-title">${escapeHtml(model.dashboard.headline.title)}</h2>
        <p class="summary">${escapeHtml(model.dashboard.headline.summary)}</p>
        <div class="signal-grid" aria-label="First screen governance answers">
          ${headlineSignal("Mergeability", model.dashboard.headline.mergeability.status, model.dashboard.headline.mergeability.answer)}
          ${headlineSignal("Risk", model.dashboard.headline.risk.level, model.dashboard.headline.risk.summary)}
          ${headlineSignal("Owner action", model.dashboard.headline.ownerAction.owner, model.dashboard.headline.ownerAction.command)}
          ${headlineSignal("Evidence source", model.dashboard.headline.evidence.primary, model.dashboard.headline.evidence.sources.slice(1, 3).join(", "))}
        </div>
        <p class="source-note">Source: ${escapeHtml(model.dashboard.headline.source)}</p>
      </div>
      <div class="panel">
        <h2>Local Snapshot</h2>
        <div class="meta-grid">
          ${metric("Artifacts", `${model.snapshot.summary.availableArtifacts}/${model.snapshot.summary.totalArtifacts}`)}
          ${metric("Governance", `${model.snapshot.governance.summary.availableObjects}/${model.snapshot.governance.summary.totalObjects}`)}
          ${metric("Missing", String(model.snapshot.summary.missingArtifacts))}
          ${metric("Invalid", String(model.snapshot.summary.invalidArtifacts + model.snapshot.summary.unreadableArtifacts))}
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="questions">
      <h2 id="questions">Governance Questions</h2>
      <div class="grid-2">
        ${model.dashboard.questions.map((question) => renderQuestion(question, model)).join("\n")}
      </div>
    </section>

    <section class="panel" aria-labelledby="objects">
      <h2 id="objects">Governance Objects</h2>
      <div class="grid-3">
        ${objects.map(renderGovernanceObject).join("\n")}
      </div>
    </section>

    <section class="panel" aria-labelledby="actions">
      <h2 id="actions">Suggested Local Commands</h2>
      <p class="small">These are read-only suggestions from Console. The UI does not execute commands.</p>
      <div class="grid-2" style="margin-top: 12px;">
        ${suggestedActions.length > 0 ? suggestedActions.map(renderAction).join("\n") : "<p>No governance actions suggested from current artifacts.</p>"}
      </div>
    </section>

    <section class="panel" aria-labelledby="boundary">
      <h2 id="boundary">Boundary</h2>
      <div class="boundary">
        ${boundaryItem("Read-only UI", "yes")}
        ${boundaryItem("Source upload", "no")}
        ${boundaryItem("Overrides verify", "no")}
        ${boundaryItem("Scans source code", "no")}
      </div>
    </section>
  </main>
  <script type="application/json" id="jispec-console-data">${escapeScriptJson(JSON.stringify({
    version: model.version,
    generatedAt: model.generatedAt,
    boundary: model.boundary,
    headline: model.dashboard.headline,
    questions: model.dashboard.questions,
    governanceSummary: model.snapshot.governance.summary,
    actionDecisionPackets: model.actions.actions.map((action) => action.decisionPacket),
  }))}</script>
  <script>
    for (const button of document.querySelectorAll("[data-copy-command]")) {
      button.addEventListener("click", async () => {
        const command = button.getAttribute("data-copy-command") || "";
        try {
          await navigator.clipboard.writeText(command);
          button.textContent = "Copied";
        } catch {
          button.textContent = "Select command";
        }
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      });
    }
  </script>
</body>
</html>
`;
}

export function renderLocalConsoleUiResultJSON(result: LocalConsoleUiWriteResult): string {
  return JSON.stringify({
    outPath: result.outPath,
    relativeOutPath: result.relativeOutPath,
    bytesWritten: result.bytesWritten,
    boundary: result.model.boundary,
    headline: result.model.dashboard.headline,
  }, null, 2);
}

export function renderLocalConsoleUiResultText(result: LocalConsoleUiWriteResult): string {
  return [
    "Local Console UI written.",
    `Path: ${result.relativeOutPath}`,
    `Headline: ${result.model.dashboard.headline.status.toUpperCase()} - ${result.model.dashboard.headline.title}`,
    "Boundary: read-only, offline-capable, no source upload, does not override verify.",
  ].join("\n");
}

function renderQuestion(
  question: ConsoleGovernanceDashboard["questions"][number],
  model: LocalConsoleUiModel,
): string {
  if (question.id === "retakeover_pool_health") {
    return renderRetakeoverPoolQuestion(question, model);
  }

  return `<article class="question">
  <div class="status-row">
    <span class="badge ${statusClass(question.status)}">${escapeHtml(question.status)}</span>
    <h3>${escapeHtml(question.label)}</h3>
  </div>
  <p>${escapeHtml(question.answer)}</p>
  ${question.evidence.length > 0 ? `<div><p class="small">Evidence</p><ul>${question.evidence.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
  ${question.nextActions.length > 0 ? `<div><p class="small">Next</p><ul>${question.nextActions.slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
</article>`;
}

function renderRetakeoverPoolQuestion(
  question: ConsoleGovernanceDashboard["questions"][number],
  model: LocalConsoleUiModel,
): string {
  const summary = model.snapshot.governance.objects.find((object) => object.id === "takeover_quality_trend")?.summary ?? {};
  const coverageRate = numberValue(summary.poolCoverageRate);
  const coveredClasses = numberValue(summary.poolCoveredFixtureClassCount);
  const knownClasses = numberValue(summary.poolKnownFixtureClassCount);
  const fixtureCatalogCount = numberValue(summary.poolFixtureCatalogCount);
  const fixtureCount = numberValue(summary.poolFixtureCount);
  const missingClasses = stringArray(summary.poolMissingFixtureClasses);
  const readinessThreshold = numberValue(summary.poolReadinessThreshold);
  const readinessLowest = numberValue(summary.poolReadinessLowestObserved);
  const readinessMisses = stringArray(summary.poolReadinessFixturesBelowThreshold);
  const precisionThreshold = numberValue(summary.poolContractPrecisionThreshold);
  const precisionLowest = numberValue(summary.poolContractPrecisionLowestObserved);
  const precisionMisses = stringArray(summary.poolContractPrecisionFixturesBelowThreshold);
  const behaviorThreshold = numberValue(summary.poolBehaviorStrengthThreshold);
  const behaviorLowest = numberValue(summary.poolBehaviorStrengthLowestObserved);
  const behaviorMisses = stringArray(summary.poolBehaviorFixturesBelowThreshold);
  const fixtureCatalog = recordArray(summary.poolFixtureCatalog);
  const sortedFixtureCatalog = [...fixtureCatalog].sort((left, right) =>
    compareFixturePriority(left, right, readinessMisses, precisionMisses, behaviorMisses)
  );
  const severityCounts = countFixtureSeverities(
    fixtureCatalog,
    readinessMisses,
    precisionMisses,
    behaviorMisses,
  );
  const fixturesWithMisses = fixtureCatalog.filter((entry) =>
    fixtureMissSeverity(entry, readinessMisses, precisionMisses, behaviorMisses) !== "ok"
  ).length;
  const fixtureDrilldown = fixtureCatalog.length > 0
    ? `<details class="drilldown">
    <summary>
      <span class="drilldown-summary">
        <span>Fixture Drill-Down</span>
        <span class="drilldown-copy">${escapeHtml(`${fixturesWithMisses}/${fixtureCatalog.length} fixture(s) need attention`)}</span>
        ${renderSeverityCountPills(severityCounts)}
      </span>
    </summary>
    <div class="drilldown-body">
      <p class="small">Use baseline misses to spot the regressed fixture, then inspect its class, decision paths, and representative evidence.</p>
      <div class="table-wrap">
        <table class="compact">
          <thead>
            <tr><th>Fixture ID</th><th>Class</th><th>Coverage Signals</th><th>Decision Paths</th><th>Top Evidence Sample</th></tr>
          </thead>
          <tbody>
            ${sortedFixtureCatalog.map((entry) => renderFixtureDrilldownRow(entry, readinessMisses, precisionMisses, behaviorMisses)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  </details>`
    : `<div><p class="small">Fixture Drill-Down</p><p class="small">No fixture catalog is available yet.</p></div>`;

  return `<article class="question question-special">
  <div class="status-row">
    <span class="badge ${statusClass(question.status)}">${escapeHtml(question.status)}</span>
    <h3>${escapeHtml(question.label)}</h3>
  </div>
  <p>${escapeHtml(question.answer)}</p>
  <div class="question-grid">
    ${questionMetric("Coverage", formatPercent(coverageRate), `${coveredClasses ?? "unknown"}/${knownClasses ?? "unknown"} fixture classes`)}
    ${questionMetric("Fixture Catalog", fixtureCatalogCount !== undefined ? String(fixtureCatalogCount) : "unknown", `${fixtureCount ?? "unknown"} pooled fixture(s)`)}
    ${questionMetric("Missing Classes", String(missingClasses.length), missingClasses.length > 0 ? missingClasses.slice(0, 2).join(", ") : "none")}
  </div>
  <div>
    <p class="small">Missing Fixture Classes</p>
    ${missingClasses.length > 0 ? `<div class="inline-pills">${missingClasses.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>` : `<p class="small">None. Coverage is complete for the current catalog.</p>`}
  </div>
  <div>
    <p class="small">Quality Baseline</p>
    <div class="table-wrap">
      <table class="compact">
        <thead>
          <tr><th>Signal</th><th>Threshold</th><th>Lowest Observed</th><th>Fixtures Below Threshold</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Takeover readiness</td>
            <td>${escapeHtml(readinessThreshold !== undefined ? `${readinessThreshold}/100` : "unknown")}</td>
            <td>${escapeHtml(readinessLowest !== undefined ? `${readinessLowest}/100` : "unknown")}</td>
            <td>${escapeHtml(renderInlineList(readinessMisses))}</td>
          </tr>
          <tr>
            <td>Contract precision</td>
            <td>${escapeHtml(formatPercent(precisionThreshold))}</td>
            <td>${escapeHtml(formatPercent(precisionLowest))}</td>
            <td>${escapeHtml(renderInlineList(precisionMisses))}</td>
          </tr>
          <tr>
            <td>Behavior strength</td>
            <td>${escapeHtml(formatPercent(behaviorThreshold))}</td>
            <td>${escapeHtml(formatPercent(behaviorLowest))}</td>
            <td>${escapeHtml(renderInlineList(behaviorMisses))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  ${fixtureDrilldown}
  ${question.evidence.length > 0 ? `<div><p class="small">Evidence</p><ul>${question.evidence.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
  ${question.nextActions.length > 0 ? `<div><p class="small">Next Actions</p><ul>${question.nextActions.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
</article>`;
}

function renderFixtureDrilldownRow(
  entry: Record<string, unknown>,
  readinessMisses: string[],
  precisionMisses: string[],
  behaviorMisses: string[],
): string {
  const fixtureId = typeof entry.fixtureId === "string" ? entry.fixtureId : "unknown";
  const fixtureClass = typeof entry.fixtureClass === "string" ? entry.fixtureClass : "unknown";
  const coverageSignals = stringArray(entry.coverageSignals);
  const artifactDecisionPaths = stringArray(entry.artifactDecisionPaths);
  const topEvidenceSample = stringArray(entry.topEvidenceSample).slice(0, 5);
  const severity = fixtureMissSeverity(entry, readinessMisses, precisionMisses, behaviorMisses);
  const rowClass = severity === "ok" ? "" : ` class="row-${severity}"`;

  return `<tr${rowClass}>
    <td><span class="pill ${severity}">${escapeHtml(fixtureId)}</span></td>
    <td>${escapeHtml(fixtureClass)}</td>
    <td>${renderSignalPills(coverageSignals, severity)}</td>
    <td>${renderSignalPills(artifactDecisionPaths, severity)}</td>
    <td>${renderEvidenceSample(topEvidenceSample)}</td>
  </tr>`;
}

function renderGovernanceObject(object: ConsoleGovernanceObjectSnapshot): string {
  const summaryPairs = Object.entries(object.summary)
    .slice(0, 4)
    .map(([key, value]) => `<li>${escapeHtml(labelize(key))}: ${escapeHtml(formatSummaryValue(value))}</li>`)
    .join("");

  return `<article class="object">
  <div class="status-row">
    <span class="badge ${objectStatusClass(object.status)}">${escapeHtml(object.status)}</span>
    <h3>${escapeHtml(object.label)}</h3>
  </div>
  <ul>${summaryPairs || "<li>No summary yet</li>"}</ul>
  <p class="small">${escapeHtml(object.sourcePaths[0] ?? object.missingSourceArtifactIds[0] ?? "waiting for local artifact")}</p>
</article>`;
}

function renderAction(action: ConsoleGovernanceActionPlan["actions"][number]): string {
  const packet = action.decisionPacket;
  return `<article class="action">
  <h3>${escapeHtml(action.title)}</h3>
  <p>${escapeHtml(action.reason)}</p>
  <div class="action-meta">
    <div><p class="small">Owner</p><p>${escapeHtml(packet.owner)}</p></div>
    <div><p class="small">Risk</p><p>${escapeHtml(packet.risk.level)} - ${escapeHtml(packet.risk.summary)}</p></div>
    <div><p class="small">Affected</p><p>${escapeHtml(formatList(packet.affectedContracts))}</p></div>
    <div><p class="small">Source</p><p>${escapeHtml(formatList(packet.sourceArtifacts))}</p></div>
  </div>
  <div class="command-row">
    <code>${escapeHtml(packet.recommendedCommand)}</code>
    <button type="button" data-copy-command="${escapeHtml(packet.recommendedCommand)}">Copy</button>
  </div>
  <p class="small">Status: ${escapeHtml(action.status)} · Kind: ${escapeHtml(action.kind)} · Writes if run: ${escapeHtml(formatList(packet.commandWrites))}</p>
</article>`;
}

function headlineSignal(label: string, value: string, detail?: string): string {
  return `<div class="signal">
  <div class="signal-label">${escapeHtml(label)}</div>
  <div class="signal-value">${escapeHtml(value)}</div>
  ${detail && detail.trim().length > 0 ? `<p class="signal-detail">${escapeHtml(detail)}</p>` : ""}
</div>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></div>`;
}

function questionMetric(label: string, value: string, detail: string): string {
  return `<div class="question-metric"><div class="question-metric-label">${escapeHtml(label)}</div><div class="question-metric-value">${escapeHtml(value)}</div><div class="question-metric-detail">${escapeHtml(detail)}</div></div>`;
}

function boundaryItem(label: string, value: string): string {
  return `<div class="boundary-item"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></div>`;
}

function statusClass(status: ConsoleGovernanceStatus): string {
  return status;
}

function objectStatusClass(status: ConsoleGovernanceObjectSnapshot["status"]): string {
  if (status === "available") {
    return "ok";
  }
  if (status === "partial") {
    return "attention";
  }
  if (status === "invalid") {
    return "blocked";
  }
  return "unknown";
}

function labelize(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function formatSummaryValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "not declared";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} item(s)`;
  }
  if (typeof value === "object") {
    return "available";
  }
  return String(value);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "not declared";
}

function renderInlineList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "unknown" : `${Math.round(value * 100)}%`;
}

function renderSignalPills(values: string[], severity: "ok" | "attention" | "blocked"): string {
  if (values.length === 0) {
    return `<span class="small">none</span>`;
  }
  return `<div class="inline-pills">${values.map((value) => `<span class="pill ${severity}">${escapeHtml(value)}</span>`).join("")}</div>`;
}

function renderEvidenceSample(values: string[]): string {
  if (values.length === 0) {
    return `<span class="small">none</span>`;
  }
  return `<div class="evidence-stack">${values.map((value) => `<span class="code-chip">${escapeHtml(value)}</span>`).join("")}</div>`;
}

function fixtureMissSeverity(
  entry: Record<string, unknown>,
  readinessMisses: string[],
  precisionMisses: string[],
  behaviorMisses: string[],
): "ok" | "attention" | "blocked" {
  const fixtureId = typeof entry.fixtureId === "string" ? entry.fixtureId : "";
  let missCount = 0;
  if (readinessMisses.includes(fixtureId)) {
    missCount++;
  }
  if (precisionMisses.includes(fixtureId)) {
    missCount++;
  }
  if (behaviorMisses.includes(fixtureId)) {
    missCount++;
  }
  if (missCount >= 2) {
    return "blocked";
  }
  if (missCount === 1) {
    return "attention";
  }
  return "ok";
}

function compareFixturePriority(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  readinessMisses: string[],
  precisionMisses: string[],
  behaviorMisses: string[],
): number {
  const severityDelta = severityRank(fixtureMissSeverity(right, readinessMisses, precisionMisses, behaviorMisses))
    - severityRank(fixtureMissSeverity(left, readinessMisses, precisionMisses, behaviorMisses));
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const leftId = typeof left.fixtureId === "string" ? left.fixtureId : "";
  const rightId = typeof right.fixtureId === "string" ? right.fixtureId : "";
  return leftId.localeCompare(rightId);
}

function severityRank(severity: "ok" | "attention" | "blocked"): number {
  if (severity === "blocked") {
    return 2;
  }
  if (severity === "attention") {
    return 1;
  }
  return 0;
}

function countFixtureSeverities(
  entries: Record<string, unknown>[],
  readinessMisses: string[],
  precisionMisses: string[],
  behaviorMisses: string[],
): Record<"blocked" | "attention" | "ok", number> {
  return entries.reduce(
    (counts, entry) => {
      counts[fixtureMissSeverity(entry, readinessMisses, precisionMisses, behaviorMisses)] += 1;
      return counts;
    },
    { blocked: 0, attention: 0, ok: 0 },
  );
}

function renderSeverityCountPills(counts: Record<"blocked" | "attention" | "ok", number>): string {
  return `<span class="inline-pills">
    <span class="pill blocked">blocked ${escapeHtml(String(counts.blocked))}</span>
    <span class="pill attention">attention ${escapeHtml(String(counts.attention))}</span>
    <span class="pill ok">ok ${escapeHtml(String(counts.ok))}</span>
  </span>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
