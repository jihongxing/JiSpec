export const DECISION_COMPANION_SECTION_TITLES = [
  "判断对象",
  "最强证据",
  "推断证据",
  "冲突/drift",
  "影响契约/测试",
  "下一步",
] as const;

export interface DecisionCompanionSectionsInput {
  subject: string;
  truthSources: string[];
  strongestEvidence: string[];
  inferredEvidence: string[];
  drift: string[];
  impact: string[];
  nextSteps: string[];
  maxLines?: number;
}

export interface DecisionCompanionSummary {
  path: string;
  summary: string;
}

export function renderDecisionCompanionSections(input: DecisionCompanionSectionsInput): string {
  const maxLines = Math.max(1, input.maxLines ?? 150);
  const lines = [
    "## 判断对象",
    `- ${normalizeText(input.subject, "unknown")}`,
    "- Truth sources:",
    ...renderList(input.truthSources),
    "",
    "## 最强证据",
    ...renderList(input.strongestEvidence),
    "",
    "## 推断证据",
    ...renderList(input.inferredEvidence),
    "",
    "## 冲突/drift",
    ...renderList(input.drift),
    "",
    "## 影响契约/测试",
    ...renderList(input.impact),
    "",
    "## 下一步",
    ...renderList(input.nextSteps),
  ];

  return `${enforceLineBudget(lines, maxLines).join("\n").trimEnd()}\n`;
}

export function summarizeDecisionCompanion(input: { path: string; text: string }): DecisionCompanionSummary {
  const subject = firstBulletAfter(input.text, "## 判断对象") ?? "companion summary unavailable";
  const strongestEvidence = firstBulletAfter(input.text, "## 最强证据") ?? "strongest evidence unavailable";
  return {
    path: normalizePath(input.path),
    summary: `${subject}; ${strongestEvidence}`,
  };
}

export function splitDecisionCompanionSections(input: DecisionCompanionSectionsInput): string[] {
  return renderDecisionCompanionSections(input).trimEnd().split("\n");
}

function renderList(values: string[]): string[] {
  const normalized = values
    .map((value) => normalizeText(value, ""))
    .filter((value) => value.length > 0);
  return normalized.length > 0
    ? normalized.map((value) => `- ${value}`)
    : ["- none"];
}

function normalizeText(value: string, fallback: string): string {
  const trimmed = value.replace(/\r?\n/g, " ").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function firstBulletAfter(text: string, heading: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) {
    return undefined;
  }
  const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && line.startsWith("## "));
  const sectionLines = nextHeadingIndex < 0
    ? lines.slice(headingIndex + 1)
    : lines.slice(headingIndex + 1, nextHeadingIndex);
  const bullet = sectionLines.find((line) => line.startsWith("- ") && line !== "- Truth sources:");
  return bullet?.slice(2).trim();
}

function enforceLineBudget(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }
  if (maxLines === 1) {
    return ["- Companion truncated to preserve reviewer line budget."];
  }
  const trimmed = lines.slice(0, Math.max(0, maxLines - 2));
  trimmed.push("", "- Companion truncated to preserve reviewer line budget.");
  return trimmed;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
