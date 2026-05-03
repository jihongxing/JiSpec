import type { ChangeSession } from "../change/change-session";
import type { TestStrategy } from "./types";

export function buildTestStrategy(session: ChangeSession, testCommand: string | undefined, fast: boolean): TestStrategy {
  const scope = inferScope(session);
  const command = testCommand ?? (fast ? "npm run jispec-cli -- verify --fast" : "npm run verify");
  const ownerReviewRequired = scope === "unknown" || command.trim().length === 0;

  return {
    command,
    scope,
    expectedSignal: scope === "docs_only"
      ? "Verify remains non-blocking after docs-only change."
      : "Contract-critical verification remains non-blocking after implementation.",
    whySufficient: scope === "docs_only"
      ? "Docs-only changes can use fast verify plus normal review because no adopted contract asset is changed."
      : "The command is deterministic and runs through JiSpec verification for governed paths.",
    deterministic: command.trim().length > 0 && !ownerReviewRequired,
    ownerReviewRequired,
  };
}

export function validateTestStrategy(strategy: TestStrategy): { status: "passed" | "failed"; issues: string[] } {
  const issues: string[] = [];
  if (strategy.command.trim().length === 0) {
    issues.push("test strategy command missing");
  }
  if (!strategy.deterministic && !strategy.ownerReviewRequired) {
    issues.push("non-deterministic test strategy must require owner review");
  }
  if (strategy.scope === "contract_critical" && !strategy.deterministic) {
    issues.push("contract-critical change requires deterministic verification");
  }
  return {
    status: issues.length === 0 ? "passed" : "failed",
    issues,
  };
}

function inferScope(session: ChangeSession): TestStrategy["scope"] {
  if (session.changedPaths.length === 0) {
    return "unknown";
  }
  const kinds = new Set(session.changedPaths.map((entry) => entry.kind));
  if (kinds.size === 1 && kinds.has("docs_only")) {
    return "docs_only";
  }
  if ([...kinds].some((kind) =>
    kind === "domain_core" ||
    kind === "contract" ||
    kind === "api_surface" ||
    kind === "behavior_surface" ||
    kind === "test_only"
  )) {
    return "contract_critical";
  }
  return "mixed";
}
