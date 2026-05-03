import path from "node:path";
import { Command } from "commander";
import * as yaml from "js-yaml";
import packageJson from "../../package.json";
import { formatAgentResult, runAgent, type AgentRole } from "./agent-runner";
import { deriveAll, deriveBehavior, deriveDesign, deriveTests, syncTrace } from "./artifact-ops";
import { buildContextBoardReport } from "./context-board";
import { buildContextListReport, buildContextShowReport, buildContextStatusReport, buildSliceListReport } from "./context-report";
import { applyContextNext, applySliceNext, buildContextNextReport, buildSliceNextReport } from "./next-report";
import { buildSliceShowReport, buildSliceStatusReport } from "./slice-report";
import { advanceSlice, createSlice, updateSliceGates } from "./slice-ops";
import { planSlice } from "./slice-plan";
import { updateSliceTasks } from "./tasks";
import { buildTraceReport, validateSlice, validateSliceTraceOnly } from "./validator";
import { Doctor } from "./doctor.js";
import { renderBootstrapDiscoverText, runBootstrapDiscover, type BootstrapDiscoverOptions } from "./bootstrap/discover";
import type { BootstrapDiscoverResult } from "./bootstrap/evidence-graph";
import { renderBootstrapDraftText, runBootstrapDraft, type BootstrapDraftOptions, type BootstrapDraftResult } from "./bootstrap/draft";
import { renderBootstrapAdoptText, runBootstrapAdopt, type BootstrapAdoptResult } from "./bootstrap/adopt";
import {
  renderBootstrapInitProjectText,
  runBootstrapInitProject,
  type BootstrapInitProjectOptions,
  type BootstrapInitProjectResult,
} from "./bootstrap/init-project";
import { renderVerifyJSON, renderVerifyText, runVerify, type VerifyRunOptions } from "./verify/verify-runner";
import { buildVerifyReport } from "./ci/verify-report";
import { writeLocalVerifySummary } from "./ci/verify-summary";
import { createWaiver, listWaivers, renewWaiver, revokeWaiver, type WaiverCreateOptions, type WaiverCreateResult } from "./verify/waiver-store";
import { runChangeCommand, renderChangeCommandJSON, type ChangeCommandOptions } from "./change/change-command";
import {
  renderChangeDefaultModeJSON,
  renderChangeDefaultModeText,
  resetChangeDefaultMode,
  setChangeDefaultMode,
  showChangeDefaultMode,
} from "./change/default-mode-command";
import type { SpecDeltaChangeType } from "./change/spec-delta";
import { migrateVerifyPolicy, renderPolicyMigrationText } from "./policy/migrate-policy";
import {
  evaluatePolicyApprovalWorkflow,
  recordPolicyApproval,
  renderPolicyApprovalWorkflowJSON,
  renderPolicyApprovalWorkflowText,
  type ApprovalActorRole,
  type ApprovalDecisionStatus,
  type ApprovalSubjectKind,
} from "./policy/approval";
import { renderGreenfieldInitText, runGreenfieldInit, type GreenfieldInitOptions, type GreenfieldInitResult } from "./greenfield/init";
import {
  renderGreenfieldReviewBriefText,
  renderGreenfieldReviewListText,
  renderGreenfieldReviewTransitionText,
  runGreenfieldReviewBrief,
  runGreenfieldReviewList,
  runGreenfieldReviewTransition,
  type GreenfieldReviewAction,
  type GreenfieldReviewLanguage,
} from "./greenfield/review-workflow";
import {
  markGreenfieldSpecDebtOwnerReview,
  updateGreenfieldSpecDebtStatus,
} from "./greenfield/spec-debt-ledger";
import {
  compareReleaseBaselines,
  createReleaseSnapshot,
  renderReleaseCompareText,
  renderReleaseSnapshotText,
} from "./release/baseline-snapshot";
import {
  buildConsoleGovernanceDashboard,
  renderConsoleGovernanceDashboardJSON,
  renderConsoleGovernanceDashboardText,
} from "./console/governance-dashboard";
import {
  buildConsoleGovernanceActionPlan,
  renderConsoleGovernanceActionPlanJSON,
  renderConsoleGovernanceActionPlanText,
} from "./console/governance-actions";
import {
  exportConsoleGovernanceSnapshot,
  renderConsoleGovernanceExportJSON,
  renderConsoleGovernanceExportText,
} from "./console/governance-export";
import {
  aggregateMultiRepoGovernance,
  renderMultiRepoGovernanceAggregateJSON,
  renderMultiRepoGovernanceAggregateText,
} from "./console/multi-repo";
import {
  renderFirstRunJSON,
  renderFirstRunText,
  runFirstRun,
} from "./onboarding/first-run";
import {
  renderLocalConsoleUiResultJSON,
  renderLocalConsoleUiResultText,
  writeLocalConsoleUi,
} from "./console/ui/static-dashboard";
import {
  buildPrivacyReport,
  renderPrivacyReportJSON,
  renderPrivacyReportText,
} from "./privacy/redaction";
import {
  renderPilotProductPackageJSON,
  renderPilotProductPackageText,
  writePilotProductPackage,
} from "./pilot/product-package";
import {
  renderNorthStarAcceptanceJSON,
  renderNorthStarAcceptanceText,
  writeNorthStarAcceptance,
} from "./north-star/acceptance";
import {
  buildValueReport,
  renderValueReportJSON,
  renderValueReportText,
} from "./metrics/value-report";
import type { TeamPolicyProfileName } from "./policy/policy-schema";

type LegacySurface =
  | "slice"
  | "context"
  | "trace"
  | "artifact"
  | "agent"
  | "pipeline"
  | "template"
  | "dependency";

function buildPrimarySurfaceHelpText(): string {
  return [
    "Current primary surface:",
    "  jispec-cli init --requirements <path> [--technical-solution <path>] [--json]",
    "  jispec-cli first-run [--json]",
    "  jispec-cli verify [--json]",
    "  jispec-cli change <summary> [--mode prompt|execute] [--json]",
    "  jispec-cli change default-mode show|set|reset [--json]",
    "  jispec-cli review list|adopt|reject|defer|waive|brief [--json]",
    "  jispec-cli spec-debt repay|cancel|owner-review <id> [--json]",
    "  jispec-cli release snapshot --version <version> [--json]",
    "  jispec-cli console dashboard [--json]",
    "  jispec-cli console ui [--out <path>] [--json]",
    "  jispec-cli console actions [--json]",
    "  jispec-cli console export-governance [--json]",
    "  jispec-cli console aggregate-governance [--snapshot <paths...>] [--dir <paths...>] [--json]",
    "  jispec-cli metrics value-report [--json]",
    "  jispec-cli privacy report [--json]",
    "  jispec-cli pilot package [--json]",
    "  jispec-cli north-star acceptance [--json]",
    "  jispec-cli integrations payload --provider github|gitlab|jira|linear --kind scm_comment|issue_link [--json]",
    "  jispec-cli handoff adapter --from-handoff <path-or-session> --tool codex|claude_code|cursor|copilot|devin [--json]",
    "  jispec-cli implement [--fast] [--external-patch <path>] [--from-handoff <path-or-session>] [--json]",
    "  jispec-cli bootstrap init-project [--force] [--json]",
    "  jispec-cli bootstrap new-project --requirements <path> [--technical-solution <path>] [--json]",
    "  jispec-cli bootstrap discover [--json]",
    "  jispec-cli bootstrap draft [--json]",
    "  jispec-cli adopt --interactive [--json]",
    "  jispec-cli policy migrate [--profile solo|small_team|regulated] [--owner <owner>] [--reviewer <reviewer...>] [--json]",
    "  jispec-cli policy approval status|record [--json]",
    "  jispec-cli doctor v1",
    "  jispec-cli doctor runtime",
    "  jispec-cli doctor pilot",
    "  jispec-cli --version",
    "",
    "Current CI wrapper:",
    "  npm run ci:verify",
  ].join("\n");
}

function buildLegacySurfaceHelpText(): string {
  return [
    "Legacy compatibility surface:",
    "  jispec-cli slice ...",
    "  jispec-cli context ...",
    "  jispec-cli trace ...",
    "  jispec-cli artifact ...",
    "  jispec-cli agent ...",
    "  jispec-cli pipeline ...",
    "  jispec-cli template ...",
    "  jispec-cli dependency ...",
    "",
    "Compatibility aliases:",
    "  jispec-cli validate",
    "  npm run validate:repo",
    "  npm run check:jispec",
  ].join("\n");
}

function buildWorkflowSurfaceHelpText(): string {
  return [
    "Mainline workflow shortcuts:",
    "  change --mode prompt -> follow next commands manually",
    "  change --mode execute -> orchestrate implementation mediation -> verify",
    "  implement --fast -> verify --fast",
    "  strict lane can surface adopt before implementation when a bootstrap draft is still open",
  ].join("\n");
}

function buildCombinedHelpText(): string {
  return `\n${[
    buildPrimarySurfaceHelpText(),
    buildLegacySurfaceHelpText(),
    buildWorkflowSurfaceHelpText(),
  ].join("\n\n")}\n`;
}

function renderVerifyResult(options: { json: boolean; result: Awaited<ReturnType<typeof runVerify>> }): void {
  console.log(options.json ? renderVerifyJSON(options.result) : renderVerifyText(options.result));
}

