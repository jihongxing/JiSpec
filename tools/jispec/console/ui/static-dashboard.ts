import fs from "node:fs";
import path from "node:path";
import {
  buildConsoleGovernanceActionPlan,
  type ConsoleGovernanceActionPlan,
} from "../governance-actions";
import {
  buildConsoleGovernanceDashboard,
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
  const dashboard = buildConsoleGovernanceDashboard(root);
  const snapshot = collectConsoleLocalSnapshot(root);
  const actions = buildConsoleGovernanceActionPlan(root);

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
      .hero, .grid-2, .grid-3, .boundary, .action-meta {
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
        ${model.dashboard.questions.map(renderQuestion).join("\n")}
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

function renderQuestion(question: ConsoleGovernanceDashboard["questions"][number]): string {
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

function metric(label: string, value: string): string {
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></div>`;
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
