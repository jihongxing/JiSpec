import type { AgentRunSession, DisciplineCheckStatus, DisciplinePhase } from "./types";

const PHASE_ORDER: DisciplinePhase[] = ["intent", "design", "plan", "implement", "debug", "verify", "handoff"];

export function validatePhaseGate(session: AgentRunSession): { status: DisciplineCheckStatus; issues: string[] } {
  const issues: string[] = [];
  let previousIndex = -1;

  for (const transition of session.transitions) {
    const currentIndex = PHASE_ORDER.indexOf(transition.phase);
    if (currentIndex < previousIndex) {
      issues.push(`phase_order_invalid: ${transition.phase} appears after a later phase`);
    }
    previousIndex = Math.max(previousIndex, currentIndex);
  }

  const phases = new Set(session.transitions.map((transition) => transition.phase));
  if (session.mode === "strict_gate" && phases.has("implement") && !phases.has("plan")) {
    issues.push("strict implementation requires plan phase evidence");
  }
  if (phases.has("handoff") && !phases.has("verify")) {
    issues.push("handoff phase requires verify phase evidence");
  }

  return {
    status: issues.length === 0 ? "passed" : "failed",
    issues,
  };
}