function registerPrimaryVerifyCommand(program: Command): void {
  program
    .command("verify")
    .alias("validate")
    .description("Verify repository contracts, assets, facts, and trace rules.")
    .option("--root <path>", "Repository root to validate.", ".")
    .option("--strict", "Reserve strict verify mode on the new verify runner surface.", false)
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--baseline", "Apply baseline to downgrade historical issues.", false)
    .option("--write-baseline", "Write current issues as baseline.", false)
    .option("--observe", "Run in observe mode (downgrade blocking issues to advisory).", false)
    .option("--policy <path>", "Path to policy YAML file.")
    .option("--facts-out <path>", "Output path for canonical facts JSON.")
    .option("--fast", "Run local fast-lane precheck and auto-promote to strict when needed.", false)
    .action(async (options: { root: string; strict: boolean; json: boolean; baseline: boolean; writeBaseline: boolean; observe: boolean; policy?: string; factsOut?: string; fast: boolean }) => {
      try {
        const root = path.resolve(options.root);
        const result = await runVerify({
          root,
          strict: options.strict,
          useBaseline: options.baseline,
          writeBaseline: options.writeBaseline,
          observe: options.observe,
          policyPath: options.policy,
          factsOutPath: options.factsOut,
          fast: options.fast,
        } satisfies VerifyRunOptions);
        const verifySummaryPath = writeLocalVerifySummary(root, buildVerifyReport(result, {
          repoRoot: root,
          provider: "local",
        }));
        renderVerifyResult({ result, json: options.json });
        if (!options.json) {
          console.log(`Verify summary: ${path.relative(root, verifySummaryPath).replace(/\\/g, "/")}`);
        }
        process.exitCode = result.exitCode;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec verify failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerDoctorCommands(program: Command): void {
  const doctor = program.command("doctor").description("Run JiSpec-CLI health checks and readiness diagnostics.");

  doctor
    .command("v1")
    .description("Check V1 mainline readiness without blocking on deferred distributed or collaboration surfaces.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; json: boolean }) => {
      try {
        const doctorInstance = new Doctor(path.resolve(options.root));
        const report = await doctorInstance.checkV1Mainline();

        if (options.json) {
          console.log(Doctor.formatJSON(report));
        } else {
          console.log(Doctor.formatText(report));
        }

        process.exitCode = report.ready ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Doctor v1 check failed: ${message}`);
        process.exitCode = 1;
      }
    });

  doctor
    .command("runtime")
    .description("Check extended runtime and compatibility surface readiness.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; json: boolean }) => {
      try {
        const doctorInstance = new Doctor(path.resolve(options.root));
        const report = await doctorInstance.checkRuntime();

        if (options.json) {
          console.log(Doctor.formatJSON(report));
        } else {
          console.log(Doctor.formatText(report));
        }

        process.exitCode = report.ready ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Doctor runtime check failed: ${message}`);
        process.exitCode = 1;
      }
    });

  doctor
    .command("pilot")
    .description("Check commercial pilot readiness separately from engineering V1 readiness.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; json: boolean }) => {
      try {
        const doctorInstance = new Doctor(path.resolve(options.root));
        const report = await doctorInstance.checkCommercialPilotReadiness();

        if (options.json) {
          console.log(Doctor.formatJSON(report));
        } else {
          console.log(Doctor.formatText(report));
        }

        process.exitCode = report.ready ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Doctor pilot check failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerPolicyCommands(program: Command): void {
  const policy = program.command("policy").description("Manage the minimal verify policy surface.");

  policy
    .command("migrate")
    .description("Scaffold or normalize .spec/policy.yaml onto the current facts contract.")
    .option("--root <path>", "Repository root.", ".")
    .option("--path <path>", "Override the policy file path.")
    .option("--profile <profile>", "Policy profile: solo|small_team|regulated.")
    .option("--owner <owner>", "Accountable team owner for the policy profile.")
    .option("--reviewer <reviewer...>", "Reviewer identifier(s) for the policy profile.")
    .option("--actor <actor>", "Actor recorded in the audit event.")
    .option("--reason <reason>", "Reason recorded in the audit event.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; path?: string; profile?: string; owner?: string; reviewer?: string[]; actor?: string; reason?: string; json: boolean }) => {
      try {
        const profile = parsePolicyProfileOption(options.profile);
        const result = migrateVerifyPolicy(path.resolve(options.root), options.path, {
          profile,
          owner: options.owner,
          reviewers: options.reviewer,
          actor: options.actor,
          reason: options.reason,
        });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderPolicyMigrationText(result));
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Policy migrate failed: ${message}`);
        process.exitCode = 1;
      }
    });

  const approval = policy
    .command("approval")
    .description("Record and inspect structured local approval decisions for policy governance.");

  approval
    .command("status")
    .description("Show approval missing, stale, or satisfied posture without replacing verify.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const posture = evaluatePolicyApprovalWorkflow(path.resolve(options.root));
        console.log(options.json ? renderPolicyApprovalWorkflowJSON(posture) : renderPolicyApprovalWorkflowText(posture));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Policy approval status failed: ${message}`);
        process.exitCode = 1;
      }
    });

  approval
    .command("record")
    .description("Write a local approval decision and append an audit event.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--subject-kind <kind>", "policy_change|waiver_change|release_drift|execute_default_change|pilot_risk_acceptance|external_graph_summary_sharing.")
    .option("--subject-ref <path>", "Subject artifact path. Defaults to policy.yaml or latest release compare where possible.")
    .option("--actor <actor>", "Actor recording the approval.")
    .option("--role <role>", "Approval role: owner|reviewer.", "reviewer")
    .option("--status <status>", "Decision status: approved|rejected.", "approved")
    .requiredOption("--reason <reason>", "Human reason for the approval decision.")
    .option("--expires-at <date>", "Optional ISO 8601 expiration time.")
    .option("--id <id>", "Optional stable approval id for tests or scripted workflows.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: {
      root: string;
      subjectKind: string;
      subjectRef?: string;
      actor?: string;
      role: string;
      status: string;
      reason: string;
      expiresAt?: string;
      id?: string;
      json: boolean;
    }) => {
      try {
        const result = recordPolicyApproval(path.resolve(options.root), {
          subjectKind: parseApprovalSubjectKindOption(options.subjectKind),
          subjectRef: options.subjectRef,
          actor: options.actor,
          role: parseApprovalActorRoleOption(options.role),
          status: parseApprovalDecisionStatusOption(options.status),
          reason: options.reason,
          expiresAt: options.expiresAt,
          id: options.id,
        });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("Approval recorded:");
          console.log(`  ID: ${result.approval.id}`);
          console.log(`  Status: ${result.approval.status}`);
          console.log(`  Subject: ${result.approval.subject.kind} ${result.approval.subject.ref}`);
          console.log(`  Actor: ${result.approval.decision.actor} (${result.approval.decision.role})`);
          console.log(`  Path: ${path.relative(path.resolve(options.root), result.recordPath).replace(/\\/g, "/")}`);
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Policy approval record failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function parsePolicyProfileOption(profile?: string): TeamPolicyProfileName | undefined {
  if (profile === undefined) {
    return undefined;
  }
  if (profile === "solo" || profile === "small_team" || profile === "regulated") {
    return profile;
  }
  throw new Error("--profile must be one of: solo, small_team, regulated");
}

function parseApprovalSubjectKindOption(kind: string): ApprovalSubjectKind {
  if (kind === "policy_change" || kind === "waiver_change" || kind === "release_drift" || kind === "execute_default_change" || kind === "pilot_risk_acceptance" || kind === "external_graph_summary_sharing") {
    return kind;
  }
  throw new Error("--subject-kind must be one of: policy_change, waiver_change, release_drift, execute_default_change, pilot_risk_acceptance, external_graph_summary_sharing");
}

function parseApprovalActorRoleOption(role: string): ApprovalActorRole {
  if (role === "owner" || role === "reviewer") {
    return role;
  }
  throw new Error("--role must be one of: owner, reviewer");
}

function parseApprovalDecisionStatusOption(status: string): ApprovalDecisionStatus {
  if (status === "approved" || status === "rejected") {
    return status;
  }
  throw new Error("--status must be one of: approved, rejected");
}

function registerWaiverCommands(program: Command): void {
  const waiver = program.command("waiver").description("Manage verify waivers for known issues.");

  waiver
    .command("create")
    .description("Create a new waiver for a verify issue.")
    .option("--root <path>", "Repository root.", ".")
    .option("--code <code>", "Issue code to waive.")
    .option("--path <path>", "Optional file path to match.")
    .option("--fingerprint <fingerprint>", "Optional issue fingerprint for exact matching.")
    .option("--owner <owner>", "Waiver owner (required).")
    .option("--reason <reason>", "Reason for waiver (required).")
    .option("--expires-at <date>", "Expiration date (ISO 8601 format).")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; code?: string; path?: string; fingerprint?: string; owner?: string; reason?: string; expiresAt?: string; json: boolean }) => {
      try {
        if (!options.owner) {
          throw new Error("--owner is required");
        }
        if (!options.reason) {
          throw new Error("--reason is required");
        }
        if (!options.code && !options.fingerprint) {
          throw new Error("Either --code or --fingerprint is required");
        }

        const result = createWaiver(path.resolve(options.root), {
          code: options.code,
          path: options.path,
          fingerprint: options.fingerprint,
          owner: options.owner,
          reason: options.reason,
          expiresAt: options.expiresAt,
        } satisfies WaiverCreateOptions);

        renderWaiverCreateResult(result, options.json);
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Waiver create failed: ${message}`);
        process.exitCode = 1;
      }
    });

  waiver
    .command("list")
    .description("List all waivers.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const waivers = listWaivers(path.resolve(options.root));

        if (options.json) {
          console.log(JSON.stringify(waivers, null, 2));
        } else {
          if (waivers.length === 0) {
            console.log("No waivers found.");
          } else {
            console.log(`Found ${waivers.length} waiver(s):\n`);
            for (const waiver of waivers) {
              console.log(`ID: ${waiver.id}`);
              console.log(`  Status: ${waiver.status ?? "active"}`);
              console.log(`  Owner: ${waiver.owner}`);
              console.log(`  Reason: ${waiver.reason}`);
              if (waiver.issueCode) {
                console.log(`  Code: ${waiver.issueCode}${waiver.issuePath ? ` (${waiver.issuePath})` : ""}`);
              }
              if (waiver.issueFingerprint) {
                console.log(`  Fingerprint: ${waiver.issueFingerprint}`);
              }
              console.log(`  Created: ${waiver.createdAt}`);
              if (waiver.expiresAt) {
                console.log(`  Expires: ${waiver.expiresAt}`);
              }
              if (waiver.revokedAt) {
                console.log(`  Revoked: ${waiver.revokedAt} by ${waiver.revokedBy ?? "unknown"}`);
                console.log(`  Revoke reason: ${waiver.revokeReason ?? "not recorded"}`);
              }
              console.log();
            }
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Waiver list failed: ${message}`);
        process.exitCode = 1;
      }
    });

  waiver
    .command("revoke")
    .description("Revoke an active waiver.")
    .argument("<id>", "Waiver ID to revoke.")
    .option("--root <path>", "Repository root.", ".")
    .option("--actor <actor>", "Actor revoking the waiver (required).")
    .option("--reason <reason>", "Reason for revocation (required).")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((id: string, options: { root: string; actor?: string; reason?: string; json: boolean }) => {
      try {
        if (!options.actor) {
          throw new Error("--actor is required");
        }
        if (!options.reason) {
          throw new Error("--reason is required");
        }

        const result = revokeWaiver(path.resolve(options.root), id, {
          revokedBy: options.actor,
          reason: options.reason,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Waiver revoked successfully:`);
          console.log(`  ID: ${result.waiver.id}`);
          console.log(`  Revoked by: ${result.waiver.revokedBy}`);
          console.log(`  Reason: ${result.waiver.revokeReason}`);
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Waiver revoke failed: ${message}`);
        process.exitCode = 1;
      }
    });

  waiver
    .command("renew")
    .description("Renew an active waiver expiration through an audited local update.")
    .argument("<id>", "Waiver ID to renew.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--actor <actor>", "Actor renewing the waiver.")
    .requiredOption("--reason <reason>", "Reason for renewal.")
    .requiredOption("--expires-at <date>", "New expiration date (ISO 8601 format).")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((id: string, options: { root: string; actor: string; reason: string; expiresAt: string; json: boolean }) => {
      try {
        const result = renewWaiver(path.resolve(options.root), id, {
          actor: options.actor,
          reason: options.reason,
          expiresAt: options.expiresAt,
        });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("Waiver renewed successfully:");
          console.log(`  ID: ${result.waiver.id}`);
          console.log(`  Expires: ${result.waiver.expiresAt}`);
          console.log(`  File: ${result.filePath}`);
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Waiver renew failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerReleaseCommands(program: Command): void {
  const release = program.command("release").description("Manage Greenfield baseline snapshots and release comparisons.");

  release
    .command("snapshot")
    .description("Freeze the current baseline into .spec/baselines/releases/<version>.yaml.")
    .requiredOption("--version <version>", "Release version to snapshot, for example v1.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite an existing release baseline.", false)
    .option("--actor <actor>", "Actor recorded in the audit event.")
    .option("--reason <reason>", "Reason recorded in the audit event.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; version: string; force: boolean; actor?: string; reason?: string; json: boolean }) => {
      try {
        const result = createReleaseSnapshot({
          root: path.resolve(options.root),
          version: options.version,
          force: options.force,
          actor: options.actor,
          reason: options.reason,
        });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderReleaseSnapshotText(result));
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Release snapshot failed: ${message}`);
        process.exitCode = 1;
      }
    });

  release
    .command("compare")
    .description("Compare two baselines, such as --from v1 --to current.")
    .requiredOption("--from <ref>", "Source baseline ref: current, a release version, or a path.")
    .requiredOption("--to <ref>", "Target baseline ref: current, a release version, or a path.")
    .option("--root <path>", "Repository root.", ".")
    .option("--actor <actor>", "Actor recorded in the audit event.")
    .option("--reason <reason>", "Reason recorded in the audit event.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; from: string; to: string; actor?: string; reason?: string; json: boolean }) => {
      try {
        const result = compareReleaseBaselines({
          root: path.resolve(options.root),
          from: options.from,
          to: options.to,
          actor: options.actor,
          reason: options.reason,
        });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderReleaseCompareText(result));
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Release compare failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerConsoleCommands(program: Command): void {
  const consoleCommand = program.command("console").description("Read-only local governance console over declared JiSpec artifacts.");

  consoleCommand
    .command("dashboard")
    .description("Show the governance dashboard shell without uploading source or replacing verify.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const dashboard = buildConsoleGovernanceDashboard(path.resolve(options.root));
        console.log(options.json ? renderConsoleGovernanceDashboardJSON(dashboard) : renderConsoleGovernanceDashboardText(dashboard));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Console dashboard failed: ${message}`);
        process.exitCode = 1;
      }
    });

  consoleCommand
    .command("ui")
    .description("Write a local read-only HTML governance console over declared JiSpec artifacts.")
    .option("--root <path>", "Repository root.", ".")
    .option("--out <path>", "Output HTML path relative to root.", ".spec/console/ui/index.html")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; out: string; json: boolean }) => {
      try {
        const result = writeLocalConsoleUi({
          root: path.resolve(options.root),
          outPath: options.out,
        });
        console.log(options.json ? renderLocalConsoleUiResultJSON(result) : renderLocalConsoleUiResultText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Console UI failed: ${message}`);
        process.exitCode = 1;
      }
    });

  consoleCommand
    .command("actions")
    .description("Generate audited local CLI action packets from the governance dashboard state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const plan = buildConsoleGovernanceActionPlan(path.resolve(options.root));
        console.log(options.json ? renderConsoleGovernanceActionPlanJSON(plan) : renderConsoleGovernanceActionPlanText(plan));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Console actions failed: ${message}`);
        process.exitCode = 1;
      }
    });

  consoleCommand
    .command("export-governance")
    .description("Export this repo's local governance snapshot for future multi-repo Console aggregation.")
    .option("--root <path>", "Repository root.", ".")
    .option("--out <path>", "Output JSON path.", ".spec/console/governance-snapshot.json")
    .option("--repo-id <id>", "Stable repository ID for multi-repo aggregation.")
    .option("--repo-name <name>", "Human-readable repository name.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; out: string; repoId?: string; repoName?: string; json: boolean }) => {
      try {
        const result = exportConsoleGovernanceSnapshot({
          root: path.resolve(options.root),
          outPath: options.out,
          repoId: options.repoId,
          repoName: options.repoName,
        });
        console.log(options.json ? renderConsoleGovernanceExportJSON(result) : renderConsoleGovernanceExportText(result.snapshot));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Console governance export failed: ${message}`);
        process.exitCode = 1;
      }
    });

  consoleCommand
    .command("aggregate-governance")
    .description("Aggregate exported repo governance snapshots without scanning source or replacing single-repo verify gates.")
    .option("--root <path>", "Workspace root used for relative inputs and output.", ".")
    .option("--snapshot <paths...>", "Explicit .spec/console/governance-snapshot.json file path(s).")
    .option("--dir <paths...>", "Directory path(s) containing exported governance snapshots.")
    .option("--out <path>", "Output JSON path.", ".spec/console/multi-repo-governance.json")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; snapshot?: string[]; dir?: string[]; out: string; json: boolean }) => {
      try {
        const result = aggregateMultiRepoGovernance({
          root: path.resolve(options.root),
          snapshotPaths: options.snapshot ?? [],
          directoryPaths: options.dir ?? [],
          outPath: options.out,
        });
        console.log(options.json ? renderMultiRepoGovernanceAggregateJSON(result) : renderMultiRepoGovernanceAggregateText(result.aggregate));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Console governance aggregation failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerPrivacyCommands(program: Command): void {
  const privacy = program.command("privacy").description("Generate local privacy and redaction reports over JiSpec artifacts.");

  privacy
    .command("report")
    .description("Scan local JiSpec artifacts for common secrets and write a privacy report plus redacted shareable companions.")
    .option("--root <path>", "Repository root.", ".")
    .option("--out <path>", "Output JSON path.", ".spec/privacy/privacy-report.json")
    .option("--no-redacted-views", "Do not write redacted companion files.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; out: string; redactedViews: boolean; json: boolean }) => {
      try {
        const result = buildPrivacyReport({
          root: path.resolve(options.root),
          outPath: options.out,
          writeRedactedViews: options.redactedViews,
        });
        console.log(options.json ? renderPrivacyReportJSON(result) : renderPrivacyReportText(result.report));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Privacy report failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerPilotCommands(program: Command): void {
  const pilot = program.command("pilot").description("Build local pilot adoption packages and readiness companions.");

  pilot
    .command("package")
    .description("Write a local pilot product package and adoption path from existing JiSpec artifacts.")
    .option("--root <path>", "Repository root.", ".")
    .option("--out <path>", "Output JSON path.", ".spec/pilot/package.json")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; out?: string; json: boolean }) => {
      try {
        const result = writePilotProductPackage({
          root: path.resolve(options.root),
          outPath: options.out,
        });
        console.log(options.json ? renderPilotProductPackageJSON(result) : renderPilotProductPackageText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Pilot package failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerNorthStarCommands(program: Command): void {
  const northStar = program.command("north-star").description("Build final local North Star acceptance artifacts.");

  northStar
    .command("acceptance")
    .description("Write the local North Star acceptance suite aggregate and scenario decision packets.")
    .option("--root <path>", "Repository root.", ".")
    .option("--out <path>", "Output JSON path.", ".spec/north-star/acceptance.json")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; out?: string; json: boolean }) => {
      try {
        const result = writeNorthStarAcceptance({
          root: path.resolve(options.root),
          outPath: options.out,
        });
        console.log(options.json ? renderNorthStarAcceptanceJSON(result) : renderNorthStarAcceptanceText(result.acceptance));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`North Star acceptance failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerMetricsCommands(program: Command): void {
  const metrics = program.command("metrics").description("Generate repo-local value and adoption metrics without uploading source.");

  metrics
    .command("value-report")
    .description("Write a local ROI/adoption value report from JiSpec artifacts.")
    .option("--root <path>", "Repository root.", ".")
    .option("--out <path>", "Output JSON path.", ".spec/metrics/value-report.json")
    .option("--window-days <days>", "Metric window in days.", "7")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; out: string; windowDays: string; json: boolean }) => {
      try {
        const result = buildValueReport({
          root: path.resolve(options.root),
          outPath: options.out,
          windowDays: Number(options.windowDays),
        });
        console.log(options.json ? renderValueReportJSON(result) : renderValueReportText(result.report));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Value report failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerSpecDebtCommands(program: Command): void {
  const specDebt = program.command("spec-debt").description("Manage Greenfield spec debt through audited local CLI actions.");

  registerSpecDebtStatusCommand(specDebt, "repay", "Mark a spec debt record as repaid.");
  registerSpecDebtStatusCommand(specDebt, "cancel", "Mark a spec debt record as cancelled.");

  specDebt
    .command("owner-review")
    .description("Mark a spec debt record as needing owner review.")
    .argument("<id>", "Spec debt ID.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--actor <actor>", "Actor requesting owner review.")
    .requiredOption("--reason <reason>", "Reason for owner review.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((id: string, options: { root: string; actor: string; reason: string; json: boolean }) => {
      try {
        const record = markGreenfieldSpecDebtOwnerReview(path.resolve(options.root), {
          id,
          actor: options.actor,
          reason: options.reason,
        });
        if (options.json) {
          console.log(JSON.stringify({ record }, null, 2));
        } else {
          console.log("Spec debt owner review recorded:");
          console.log(`  ID: ${record.id}`);
          console.log(`  Owner: ${record.owner}`);
          console.log(`  Requested by: ${record.owner_review?.requested_by}`);
          console.log(`  Reason: ${record.owner_review?.reason}`);
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Spec debt owner-review failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerSpecDebtStatusCommand(specDebt: Command, action: "repay" | "cancel", description: string): void {
  specDebt
    .command(action)
    .description(description)
    .argument("<id>", "Spec debt ID.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--actor <actor>", "Actor recording the status update.")
    .requiredOption("--reason <reason>", "Reason for the status update.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((id: string, options: { root: string; actor: string; reason: string; json: boolean }) => {
      try {
        const record = updateGreenfieldSpecDebtStatus(path.resolve(options.root), {
          id,
          status: action === "repay" ? "repaid" : "cancelled",
          actor: options.actor,
          reason: options.reason,
        });
        if (options.json) {
          console.log(JSON.stringify({ record }, null, 2));
        } else {
          console.log(`Spec debt ${action === "repay" ? "repaid" : "cancelled"}:`);
          console.log(`  ID: ${record.id}`);
          console.log(`  Status: ${record.status}`);
          console.log(`  Owner: ${record.owner}`);
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Spec debt ${action} failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerReviewCommands(program: Command): void {
  const review = program.command("review").description("Manage Greenfield human review decisions and correction loops.");

  review
    .command("list")
    .description("List Greenfield review decisions grouped by review state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const result = runGreenfieldReviewList(path.resolve(options.root));
        console.log(options.json ? JSON.stringify(result, null, 2) : renderGreenfieldReviewListText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Review list failed: ${message}`);
        process.exitCode = 1;
      }
    });

  registerReviewTransitionCommand(review, "adopt", "Adopt a Greenfield review decision.");
  registerReviewTransitionCommand(review, "reject", "Reject a Greenfield review decision and create a correction loop.");
  registerReviewTransitionCommand(review, "defer", "Defer a Greenfield review decision into open decisions.");
  registerReviewTransitionCommand(review, "waive", "Waive a Greenfield review decision into spec debt.");

  review
    .command("brief")
    .description("Generate a human-readable Greenfield review brief from the review record.")
    .option("--root <path>", "Repository root.", ".")
    .option("--lang <lang>", "Brief language: zh-CN|en-US.", "zh-CN")
    .option("--output <path>", "Output markdown path.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; lang: string; output?: string; json: boolean }) => {
      try {
        if (options.lang !== "zh-CN" && options.lang !== "en-US") {
          throw new Error("--lang must be zh-CN or en-US");
        }
        const result = runGreenfieldReviewBrief({
          root: path.resolve(options.root),
          lang: options.lang as GreenfieldReviewLanguage,
          output: options.output,
        });
        console.log(options.json ? JSON.stringify(result, null, 2) : renderGreenfieldReviewBriefText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Review brief failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerReviewTransitionCommand(review: Command, action: GreenfieldReviewAction, description: string): void {
  review
    .command(action)
    .description(description)
    .argument("<decisionId>", "Review decision ID, such as REV-DOMAIN-ORDERING.")
    .option("--root <path>", "Repository root.", ".")
    .option("--actor <actor>", "Human reviewer name.")
    .option("--owner <owner>", "Owner for deferred or waived decisions.")
    .option("--reason <reason>", "Reason for the review decision.")
    .option("--expires <date>", "Expiration date for deferred or waived decisions.")
    .option("--expires-at <date>", "Expiration date for deferred or waived decisions.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((decisionId: string, options: { root: string; actor?: string; owner?: string; reason?: string; expires?: string; expiresAt?: string; json: boolean }) => {
      try {
        const result = runGreenfieldReviewTransition({
          root: path.resolve(options.root),
          decisionId,
          action,
          actor: options.actor,
          owner: options.owner,
          reason: options.reason,
          expiresAt: options.expiresAt ?? options.expires,
        });
        console.log(options.json ? JSON.stringify(result, null, 2) : renderGreenfieldReviewTransitionText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Review ${action} failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function renderWaiverCreateResult(result: WaiverCreateResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Waiver created successfully:`);
    console.log(`  ID: ${result.waiver.id}`);
    console.log(`  File: ${result.filePath}`);
  }
}

function registerChangeCommand(program: Command): void {
  const change = program
    .command("change")
    .description("Record change intent, determine fast/strict lane, and either return hints or execute the mainline orchestration.");

  change
    .argument("[summary...]", "Human summary of the intended change, or `default-mode show|set|reset`.")
    .option("--root <path>", "Repository root.", ".")
    .option("--lane <lane>", "Requested lane: auto|fast|strict.", "auto")
    .option("--mode <mode>", "Orchestration mode: prompt|execute. Defaults to jiproject/project.yaml change.default_mode or prompt.")
    .option("--slice <sliceId>", "Optional legacy slice binding.")
    .option("--context <contextId>", "Optional legacy context binding.")
    .option("--change-type <type>", "Spec Delta type for Greenfield projects: add|modify|deprecate|fix|redesign.")
    .option("--base-ref <ref>", "Optional git base ref for diff classification.", "HEAD")
    .option("--test-command <cmd>", "Override implement test command when --mode execute is used.")
    .option("--max-iterations <n>", "Maximum execute-mode implement iterations.", parseInt)
    .option("--max-tokens <n>", "Maximum execute-mode implement tokens.", parseInt)
    .option("--max-cost <n>", "Maximum execute-mode implement cost in USD.", parseFloat)
    .option("--actor <actor>", "Actor recorded when using change default-mode set/reset.")
    .option("--reason <reason>", "Reason recorded when using change default-mode set/reset.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (summaryParts: string[] | undefined, options: { root: string; lane: string; mode?: string; slice?: string; context?: string; changeType?: SpecDeltaChangeType; baseRef: string; testCommand?: string; maxIterations?: number; maxTokens?: number; maxCost?: number; actor?: string; reason?: string; json: boolean }) => {
      try {
        if (summaryParts?.[0] === "default-mode") {
          handleChangeDefaultModeAction(summaryParts.slice(1), options);
          return;
        }
        const summary = summaryParts?.join(" ").trim();
        if (!summary) {
          throw new Error("Missing change summary. Use `change <summary>` or `change default-mode show|set|reset`.");
        }
        const result = await runChangeCommand({
          root: path.resolve(options.root),
          summary,
          lane: options.lane as any,
          mode: options.mode as "prompt" | "execute",
          sliceId: options.slice,
          contextId: options.context,
          changeType: options.changeType,
          baseRef: options.baseRef,
          json: options.json,
          testCommand: options.testCommand,
          maxIterations: options.maxIterations,
          maxTokens: options.maxTokens,
          maxCostUSD: options.maxCost,
        } satisfies ChangeCommandOptions);

        console.log(options.json ? renderChangeCommandJSON(result) : result.text);
        process.exitCode = result.exitCode;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Change command failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function handleChangeDefaultModeAction(
  args: string[],
  options: { root: string; actor?: string; reason?: string; json: boolean },
): void {
  const action = args[0];
  if (action === "show") {
    const result = showChangeDefaultMode(path.resolve(options.root));
    console.log(options.json ? renderChangeDefaultModeJSON(result) : renderChangeDefaultModeText(result));
    process.exitCode = 0;
    return;
  }

  if (action === "set") {
    const mode = args[1];
    if (mode !== "prompt" && mode !== "execute") {
      throw new Error("Usage: change default-mode set prompt|execute");
    }
    const result = setChangeDefaultMode({
      root: path.resolve(options.root),
      mode,
      actor: options.actor,
      reason: options.reason,
    });
    console.log(options.json ? renderChangeDefaultModeJSON(result) : renderChangeDefaultModeText(result));
    process.exitCode = 0;
    return;
  }

  if (action === "reset") {
    const result = resetChangeDefaultMode({
      root: path.resolve(options.root),
      actor: options.actor,
      reason: options.reason,
    });
    console.log(options.json ? renderChangeDefaultModeJSON(result) : renderChangeDefaultModeText(result));
    process.exitCode = 0;
    return;
  }

  throw new Error("Usage: change default-mode show|set|reset");
}

function registerImplementCommand(program: Command): void {
  program
    .command("implement")
    .description("Mediate external implementation patches through scope, test, and verify feedback.")
    .option("--root <path>", "Repository root.", ".")
    .option("--session-id <id>", "Optional session ID to resume.")
    .option("--from-handoff <path-or-session>", "Restore an implement attempt from a replayable handoff packet.")
    .option("--fast", "Prefer the local fast-lane implement flow when the active change session allows it.", false)
    .option("--external-patch <path>", "Mediate an external patch file through scope, test, and verify gates.")
    .option("--test-command <cmd>", "Override test command.")
    .option("--max-iterations <n>", "Maximum iterations (default: 10).", parseInt)
    .option("--max-tokens <n>", "Maximum tokens (default: 100000).", parseInt)
    .option("--max-cost <n>", "Maximum cost in USD (default: 5.00).", parseFloat)
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; sessionId?: string; fromHandoff?: string; fast: boolean; externalPatch?: string; testCommand?: string; maxIterations?: number; maxTokens?: number; maxCost?: number; json: boolean }) => {
      try {
        const { runImplement, renderImplementText, renderImplementJSON, computeImplementExitCode } = await import("./implement/implement-runner");
        const run = () => runImplement({
          root: path.resolve(options.root),
          sessionId: options.sessionId,
          fromHandoff: options.fromHandoff,
          fast: options.fast,
          externalPatchPath: options.externalPatch,
          testCommand: options.testCommand,
          maxIterations: options.maxIterations,
          maxTokens: options.maxTokens,
          maxCostUSD: options.maxCost,
        });

        const result = options.json ? await withSuppressedConsoleLogs(run) : await run();

        const output = options.json ? renderImplementJSON(result) : renderImplementText(result);
        console.log(output);

        process.exitCode = computeImplementExitCode(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Implement command failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

async function withSuppressedConsoleLogs<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => {};

  try {
    return await run();
  } finally {
    console.log = originalLog;
  }
}

function registerHandoffAdapterCommand(program: Command): void {
  const handoff = program.command("handoff").description("Export replayable implementation handoffs for external coding tools.");

  handoff
    .command("adapter")
    .description("Write a focused external coding tool request packet from a JiSpec handoff.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--from-handoff <path-or-session>", "Replayable handoff packet path or session id.")
    .requiredOption("--tool <tool>", "External tool: codex|claude_code|cursor|copilot|devin.")
    .option("--out <path>", "Output JSON path. Defaults under .jispec/handoff/adapters/<session>.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; fromHandoff: string; tool: string; out?: string; json: boolean }) => {
      try {
        const {
          parseExternalCodingTool,
          writeExternalToolHandoffRequest,
          renderExternalToolHandoffJSON,
          renderExternalToolHandoffText,
        } = await import("./implement/adapters/handoff-adapter");
        const result = writeExternalToolHandoffRequest({
          root: path.resolve(options.root),
          fromHandoff: options.fromHandoff,
          tool: parseExternalCodingTool(options.tool),
          outPath: options.out,
        });
        console.log(options.json ? renderExternalToolHandoffJSON(result) : renderExternalToolHandoffText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Handoff adapter failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerIntegrationCommands(program: Command): void {
  const integrations = program.command("integrations").description("Generate local SCM and issue tracker integration payload previews.");

  integrations
    .command("payload")
    .description("Write a GitHub/GitLab comment or Jira/Linear issue-link preview from local JiSpec artifacts.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--provider <provider>", "github|gitlab|jira|linear.")
    .requiredOption("--kind <kind>", "scm_comment|issue_link.")
    .option("--out <path>", "Output JSON path. Defaults under .spec/integrations.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; provider: string; kind: string; out?: string; json: boolean }) => {
      try {
        const {
          parseIntegrationProvider,
          parseIntegrationPayloadKind,
          writeIntegrationPayload,
          renderIntegrationPayloadJSON,
          renderIntegrationPayloadText,
        } = await import("./integrations/scm/payload");
        const result = writeIntegrationPayload({
          root: path.resolve(options.root),
          provider: parseIntegrationProvider(options.provider),
          kind: parseIntegrationPayloadKind(options.kind),
          outPath: options.out,
        });
        console.log(options.json ? renderIntegrationPayloadJSON(result) : renderIntegrationPayloadText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Integration payload failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function renderBootstrapDiscoverResult(result: BootstrapDiscoverResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBootstrapDiscoverText(result));
}

function renderBootstrapInitProjectResult(result: BootstrapInitProjectResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBootstrapInitProjectText(result));
}

function renderBootstrapDraftResult(result: BootstrapDraftResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBootstrapDraftText(result));
}

function renderBootstrapAdoptResult(result: BootstrapAdoptResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBootstrapAdoptText(result));
}

function renderGreenfieldInitResult(result: GreenfieldInitResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderGreenfieldInitText(result));
}

function createGreenfieldInitAction(commandName: string) {
  return (options: {
    root: string;
    requirements?: string;
    technicalSolution?: string;
    force: boolean;
    json: boolean;
  }) => {
    try {
      const result = runGreenfieldInit({
        root: path.resolve(options.root),
        requirements: options.requirements,
        technicalSolution: options.technicalSolution,
        force: options.force,
      } satisfies GreenfieldInitOptions);
      renderGreenfieldInitResult(result, options.json);
      process.exitCode = result.status === "input_contract_failed" ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`JiSpec ${commandName} failed: ${message}`);
      process.exitCode = 1;
    }
  };
}

function registerGreenfieldInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new Greenfield JiSpec project from product requirements and an optional technical solution.")
    .option("--root <path>", "New project root.", ".")
    .option("--requirements <path>", "Product requirements document path.")
    .option("--technical-solution <path>", "Technical solution document path.")
    .option("--force", "Overwrite existing Greenfield assets when supported.", false)
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(createGreenfieldInitAction("init"));
}

function registerBootstrapCommands(program: Command): void {
  const bootstrap = program
    .command("bootstrap")
    .description("Bootstrap repository evidence for the JiSpec-CLI primary surface.");

  bootstrap
    .command("new-project")
    .description("Initialize a new Greenfield JiSpec project from product requirements and an optional technical solution.")
    .option("--root <path>", "New project root.", ".")
    .option("--requirements <path>", "Product requirements document path.")
    .option("--technical-solution <path>", "Technical solution document path.")
    .option("--force", "Overwrite existing Greenfield assets when supported.", false)
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(createGreenfieldInitAction("bootstrap new-project"));

  bootstrap
    .command("init-project")
    .description("Create a minimal jiproject/project.yaml scaffold for bootstrap takeover.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite an existing jiproject/project.yaml.", false)
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; force: boolean; json: boolean }) => {
      try {
        const result = runBootstrapInitProject({
          root: path.resolve(options.root),
          force: options.force,
        } satisfies BootstrapInitProjectOptions);
        renderBootstrapInitProjectResult(result, options.json);
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec bootstrap init-project failed: ${message}`);
        process.exitCode = 1;
      }
    });

  bootstrap
    .command("discover")
    .description("Discover repository evidence and write a structured bootstrap evidence graph.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--output <path>", "Override the evidence graph output path.", ".spec/facts/bootstrap/evidence-graph.json")
    .option("--init-project", "Create jiproject/project.yaml before discovery when it is missing.", false)
    .option("--include-noise", "Opt in to scanning vendored, generated, cache, build, audit, and tool-mirror paths.", false)
    .option("--no-write", "Do not write .spec outputs; only compute the discovery result.")
    .action((options: { root: string; json: boolean; output: string; initProject: boolean; includeNoise: boolean; write: boolean }) => {
      try {
        const result = runBootstrapDiscover({
          root: path.resolve(options.root),
          outputPath: options.output,
          initProject: options.initProject,
          includeNoise: options.includeNoise,
          writeFile: options.write,
        } satisfies BootstrapDiscoverOptions);
        renderBootstrapDiscoverResult(result, options.json);
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec bootstrap discover failed: ${message}`);
        process.exitCode = 1;
      }
    });

  bootstrap
    .command("draft")
    .description("Draft the first contract bundle from bootstrap evidence and store it in a session workspace.")
    .option("--root <path>", "Repository root.", ".")
    .option("--session <id|latest>", "Continue with an explicit session ID or reuse the latest open draft session.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--no-write", "Do not write session files; only compute the draft bundle.")
    .action(async (options: { root: string; session?: string; json: boolean; write: boolean }) => {
      try {
        const result = await runBootstrapDraft({
          root: path.resolve(options.root),
          session: options.session,
          writeFile: options.write,
        } satisfies BootstrapDraftOptions);
        renderBootstrapDraftResult(result, options.json);
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec bootstrap draft failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function registerAdoptCommand(program: Command): void {
  program
    .command("adopt")
    .description("Interactively adopt or defer a bootstrap draft bundle into visible contract assets.")
    .option("--root <path>", "Repository root.", ".")
    .option("--session <id|latest>", "Adopt a specific draft session or the latest open session.")
    .option("--interactive", "Collect decisions interactively with a terminal prompt.", false)
    .option("--actor <actor>", "Actor recorded in the audit event.")
    .option("--reason <reason>", "Reason recorded in the audit event.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: { root: string; session?: string; interactive: boolean; actor?: string; reason?: string; json: boolean }) => {
      try {
        const result = await runBootstrapAdopt({
          root: path.resolve(options.root),
          session: options.session,
          interactive: options.interactive,
          actor: options.actor,
          reason: options.reason,
        });
        renderBootstrapAdoptResult(result, options.json);
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec adopt failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function shouldPrintLegacySurfaceHint(argv: string[] = process.argv): boolean {
  return !argv.some((arg) => arg === "--json" || arg.startsWith("--json="));
}

function printLegacySurfaceHint(surface: LegacySurface): void {
  console.log(
    `[JiSpec] \`${surface}\` is part of the legacy compatibility surface. The current primary entry points are \`jispec-cli verify\` and \`jispec-cli doctor v1\`.`,
  );
}

function extractCommandRawArgs(command: Command): string[] {
  const commandWithRawArgs = command as Command & { rawArgs?: string[] };

  if (Array.isArray(commandWithRawArgs.rawArgs) && commandWithRawArgs.rawArgs.length > 0) {
    return commandWithRawArgs.rawArgs;
  }

  const parentWithRawArgs = command.parent as (Command & { rawArgs?: string[] }) | null;
  if (parentWithRawArgs && Array.isArray(parentWithRawArgs.rawArgs) && parentWithRawArgs.rawArgs.length > 0) {
    return parentWithRawArgs.rawArgs;
  }

  return process.argv;
}

function commandRequestsJson(command: Command): boolean {
  const commandWithGlobals = command as Command & { optsWithGlobals?: () => Record<string, unknown> };
  const options =
    typeof commandWithGlobals.optsWithGlobals === "function"
      ? commandWithGlobals.optsWithGlobals()
      : (command.opts() as Record<string, unknown>);
  return options.json === true;
}

function registerLegacySurfaceHint(command: Command, surface: LegacySurface): void {
  command.hook("preAction", (_thisCommand, actionCommand) => {
    if (commandRequestsJson(actionCommand)) {
      return;
    }

    if (shouldPrintLegacySurfaceHint(extractCommandRawArgs(actionCommand))) {
      printLegacySurfaceHint(surface);
    }
  });
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("jispec-cli")
    .description("JiSpec-CLI: contract-driven AI delivery gate for repository assets, policies, and AI-assisted delivery.")
    .showHelpAfterError();

  program.addHelpText("after", buildCombinedHelpText());

  registerPrimaryVerifyCommand(program);
  registerFirstRunCommand(program);
  registerGreenfieldInitCommand(program);
  registerBootstrapCommands(program);
  registerAdoptCommand(program);
  registerDoctorCommands(program);
  registerPolicyCommands(program);
  registerWaiverCommands(program);
  registerChangeCommand(program);
  registerReviewCommands(program);
  registerReleaseCommands(program);
  registerConsoleCommands(program);
  registerMetricsCommands(program);
  registerPrivacyCommands(program);
  registerPilotCommands(program);
  registerNorthStarCommands(program);
  registerIntegrationCommands(program);
  registerSpecDebtCommands(program);
  registerHandoffAdapterCommand(program);
  registerImplementCommand(program);

  const slice = program.command("slice").description("Legacy slice-based protocol commands (compatibility surface).");
  registerLegacySurfaceHint(slice, "slice");

  slice
    .command("create")
    .description("Create a new slice from the repository templates.")
    .argument("<contextId>", "Owning bounded context ID.")
    .argument("<sliceId>", "New slice ID.")
    .option("--root <path>", "Repository root.", ".")
    .option("--title <title>", "Human-readable slice title.")
    .option("--goal <goal>", "Slice goal statement.")
    .option("--priority <priority>", "Slice priority.", "medium")
    .option("--product-owner <owner>", "Product owner identifier.", "unassigned-product-owner")
    .option("--engineering-owner <owner>", "Engineering owner identifier.", "unassigned-engineering-owner")
    .option("--requirement-id <id...>", "Requirement ID to attach to the slice.")
    .action(
      (
        contextId: string,
        sliceId: string,
        options: {
          root: string;
          title?: string;
          goal?: string;
          priority: string;
          productOwner: string;
          engineeringOwner: string;
          requirementId?: string[];
        },
      ) => {
        try {
          const result = createSlice({
            root: path.resolve(options.root),
            contextId,
            sliceId,
            title: options.title,
            goal: options.goal,
            priority: options.priority,
            productOwner: options.productOwner,
            engineeringOwner: options.engineeringOwner,
            requirementIds: options.requirementId,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice creation failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  slice
    .command("list")
    .description("List slices across the repository or within one context.")
    .option("--root <path>", "Repository root.", ".")
    .option("--context <contextId>", "Optional context filter.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; context?: string; json: boolean }) => {
      try {
        const report = buildSliceListReport(path.resolve(options.root), options.context);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice list failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("plan")
    .description("Generate a deterministic execution task plan for one slice.")
    .argument("<sliceId>", "Slice ID to plan.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing tasks.yaml.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = planSlice(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice plan failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("next")
    .description("Recommend the next highest-leverage action for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--apply", "Safely apply the recommended action when possible.", false)
    .action((sliceId: string, options: { root: string; json: boolean; apply: boolean }) => {
      try {
        const report = options.apply
          ? applySliceNext(path.resolve(options.root), sliceId)
          : buildSliceNextReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = options.apply && "applied" in report ? (report.applied ? 0 : 1) : 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice next failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("show")
    .description("Show the full observable snapshot for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildSliceShowReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("status")
    .description("Show what is blocking the next lifecycle step for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildSliceStatusReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = report.readyForNextState ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice status failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("check")
    .description("Validate one slice against lifecycle, schema, and trace rules.")
    .argument("<sliceId>", "Slice ID to validate.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      const result = validateSlice(path.resolve(options.root), sliceId);
      if (options.json) {
        console.log(JSON.stringify(result.toDict(), null, 2));
      } else {
        console.log(result.renderText());
      }
      process.exitCode = result.ok ? 0 : 1;
    });

  slice
    .command("advance")
    .description("Advance one slice to its next lifecycle state when gates are satisfied.")
    .argument("<sliceId>", "Slice ID to advance.")
    .requiredOption("--to <state>", "Target lifecycle state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--set-gate <gate=true|false...>", "Apply one or more gate updates before advancing.")
    .action(
      (
        sliceId: string,
        options: {
          to: string;
          root: string;
          setGate?: string[];
        },
      ) => {
        try {
          const result = advanceSlice({
            root: path.resolve(options.root),
            sliceId,
            toState: options.to,
            gateUpdates: options.setGate,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice advance failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  slice
    .command("update-gates")
    .description("Update one or more slice gates without advancing lifecycle state.")
    .argument("<sliceId>", "Slice ID to update.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--set-gate <gate=true|false...>", "Apply one or more gate updates.")
    .action(
      (
        sliceId: string,
        options: {
          root: string;
          setGate: string[];
        },
      ) => {
        try {
          const result = updateSliceGates({
            root: path.resolve(options.root),
            sliceId,
            gateUpdates: options.setGate,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice update-gates failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  slice
    .command("update-tasks")
    .description("Update one or more execution task statuses for a slice.")
    .argument("<sliceId>", "Slice ID to update.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption(
      "--set-status <task_id=pending|in_progress|completed|blocked...>",
      "Apply one or more task status updates.",
    )
    .action(
      (
        sliceId: string,
        options: {
          root: string;
          setStatus: string[];
        },
      ) => {
        try {
          const result = updateSliceTasks({
            root: path.resolve(options.root),
            sliceId,
            statusUpdates: options.setStatus,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice update-tasks failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  const trace = program.command("trace").description("Legacy traceability commands for slice-based protocol assets.");
  registerLegacySurfaceHint(trace, "trace");

  const context = program.command("context").description("Legacy bounded-context reporting commands.");
  registerLegacySurfaceHint(context, "context");

  context
    .command("next")
    .description("Recommend the next highest-leverage action inside one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--apply", "Safely apply the top dispatch action when possible.", false)
    .action((contextId: string, options: { root: string; json: boolean; apply: boolean }) => {
      try {
        const report = options.apply
          ? applyContextNext(path.resolve(options.root), contextId)
          : buildContextNextReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = options.apply && "applied" in report ? (report.applied ? 0 : 1) : 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context next failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("list")
    .description("List bounded contexts and their aggregate delivery state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const report = buildContextListReport(path.resolve(options.root));
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context list failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("board")
    .description("Show a board-style grouped view for one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((contextId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildContextBoardReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context board failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("show")
    .description("Show the aggregate delivery view for one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((contextId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildContextShowReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("status")
    .description("Show what is blocking delivery progress inside one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((contextId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildContextStatusReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = report.healthy ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context status failed: ${message}`);
        process.exitCode = 1;
      }
    });

  trace
    .command("show")
    .description("Show the trace graph summary for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildTraceReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = report.validation.ok ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec trace show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  trace
    .command("check")
    .description("Validate only the trace chain for one slice.")
    .argument("<sliceId>", "Slice ID to validate.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      const result = validateSliceTraceOnly(path.resolve(options.root), sliceId);
      if (options.json) {
        console.log(JSON.stringify(result.toDict(), null, 2));
      } else {
        console.log(result.renderText());
      }
      process.exitCode = result.ok ? 0 : 1;
    });

  const artifact = program.command("artifact").description("Legacy asset-derivation commands for slice-based protocol workflows.");
  registerLegacySurfaceHint(artifact, "artifact");

  artifact
    .command("derive-all")
    .description("Safely derive design, behavior, tests, and trace for one slice as a single pipeline.")
    .argument("<sliceId>", "Slice ID to derive all artifacts for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveAll(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-all failed: ${message}`);
        process.exitCode = 1;
      }
    });

  artifact
    .command("derive-design")
    .description("Derive a slice design.md file from slice metadata and context design assets.")
    .argument("<sliceId>", "Slice ID to derive design for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveDesign(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-design failed: ${message}`);
        process.exitCode = 1;
      }
    });

  artifact
    .command("derive-behavior")
    .description("Derive a slice behaviors.feature file from context scenarios.")
    .argument("<sliceId>", "Slice ID to derive behavior for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveBehavior(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-behavior failed: ${message}`);
        process.exitCode = 1;
      }
    });

  artifact
    .command("derive-tests")
    .description("Derive test-spec and coverage-map entries from slice scenarios.")
    .argument("<sliceId>", "Slice ID to derive tests for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveTests(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-tests failed: ${message}`);
        process.exitCode = 1;
        }
      });

  artifact
    .command("sync-trace")
    .description("Synchronize trace links from slice requirements, behaviors, and tests.")
    .argument("<sliceId>", "Slice ID to sync trace for.")
    .option("--root <path>", "Repository root.", ".")
    .action((sliceId: string, options: { root: string }) => {
      try {
        const result = syncTrace(path.resolve(options.root), sliceId);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact sync-trace failed: ${message}`);
        process.exitCode = 1;
      }
    });

  const agent = program.command("agent").description("Legacy AI agent commands for slice-based protocol workflows.");
  registerLegacySurfaceHint(agent, "agent");

  agent
    .command("run")
    .description("Run an AI agent to generate artifacts for a slice.")
    .argument("<role>", "Agent role: domain, design, behavior, test, implement, verify")
    .argument("<target>", "Target slice ID")
    .option("--root <path>", "Repository root.", ".")
    .option("--dry-run", "Show the assembled prompt without executing.", false)
    .option("--output <file>", "Override output file path.")
    .action(
      async (
        role: string,
        target: string,
        options: {
          root: string;
          dryRun: boolean;
          output?: string;
        },
      ) => {
        try {
          // Validate role
          const validRoles: AgentRole[] = ["domain", "design", "behavior", "test", "implement", "verify"];
          if (!validRoles.includes(role as AgentRole)) {
            throw new Error(
              `Invalid agent role '${role}'. Valid roles: ${validRoles.join(", ")}`,
            );
          }

          const result = await runAgent({
            root: path.resolve(options.root),
            role: role as AgentRole,
            target,
            dryRun: options.dryRun,
            output: options.output,
          });

          if (!options.dryRun) {
            console.log(formatAgentResult(result));
          }

          process.exitCode = result.success ? 0 : 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec agent run failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  // Pipeline command
  const pipeline = program.command("pipeline").description("Legacy multi-stage pipeline commands for slice-based workflows.");
  registerLegacySurfaceHint(pipeline, "pipeline");

  pipeline
    .command("run")
    .description("Run the pipeline for a slice.")
    .argument("<sliceId>", "Slice ID to run pipeline for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--from <stage>", "Start from a specific stage.")
    .option("--to <stage>", "Run until a specific stage.")
    .option("--dry-run", "Show what would be executed without running.", false)
    .option("--skip-validation", "Skip validation checks (dangerous).", false)
    .option("--tui", "Enable TUI visualization.", false)
    .action(
      async (
        sliceId: string,
        options: {
          root: string;
          from?: string;
          to?: string;
          dryRun: boolean;
          skipValidation: boolean;
          tui: boolean;
        },
      ) => {
        try {
          const { PipelineExecutor } = await import("./pipeline-executor");
          const executor = PipelineExecutor.create(path.resolve(options.root));

          const result = await executor.run(sliceId, {
            from: options.from,
            to: options.to,
            dryRun: options.dryRun,
            skipValidation: options.skipValidation,
            useTUI: options.tui,
          });

          console.log(PipelineExecutor.formatResult(result));

          process.exitCode = result.success ? 0 : 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec pipeline run failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  // Template command
  const template = program.command("template").description("Manage legacy pipeline templates.");
  registerLegacySurfaceHint(template, "template");

  template
    .command("list")
    .description("List all available pipeline templates.")
    .option("--root <path>", "Repository root.", ".")
    .option("--tags <tags...>", "Filter by tags.")
    .option("--search <query>", "Search templates by name or description.")
    .action(
      async (options: {
        root: string;
        tags?: string[];
        search?: string;
      }) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          let templates = manager.listTemplates();

          if (options.tags) {
            templates = manager.filterByTags(options.tags);
          }

          if (options.search) {
            templates = manager.searchTemplates(options.search);
          }

          console.log(manager.formatTemplateList(templates));
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template list failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("show")
    .description("Show details of a specific template.")
    .argument("<templateId>", "Template ID to show.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Output as JSON.", false)
    .action(
      async (
        templateId: string,
        options: {
          root: string;
          json: boolean;
        },
      ) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          const template = manager.loadTemplate(templateId);

          if (options.json) {
            console.log(JSON.stringify(template, null, 2));
          } else {
            console.log(yaml.dump(template));
          }

          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template show failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("create-defaults")
    .description("Create default pipeline templates.")
    .option("--root <path>", "Repository root.", ".")
    .action(
      async (options: { root: string }) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          manager.createDefaultTemplates();

          console.log("Default templates created successfully.");
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template create-defaults failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("clone")
    .description("Clone an existing template.")
    .argument("<sourceId>", "Source template ID.")
    .argument("<newId>", "New template ID.")
    .argument("<newName>", "New template name.")
    .option("--root <path>", "Repository root.", ".")
    .action(
      async (
        sourceId: string,
        newId: string,
        newName: string,
        options: { root: string },
      ) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          const cloned = manager.cloneTemplate(sourceId, newId, newName);
          manager.saveTemplate(cloned);

          console.log(`Template cloned: ${newId}`);
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template clone failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("delete")
    .description("Delete a template.")
    .argument("<templateId>", "Template ID to delete.")
    .option("--root <path>", "Repository root.", ".")
    .action(
      async (
        templateId: string,
        options: { root: string },
      ) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          manager.deleteTemplate(templateId);

          console.log(`Template deleted: ${templateId}`);
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template delete failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  // Phase 4: 跨切片依赖管理命令
  const dependency = program.command("dependency").description("Legacy dependency-analysis commands for slice-based protocol graphs.");
  registerLegacySurfaceHint(dependency, "dependency");

  dependency
    .command("graph")
    .description("Display the dependency graph for all slices.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const { DependencyGraphBuilder } = require("./dependency-graph");
        const builder = new DependencyGraphBuilder(path.resolve(options.root));
        const graph = builder.build();

        if (options.json) {
          const output = {
            nodes: Array.from(graph.nodes.values()).map((node: any) => ({
              sliceId: node.sliceId,
              state: node.state,
              dependencies: node.dependencies,
            })),
            edges: graph.edges,
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(`Dependency Graph`);
          console.log(`Total slices: ${graph.nodes.size}`);
          console.log(`Total dependencies: ${graph.edges.length}`);
          console.log();

          for (const node of graph.nodes.values()) {
            console.log(`${node.sliceId} (${node.state})`);
            if (node.dependencies.length > 0) {
              for (const dep of node.dependencies) {
                const optional = dep.optional ? " [optional]" : "";
                console.log(`  → ${dep.slice_id} (${dep.kind}, requires: ${dep.required_state})${optional}`);
              }
            } else {
              console.log(`  (no dependencies)`);
            }
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Dependency graph failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("check")
    .description("Check for dependency issues (cycles, missing slices, etc.).")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const { DependencyGraphBuilder } = require("./dependency-graph");
        const builder = new DependencyGraphBuilder(path.resolve(options.root));
        const graph = builder.build();

        const cycles = builder.findCycles(graph);
        const issues: string[] = [];

        if (cycles.length > 0) {
          for (const cycle of cycles) {
            issues.push(`Cycle detected: ${cycle.join(" → ")}`);
          }
        }

        if (options.json) {
          console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
        } else {
          if (issues.length === 0) {
            console.log("✓ No dependency issues found.");
          } else {
            console.log(`✗ Found ${issues.length} issue(s):`);
            for (const issue of issues) {
              console.log(`  - ${issue}`);
            }
          }
        }

        process.exitCode = issues.length === 0 ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Dependency check failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("explain")
    .description("Explain dependencies for a specific slice.")
    .argument("<sliceId>", "Slice ID to explain.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const { DependencyGraphBuilder } = require("./dependency-graph");
        const builder = new DependencyGraphBuilder(path.resolve(options.root));
        const graph = builder.build();

        const node = graph.nodes.get(sliceId);
        if (!node) {
          throw new Error(`Slice '${sliceId}' not found.`);
        }

        const upstream = builder.getUpstream(graph, sliceId);
        const downstream = builder.getDownstream(graph, sliceId);

        if (options.json) {
          console.log(JSON.stringify({
            sliceId: node.sliceId,
            state: node.state,
            dependencies: node.dependencies,
            upstream,
            downstream,
          }, null, 2));
        } else {
          console.log(`Slice: ${node.sliceId}`);
          console.log(`State: ${node.state}`);
          console.log();

          console.log(`Direct dependencies (${node.dependencies.length}):`);
          if (node.dependencies.length > 0) {
            for (const dep of node.dependencies) {
              const optional = dep.optional ? " [optional]" : "";
              console.log(`  → ${dep.slice_id} (${dep.kind}, requires: ${dep.required_state})${optional}`);
            }
          } else {
            console.log(`  (none)`);
          }
          console.log();

          console.log(`All upstream dependencies (${upstream.length}):`);
          if (upstream.length > 0) {
            for (const upstreamId of upstream) {
              const upstreamNode = graph.nodes.get(upstreamId);
              console.log(`  → ${upstreamId} (${upstreamNode?.state || "unknown"})`);
            }
          } else {
            console.log(`  (none)`);
          }
          console.log();

          console.log(`All downstream dependents (${downstream.length}):`);
          if (downstream.length > 0) {
            for (const downstreamId of downstream) {
              const downstreamNode = graph.nodes.get(downstreamId);
              console.log(`  ← ${downstreamId} (${downstreamNode?.state || "unknown"})`);
            }
          } else {
            console.log(`  (none)`);
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Dependency explain failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("impact")
    .description("Analyze impact of changes to a slice.")
    .argument("<sliceId>", "Slice ID that changed.")
    .option("--root <path>", "Repository root.", ".")
    .option("--change-type <type>", "Type of change: content_changed, state_regressed, gate_failed.", "content_changed")
    .option("--artifacts <artifacts...>", "Changed artifacts: requirements, design, behavior, test, code, evidence.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; changeType: string; artifacts?: string[]; json: boolean }) => {
      try {
        const { ImpactAnalyzer } = require("./impact-analysis");
        const analyzer = new ImpactAnalyzer(path.resolve(options.root));

        const changeEvent = {
          slice_id: sliceId,
          timestamp: new Date().toISOString(),
          change_type: options.changeType,
          changed_artifacts: options.artifacts || ["code"],
          current_state: "verifying" as any,
        };

        const result = analyzer.analyzeImpact(changeEvent);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Impact Analysis for ${sliceId}`);
          console.log(`Change type: ${changeEvent.change_type}`);
          console.log(`Changed artifacts: ${changeEvent.changed_artifacts.join(", ")}`);
          console.log();

          if (result.total_impacted === 0) {
            console.log("No downstream slices impacted.");
          } else {
            console.log(`${result.total_impacted} downstream slice(s) impacted:`);
            console.log();

            for (const impacted of result.impacted_slices) {
              console.log(`${impacted.slice_id} (${impacted.current_state})`);
              console.log(`  Reason: ${impacted.impact_reason}`);
              console.log(`  Action: ${impacted.recommended_action}`);
              if (impacted.earliest_rerun_stage) {
                console.log(`  Rerun from: ${impacted.earliest_rerun_stage}`);
              }
              console.log();
            }
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Impact analysis failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("invalidate")
    .description("Compute invalidation actions for a changed slice.")
    .argument("<sliceId>", "Slice ID that changed.")
    .option("--root <path>", "Repository root.", ".")
    .option("--change-type <type>", "Type of change: content_changed, state_regressed, gate_failed.", "content_changed")
    .option("--artifacts <artifacts...>", "Changed artifacts: requirements, design, behavior, test, code, evidence.")
    .option("--dry-run", "Show actions without applying them.", true)
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; changeType: string; artifacts?: string[]; dryRun: boolean; json: boolean }) => {
      try {
        const { ImpactAnalyzer } = require("./impact-analysis");
        const analyzer = new ImpactAnalyzer(path.resolve(options.root));

        const changeEvent = {
          slice_id: sliceId,
          timestamp: new Date().toISOString(),
          change_type: options.changeType,
          changed_artifacts: options.artifacts || ["code"],
          current_state: "verifying" as any,
        };

        const result = analyzer.computeInvalidationActions(changeEvent, options.dryRun);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Invalidation Plan for ${sliceId}`);
          console.log(`Dry run: ${result.dry_run}`);
          console.log();

          if (result.actions.length === 0) {
            console.log("No invalidation actions needed.");
          } else {
            console.log(`${result.actions.length} action(s) to perform:`);
            console.log();

            for (const action of result.actions) {
              console.log(`${action.slice_id}:`);
              console.log(`  Action: ${action.action}`);
              console.log(`  Reason: ${action.reason}`);
              if (action.gates_to_invalidate) {
                console.log(`  Gates: ${action.gates_to_invalidate.join(", ")}`);
              }
              if (action.target_state) {
                console.log(`  Target state: ${action.target_state}`);
              }
              console.log();
            }
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Invalidation failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("schedule")
    .description("Schedule slices for execution based on dependency graph.")
    .option("--root <path>", "Repository root.", ".")
    .option("--slices <sliceIds...>", "Specific slice IDs to schedule (default: all slices).")
    .option("--execute", "Execute the schedule (default: dry-run only).", false)
    .option("--max-concurrent <n>", "Maximum concurrent tasks per batch.", "10")
    .option("--from-batch <n>", "Start execution from a specific batch number.", "0")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action(async (options: {
      root: string;
      slices?: string[];
      execute: boolean;
      maxConcurrent: string;
      fromBatch: string;
      json: boolean;
    }) => {
      try {
        const { CrossSliceScheduler } = require("./cross-slice-scheduler");
        const scheduler = new CrossSliceScheduler(path.resolve(options.root));

        if (options.execute) {
          // Execute the schedule
          const result = await scheduler.execute(options.slices, {
            maxConcurrent: parseInt(options.maxConcurrent, 10),
            fromBatch: parseInt(options.fromBatch, 10),
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(`Cross-Slice Execution Result`);
            console.log(`Total executed: ${result.total_executed}`);
            console.log(`Succeeded: ${result.total_succeeded}`);
            console.log(`Failed: ${result.total_failed}`);
            console.log(`Blocked: ${result.total_blocked}`);
            console.log(`Skipped: ${result.total_skipped}`);
            console.log(`Duration: ${result.duration_ms}ms`);
            console.log();

            for (const batch of result.scheduler_result.batches) {
              console.log(`Batch ${batch.batch_number} [${batch.status}]:`);
              for (const task of batch.tasks) {
                const status = task.status === "completed" ? "✓" :
                              task.status === "failed" ? "✗" :
                              task.status === "blocked" ? "⊘" :
                              task.status === "skipped" ? "⊗" : "○";
                const error = task.error ? ` (${task.error})` : "";
                const blocked = task.blocked_by && task.blocked_by.length > 0
                  ? ` [blocked by: ${task.blocked_by.join(", ")}]`
                  : "";
                console.log(`  ${status} ${task.slice_id} [${task.status}]${error}${blocked}`);
              }
              console.log();
            }
          }

          process.exitCode = result.total_failed > 0 ? 1 : 0;
        } else {
          // Dry-run: just show the schedule
          const result = scheduler.schedule(options.slices);

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(`Cross-Slice Execution Schedule`);
            console.log(`Total slices: ${result.total_slices}`);
            console.log(`Total batches: ${result.total_batches}`);
            console.log(`Dry run: ${result.dry_run}`);
            console.log();

            console.log(`Execution order: ${result.execution_order.join(" → ")}`);
            console.log();

            for (const batch of result.batches) {
              console.log(`Batch ${batch.batch_number} (${batch.tasks.length} task(s), can run in parallel):`);
              for (const task of batch.tasks) {
                const deps = task.dependencies.length > 0
                  ? ` [depends on: ${task.dependencies.join(", ")}]`
                  : "";
                const blocked = task.blocked_by && task.blocked_by.length > 0
                  ? ` [blocked by: ${task.blocked_by.join(", ")}]`
                  : "";
                console.log(`  - ${task.slice_id} (${task.current_state}) [${task.status}]${deps}${blocked}`);
              }
              console.log();
            }
          }

          process.exitCode = 0;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Scheduling failed: ${message}`);
        process.exitCode = 1;
      }
    });

//
//   dependency
//     .command("analyze")
//     .description("Analyze dependencies between slices.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--output <path>", "Output directory for reports.", ".jispec/dependencies")
//     .option("--json", "Emit machine-readable JSON output.", false)
//     .action(async (options: { root: string; output: string; json: boolean }) => {
//       try {
//         const root = path.resolve(options.root);
//         const outputDir = path.resolve(options.output);
// 
//         // 加载所有切片
//         const builder = new DependencyGraphBuilder();
//         // TODO: 实际加载切片数据
// 
//         // 构建依赖图
//         const analysis = await builder.analyze();
// 
//         // 保存报告
//         await builder.saveDependencyGraph(analysis, outputDir);
// 
//         if (options.json) {
//           console.log(JSON.stringify({
//             hasCycles: analysis.hasCycles,
//             statistics: analysis.statistics,
//           }, null, 2));
//         } else {
//           console.log("Dependency Analysis Complete");
//           console.log(`Total Nodes: ${analysis.statistics.totalNodes}`);
//           console.log(`Total Edges: ${analysis.statistics.totalEdges}`);
//           console.log(`Max Depth: ${analysis.statistics.maxDepth}`);
//           console.log(`Has Cycles: ${analysis.hasCycles}`);
//           console.log(`\nReports saved to: ${outputDir}`);
//         }
// 
//         process.exitCode = 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Dependency analysis failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });
// 
//   dependency
//     .command("detect-conflicts")
//     .description("Detect conflicts between slices.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--output <path>", "Output file for conflict report.", ".jispec/conflicts.json")
//     .option("--json", "Emit machine-readable JSON output.", false)
//     .action(async (options: { root: string; output: string; json: boolean }) => {
//       try {
//         const detector = new ConflictDetector();
//         // TODO: 加载切片和依赖图
// 
//         const result = await detector.detectConflicts();
// 
//         await detector.saveConflictReport(result, path.resolve(options.output));
// 
//         if (options.json) {
//           console.log(JSON.stringify(result.summary, null, 2));
//         } else {
//           console.log("Conflict Detection Complete");
//           console.log(`Total Conflicts: ${result.summary.totalConflicts}`);
//           console.log(`Critical: ${result.summary.bySeverity.critical}`);
//           console.log(`High: ${result.summary.bySeverity.high}`);
//           console.log(`Auto-resolvable: ${result.summary.autoResolvableCount}`);
//           console.log(`\nReport saved to: ${options.output}`);
//         }
// 
//         process.exitCode = result.hasConflicts ? 1 : 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Conflict detection failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });
// 
//   dependency
//     .command("impact")
//     .description("Analyze impact of changes to a slice.")
//     .argument("<sliceId>", "Slice ID to analyze.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--change-type <type>", "Type of change: add, modify, delete, refactor.", "modify")
//     .option("--output <path>", "Output file for impact report.")
//     .option("--json", "Emit machine-readable JSON output.", false)
//     .action(async (
//       sliceId: string,
//       options: { root: string; changeType: string; output?: string; json: boolean }
//     ) => {
//       try {
//         const analyzer = new ImpactAnalyzer();
//         // TODO: 加载切片和依赖图
// 
//         const report = await analyzer.analyzeImpact(
//           sliceId,
//           options.changeType as any
//         );
// 
//         if (options.output) {
//           await analyzer.saveImpactReport(report, path.resolve(options.output));
//         }
// 
//         if (options.json) {
//           console.log(JSON.stringify(report, null, 2));
//         } else {
//           const markdown = analyzer.generateMarkdownReport(report);
//           console.log(markdown);
//         }
// 
//         process.exitCode = 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Impact analysis failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });
// 
//   dependency
//     .command("resolve-versions")
//     .description("Resolve version conflicts across slices.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--output <path>", "Output file for version lock.", ".jispec/version-lock.json")
//     .option("--report <path>", "Output file for resolution report.", ".jispec/version-report.md")
//     .action(async (options: { root: string; output: string; report: string }) => {
//       try {
//         const resolver = new VersionResolver();
//         // TODO: 加载版本约束
// 
//         resolver.saveLockFile(path.resolve(options.output));
//         resolver.saveReport(path.resolve(options.report));
// 
//         console.log("Version Resolution Complete");
//         console.log(`Lock file saved to: ${options.output}`);
//         console.log(`Report saved to: ${options.report}`);
// 
//         process.exitCode = 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Version resolution failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });

  return program;
}

function registerFirstRunCommand(program: Command): void {
  program
    .command("first-run")
    .description("Guide a first-time user to the next stable JiSpec command based on local repo state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const result = runFirstRun({ root: path.resolve(options.root) });
        console.log(options.json ? renderFirstRunJSON(result) : renderFirstRunText(result));
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`First-run guide failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

export async function main(argv: string[] = process.argv): Promise<number> {
  if (isRootVersionRequest(argv)) {
    console.log(packageJson.version);
    return 0;
  }

  const program = buildProgram();
  await program.parseAsync(argv);
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}

function isRootVersionRequest(argv: string[]): boolean {
  const args = argv.slice(2);
  return args.length === 1 && (args[0] === "--version" || args[0] === "-v");
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
