import fs from "node:fs";
import path from "node:path";
import {
  isGreenfieldSpecDebtExpired,
  loadGreenfieldSpecDebtLedger,
  summarizeGreenfieldSpecDebt,
  type GreenfieldSpecDebtRecord,
} from "../greenfield/spec-debt-ledger";
import type { VerifyIssue } from "./verdict";

const LEDGER_PATH = ".spec/spec-debt/ledger.yaml";

export function collectGreenfieldSpecDebtIssues(rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const ledgerPath = path.join(root, LEDGER_PATH);
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }

  const ledger = loadGreenfieldSpecDebtLedger(root);
  const issues: VerifyIssue[] = [];

  for (const record of ledger.debts) {
    if (record.status !== "open") {
      continue;
    }

    issues.push({
      kind: "semantic",
      severity: "advisory",
      code: isGreenfieldSpecDebtExpired(record) ? "GREENFIELD_SPEC_DEBT_EXPIRED" : "GREENFIELD_SPEC_DEBT_OPEN",
      path: LEDGER_PATH,
      message: renderDebtIssueMessage(record),
      details: {
        debt_id: record.id,
        debt_kind: record.kind,
        owner: record.owner,
        expires_at: record.expires_at,
        affected_assets: record.affected_assets,
        repayment_hint: record.repayment_hint,
      },
    });
  }

  const summary = summarizeGreenfieldSpecDebt(root);
  for (const warning of summary.warnings) {
    issues.push({
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_SPEC_DEBT_LEDGER_WARNING",
      path: LEDGER_PATH,
      message: warning,
    });
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.path ?? ""}|${left.message}`.localeCompare(`${right.code}|${right.path ?? ""}|${right.message}`),
  );
}

function renderDebtIssueMessage(record: GreenfieldSpecDebtRecord): string {
  const expiry = record.expires_at ? ` Expires at ${record.expires_at}.` : "";
  const expired = isGreenfieldSpecDebtExpired(record) ? "Expired " : "";
  return `${expired}Spec debt ${record.id} (${record.kind}) remains open for ${record.owner}: ${record.reason}.${expiry}`;
}
