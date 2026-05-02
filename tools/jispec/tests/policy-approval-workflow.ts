import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { readAuditEvents } from "../audit/event-ledger";
import {
  evaluatePolicyApprovalWorkflow,
  recordPolicyApproval,
  readPolicyApprovals,
} from "../policy/approval";
import { buildConsoleGovernanceDashboard } from "../console/governance-dashboard";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Policy Approval Workflow Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("regulated profile accepts two reviewers or owner approval", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-regulated-"));
    try {
      writePolicy(root, {
        profile: "regulated",
        owner: "owner-a",
        reviewers: ["alice", "bob"],
        required_reviewers: 2,
      });

      recordPolicyApproval(root, {
        id: "approval-alice",
        subjectKind: "policy_change",
        actor: "alice",
        role: "reviewer",
        reason: "Reviewed policy diff.",
      });
      let posture = evaluatePolicyApprovalWorkflow(root);
      assert.equal(posture.profile, "regulated");
      assert.equal(posture.requirement.requiredReviewers, 2);
      assert.equal(posture.status, "approval_missing");
      assert.equal(posture.subjects[0]?.missingReviewers, 1);

      recordPolicyApproval(root, {
        id: "approval-bob",
        subjectKind: "policy_change",
        actor: "bob",
        role: "reviewer",
        reason: "Second reviewer approval.",
      });
      posture = evaluatePolicyApprovalWorkflow(root);
      assert.equal(posture.status, "approval_satisfied");
      assert.deepEqual(posture.subjects[0]?.approvedReviewers, ["alice", "bob"]);

      const ownerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-owner-"));
      try {
        writePolicy(ownerRoot, {
          profile: "regulated",
          owner: "owner-a",
          reviewers: ["alice", "bob"],
          required_reviewers: 2,
        });
        recordPolicyApproval(ownerRoot, {
          id: "approval-owner",
          subjectKind: "policy_change",
          actor: "owner-a",
          role: "owner",
          reason: "Owner accepted the regulated policy change.",
        });
        const ownerPosture = evaluatePolicyApprovalWorkflow(ownerRoot);
        assert.equal(ownerPosture.status, "approval_satisfied");
        assert.equal(ownerPosture.subjects[0]?.ownerApprovedBy, "owner-a");
      } finally {
        fs.rmSync(ownerRoot, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("approval becomes stale when the subject hash changes or expires", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-stale-"));
    try {
      writePolicy(root, {
        profile: "small_team",
        owner: "owner-a",
        reviewers: ["alice"],
        required_reviewers: 1,
      });
      recordPolicyApproval(root, {
        id: "approval-before-change",
        subjectKind: "policy_change",
        actor: "owner-a",
        role: "owner",
        reason: "Owner approved the current policy.",
      });
      assert.equal(evaluatePolicyApprovalWorkflow(root).status, "approval_satisfied");

      writePolicy(root, {
        profile: "small_team",
        owner: "owner-a",
        reviewers: ["alice"],
        required_reviewers: 1,
        ruleId: "changed-rule",
      });
      const changed = evaluatePolicyApprovalWorkflow(root);
      assert.equal(changed.status, "approval_stale");
      assert.deepEqual(changed.subjects[0]?.staleApprovalIds, ["approval-before-change"]);

      const expiredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-expired-"));
      try {
        writePolicy(expiredRoot, {
          profile: "small_team",
          owner: "owner-a",
          reviewers: ["alice"],
          required_reviewers: 1,
        });
        recordPolicyApproval(expiredRoot, {
          id: "approval-expired",
          subjectKind: "policy_change",
          actor: "owner-a",
          role: "owner",
          reason: "Temporary owner approval.",
          expiresAt: "2020-01-01T00:00:00.000Z",
        });
        assert.equal(evaluatePolicyApprovalWorkflow(expiredRoot).status, "approval_stale");
      } finally {
        fs.rmSync(expiredRoot, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI records approval decisions and writes audit events", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-cli-"));
    try {
      writePolicy(root, {
        profile: "solo",
        owner: "owner-a",
        reviewers: [],
        required_reviewers: 0,
      });
      const result = runCli([
        "policy",
        "approval",
        "record",
        "--root",
        root,
        "--id",
        "approval-cli",
        "--subject-kind",
        "policy_change",
        "--actor",
        "owner-a",
        "--role",
        "owner",
        "--reason",
        "CLI approval test.",
        "--json",
      ]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as { approval: { id: string; boundary: Record<string, unknown> } };
      assert.equal(payload.approval.id, "approval-cli");
      assert.equal(payload.approval.boundary.llmBlockingJudge, false);
      assert.equal(readPolicyApprovals(root).length, 1);

      const events = readAuditEvents(root);
      assert.equal(events.some((event) => event.type === "policy_approval_decision"), true);

      const status = runCli(["policy", "approval", "status", "--root", root, "--json"]);
      assert.equal(status.status, 0, status.stderr);
      assert.equal(JSON.parse(status.stdout).status, "approval_satisfied");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Console shows approval missing, satisfied, and stale states", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-console-"));
    try {
      writePolicy(root, {
        profile: "small_team",
        owner: "owner-a",
        reviewers: ["alice"],
        required_reviewers: 1,
      });
      let question = dashboardQuestion(root, "approval_workflow_status");
      assert.equal(question.status, "attention");
      assert.match(question.answer, /missing/i);

      recordPolicyApproval(root, {
        id: "approval-owner",
        subjectKind: "policy_change",
        actor: "owner-a",
        role: "owner",
        reason: "Owner approval for console posture.",
      });
      question = dashboardQuestion(root, "approval_workflow_status");
      assert.equal(question.status, "ok");
      assert.match(question.answer, /satisfied/i);

      writePolicy(root, {
        profile: "small_team",
        owner: "owner-a",
        reviewers: ["alice"],
        required_reviewers: 1,
        ruleId: "console-policy-changed",
      });
      question = dashboardQuestion(root, "approval_workflow_status");
      assert.equal(question.status, "attention");
      assert.match(question.answer, /stale/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("approval contract stays local-first and does not make an LLM a blocking judge", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-boundary-"));
    try {
      writePolicy(root, {
        profile: "small_team",
        owner: "owner-a",
        reviewers: ["alice"],
        required_reviewers: 1,
      });
      const result = recordPolicyApproval(root, {
        id: "approval-boundary",
        subjectKind: "policy_change",
        actor: "alice",
        role: "reviewer",
        reason: "Reviewer checked the deterministic policy artifact.",
      });
      assert.equal(result.approval.boundary.sourceUploadRequired, false);
      assert.equal(result.approval.boundary.llmBlockingJudge, false);
      assert.equal(result.approval.boundary.consoleOverridesVerify, false);

      const posture = evaluatePolicyApprovalWorkflow(root);
      assert.equal(posture.boundary.sourceUploadRequired, false);
      assert.equal(posture.boundary.llmBlockingJudge, false);
      assert.equal(posture.boundary.replacesVerify, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("regulated pilot risk acceptance requires approval before posture is satisfied", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-approval-pilot-risk-"));
    try {
      writePolicy(root, {
        profile: "regulated",
        owner: "pilot-owner",
        reviewers: ["alice", "bob"],
        required_reviewers: 2,
      });
      writeJson(root, ".spec/privacy/privacy-report.json", {
        kind: "jispec-privacy-report",
        summary: {
          scannedArtifactCount: 4,
          findingCount: 1,
          highSeverityFindingCount: 1,
          reviewBeforeSharingArtifactCount: 1,
        },
      });

      recordPolicyApproval(root, {
        id: "approval-policy-owner",
        subjectKind: "policy_change",
        actor: "pilot-owner",
        role: "owner",
        reason: "Owner accepted the regulated policy baseline.",
      });
      let posture = evaluatePolicyApprovalWorkflow(root);
      const pilotSubject = posture.subjects.find((subject) => subject.subject.kind === "pilot_risk_acceptance");
      assert.ok(pilotSubject);
      assert.equal(posture.status, "approval_missing");
      assert.equal(pilotSubject?.status, "approval_missing");
      assert.equal(pilotSubject?.missingReviewers, 2);

      recordPolicyApproval(root, {
        id: "approval-pilot-risk-owner",
        subjectKind: "pilot_risk_acceptance",
        actor: "pilot-owner",
        role: "owner",
        reason: "Owner accepts the high-severity privacy risk before pilot sharing.",
      });
      posture = evaluatePolicyApprovalWorkflow(root);
      assert.equal(posture.status, "approval_satisfied");
      assert.equal(
        posture.subjects.find((subject) => subject.subject.kind === "pilot_risk_acceptance")?.ownerApprovedBy,
        "pilot-owner",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

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

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function dashboardQuestion(root: string, id: string) {
  const dashboard = buildConsoleGovernanceDashboard(root);
  const question = dashboard.questions.find((entry) => entry.id === id);
  assert.ok(question, `Missing dashboard question ${id}`);
  return question;
}

function writePolicy(
  root: string,
  team: {
    profile: string;
    owner: string;
    reviewers: string[];
    required_reviewers: number;
    ruleId?: string;
  },
): void {
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    team: {
      profile: team.profile,
      owner: team.owner,
      reviewers: team.reviewers,
      required_reviewers: team.required_reviewers,
    },
    rules: [
      {
        id: team.ruleId ?? "policy-approval-test-rule",
        enabled: true,
        action: "warn",
        message: "Test policy approval rule",
        when: {
          fact: "verify.issue_count",
          op: ">",
          value: 0,
        },
      },
    ],
  });
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
