/**
 * Regression Test Runner
 *
 * Unified runner for the V1 and extended regression matrix.
 * Groups suites by product area so bootstrap takeover hardening can be
 * tracked separately from verify/CI, change/implement, and runtime surfaces.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import {
  DEFERRED_SURFACE_CONTRACT_VERSION,
  getDeferredRegressionSuites,
  getDeferredSurfaceContracts,
} from '../runtime/deferred-surface-contract';

export interface TestSuite {
  name: string;
  file: string;
  expectedTests: number;
  area: RegressionArea;
  task?: string;
}

export type RegressionArea =
  | 'core-mainline'
  | 'bootstrap-takeover-hardening'
  | 'retakeover-regression-pool'
  | 'verify-ci-gates'
  | 'change-implement'
  | 'runtime-extended';

type TestSuiteInput = Omit<TestSuite, 'area'>;

export const REGRESSION_AREA_ORDER: RegressionArea[] = [
  'core-mainline',
  'bootstrap-takeover-hardening',
  'retakeover-regression-pool',
  'verify-ci-gates',
  'change-implement',
  'runtime-extended',
];

function core(suite: TestSuiteInput): TestSuite {
  return { area: 'core-mainline', ...suite };
}

function bootstrap(suite: TestSuiteInput): TestSuite {
  return { area: 'bootstrap-takeover-hardening', ...suite };
}

function retakeover(suite: TestSuiteInput): TestSuite {
  return { area: 'retakeover-regression-pool', ...suite };
}

function gates(suite: TestSuiteInput): TestSuite {
  return { area: 'verify-ci-gates', ...suite };
}

function changeImplement(suite: TestSuiteInput): TestSuite {
  return { area: 'change-implement', ...suite };
}

function runtime(suite: TestSuiteInput): TestSuite {
  return { area: 'runtime-extended', ...suite };
}

export const TEST_SUITES: TestSuite[] = [
  core({ name: 'Rollback Regression', file: 'rollback-regression.ts', expectedTests: 5 }),
  core({ name: 'Semantic Validation', file: 'semantic-validation-negative.ts', expectedTests: 5 }),
  core({ name: 'CLI Help Surface', file: 'cli-help-surface.ts', expectedTests: 3 }),
  core({ name: 'CLI Legacy Surface Hint', file: 'cli-legacy-surface-hint.ts', expectedTests: 2 }),
  core({ name: 'Greenfield Command Surface', file: 'greenfield-command-surface.ts', expectedTests: 4 }),
  core({ name: 'Onboarding First Run', file: 'onboarding-first-run.ts', expectedTests: 7, task: 'P4-T4/M7-T4' }),
  core({ name: 'Greenfield Source Document Loader', file: 'greenfield-source-document-loader.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Project Asset Writer', file: 'greenfield-project-asset-writer.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Source Refresh', file: 'greenfield-source-refresh.ts', expectedTests: 3 }),
  core({ name: 'P11 Source Diff', file: 'p11-source-diff.ts', expectedTests: 6, task: 'P11-T1' }),
  core({ name: 'P11 Decision Packet Language', file: 'p11-decision-packet-language.ts', expectedTests: 6, task: 'P11-T2' }),
  core({ name: 'P11 Source Lifecycle Split', file: 'p11-source-lifecycle-split.ts', expectedTests: 3, task: 'P11-T3' }),
  core({ name: 'P11 Source Lifecycle Merge', file: 'p11-source-lifecycle-merge.ts', expectedTests: 3, task: 'P11-T3' }),
  core({ name: 'P11 Source Lifecycle Deprecate', file: 'p11-source-lifecycle-deprecate.ts', expectedTests: 3, task: 'P11-T3' }),
  core({ name: 'P11 Source Lifecycle Replace', file: 'p11-source-lifecycle-replace.ts', expectedTests: 3, task: 'P11-T3' }),
  core({ name: 'Greenfield Domain And Context Draft', file: 'greenfield-domain-context-draft.ts', expectedTests: 5 }),
  core({ name: 'Greenfield API Contract Draft', file: 'greenfield-api-contract-draft.ts', expectedTests: 6 }),
  core({ name: 'Greenfield Behavior Scenario Draft', file: 'greenfield-behavior-scenario-draft.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Initial Slice Queue', file: 'greenfield-initial-slice-queue.ts', expectedTests: 5, task: 'P3-T1' }),
  core({ name: 'Greenfield Verify Policy And CI Gate', file: 'greenfield-verify-policy-ci-gate.ts', expectedTests: 6, task: 'P3-T2' }),
  core({ name: 'Greenfield Empty Directory Acceptance Demo', file: 'greenfield-empty-directory-acceptance-demo.ts', expectedTests: 7, task: 'P3-T1' }),
  core({ name: 'Greenfield Spec Delta Model', file: 'greenfield-spec-delta-model.ts', expectedTests: 8 }),
  core({ name: 'Greenfield Baseline Snapshot', file: 'greenfield-baseline-snapshot.ts', expectedTests: 9, task: 'P2-T5' }),
  core({ name: 'Release Drift Trend', file: 'release-drift-trend.ts', expectedTests: 4, task: 'P3-T2' }),
  core({ name: 'Greenfield Evidence Graph', file: 'greenfield-evidence-graph.ts', expectedTests: 6 }),
  core({ name: 'Greenfield Two-Way Ratchet Verify', file: 'greenfield-two-way-ratchet-verify.ts', expectedTests: 7 }),
  core({ name: 'Greenfield Blast Radius Tracking', file: 'greenfield-blast-radius-tracking.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Spec Debt Ledger', file: 'greenfield-spec-debt-ledger.ts', expectedTests: 4 }),
  core({ name: 'Greenfield Deterministic Contract Graph', file: 'greenfield-deterministic-contract-graph.ts', expectedTests: 5 }),
  core({ name: 'Verify Runner Pass', file: 'verify-runner-pass.ts', expectedTests: 3 }),
  core({ name: 'Verify Runner Fail Blocking', file: 'verify-runner-fail-blocking.ts', expectedTests: 3 }),
  core({ name: 'Verify Runner Warn Advisory', file: 'verify-runner-warn-advisory.ts', expectedTests: 3 }),
  core({ name: 'Verify Runner Runtime Soft Fail', file: 'verify-runner-runtime-soft-fail.ts', expectedTests: 3 }),
  core({ name: 'Verify Kernel Surface', file: 'verify-kernel-surface.ts', expectedTests: 2 }),
  core({ name: 'Verify JSON Contract', file: 'verify-json-contract.ts', expectedTests: 3, task: 'P1-T5' }),
  core({ name: 'Facts Contract Roundtrip', file: 'facts-contract-roundtrip.ts', expectedTests: 4 }),
  core({ name: 'Policy Engine Basic', file: 'policy-engine-basic.ts', expectedTests: 5, task: 'P2-T6/M5-T1' }),
  core({ name: 'Policy Unknown Fact', file: 'policy-unknown-fact.ts', expectedTests: 5, task: 'P2-T6' }),
  core({ name: 'Verify Policy Integration', file: 'verify-policy-integration.ts', expectedTests: 5, task: 'P2-T6' }),
  core({ name: 'Policy Profile Next', file: 'policy-profile-next.ts', expectedTests: 10, task: 'P3-T1' }),
  core({ name: 'Verify Report Contract', file: 'verify-report-contract.ts', expectedTests: 4, task: 'P1-T5' }),
  core({ name: 'Verify Issue Fingerprint Stability', file: 'verify-issue-fingerprint-stability.ts', expectedTests: 2 }),
  core({ name: 'V1 Mainline Golden Path', file: 'v1-mainline-golden-path.ts', expectedTests: 4 }),
  core({ name: 'Doctor Mainline Readiness', file: 'doctor-mainline-readiness.ts', expectedTests: 7, task: 'P2-T3/N6/P1-T1' }),
  core({ name: 'V1 Sample Repo Smoke', file: 'v1-sample-repo-smoke.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Discover Smoke', file: 'bootstrap-discover-smoke.ts', expectedTests: 4, task: 'P1-T6' }),
  bootstrap({ name: 'Bootstrap Discover Empty Repo', file: 'bootstrap-discover-empty-repo.ts', expectedTests: 2 }),
  bootstrap({ name: 'Bootstrap Discover Signal Filtering', file: 'bootstrap-discover-signal-filtering.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Discover Exclusion Policy', file: 'bootstrap-discover-exclusion-policy.ts', expectedTests: 4, task: 'P1-T1' }),
  bootstrap({ name: 'Bootstrap Adoption Ranked Evidence', file: 'bootstrap-adoption-ranked-evidence.ts', expectedTests: 5, task: 'Task 2/P1-T6' }),
  bootstrap({ name: 'Bootstrap Evidence Ranking Score', file: 'bootstrap-evidence-ranking-score.ts', expectedTests: 4, task: 'P1-T2' }),
  bootstrap({ name: 'Bootstrap Ranking Regression', file: 'bootstrap-ranking-regression.ts', expectedTests: 5, task: 'P1-T2' }),
  bootstrap({ name: 'Bootstrap Discover Unknown Layout', file: 'bootstrap-discover-unknown-layout.ts', expectedTests: 2 }),
  bootstrap({ name: 'Bootstrap Draft Mock', file: 'bootstrap-draft-mock.ts', expectedTests: 7, task: 'Task 9' }),
  bootstrap({ name: 'Bootstrap Draft Fallback', file: 'bootstrap-draft-fallback.ts', expectedTests: 2 }),
  bootstrap({ name: 'Bootstrap Draft Quality', file: 'bootstrap-draft-quality.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Draft Ranked Evidence Context', file: 'bootstrap-draft-ranked-evidence-context.ts', expectedTests: 3, task: 'Task 2' }),
  bootstrap({ name: 'Bootstrap Draft Domain Re-Anchoring', file: 'bootstrap-draft-domain-reanchoring.ts', expectedTests: 4, task: 'Task 4' }),
  bootstrap({ name: 'Bootstrap Technical Boundary Suppression', file: 'bootstrap-technical-boundary-suppression.ts', expectedTests: 5, task: 'Task 13' }),
  bootstrap({ name: 'Bootstrap Domain Multilingual Vocabulary', file: 'bootstrap-domain-multilingual-vocabulary.ts', expectedTests: 4, task: 'Task 11' }),
  bootstrap({ name: 'Bootstrap Aggregate Root Synthesis', file: 'bootstrap-aggregate-root-synthesis.ts', expectedTests: 4, task: 'Task 12' }),
  bootstrap({ name: 'Bootstrap Domain Taxonomy Packs', file: 'bootstrap-domain-taxonomy-packs.ts', expectedTests: 5, task: 'Task 16' }),
  bootstrap({ name: 'Bootstrap Domain Generality Audit', file: 'bootstrap-domain-generality-audit.ts', expectedTests: 2, task: 'Task 16' }),
  bootstrap({ name: 'Bootstrap Draft Feature Scenarios', file: 'bootstrap-draft-feature-scenarios.ts', expectedTests: 4, task: 'Task 5' }),
  bootstrap({ name: 'Bootstrap Feature Confidence Gate', file: 'bootstrap-feature-confidence-gate.ts', expectedTests: 5, task: 'P1-T3' }),
  bootstrap({ name: 'Bootstrap API Surface Classification', file: 'bootstrap-api-surface-classification.ts', expectedTests: 6, task: 'Task 6/14' }),
  bootstrap({ name: 'Bootstrap Proto Domain Mapping', file: 'bootstrap-proto-domain-mapping.ts', expectedTests: 4, task: 'Task 14' }),
  bootstrap({ name: 'Bootstrap Init Project', file: 'bootstrap-init-project.ts', expectedTests: 4, task: 'Task 8' }),
  retakeover({ name: 'Bootstrap Real Retakeover Regression Fixtures', file: 'bootstrap-retakeover-regression.ts', expectedTests: 16, task: 'P0-T1/P0-T2/N8' }),
  bootstrap({ name: 'Adopt CLI Surface', file: 'adopt-cli-surface.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Adopt Atomic', file: 'bootstrap-adopt-atomic.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Adopt Handoff', file: 'bootstrap-adopt-handoff.ts', expectedTests: 7, task: 'Task 7/P1-T4' }),
  bootstrap({ name: 'Bootstrap Spec Debt', file: 'bootstrap-spec-debt.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Takeover Brief', file: 'bootstrap-takeover-brief.ts', expectedTests: 5, task: 'Task 7/17' }),
  bootstrap({ name: 'P9 Evidence Provenance Labels', file: 'p9-evidence-provenance-labels.ts', expectedTests: 6, task: 'P9-T2' }),
  retakeover({ name: 'Bootstrap Synthetic Messy Legacy Takeover Stress', file: 'bootstrap-messy-legacy-takeover.ts', expectedTests: 5, task: 'N9' }),
  gates({ name: 'Verify Contract-Aware Core', file: 'verify-contract-aware-core.ts', expectedTests: 3 }),
  gates({ name: 'Verify Bootstrap Takeover', file: 'verify-bootstrap-takeover.ts', expectedTests: 4 }),
  gates({ name: 'Verify Baseline Hardening', file: 'verify-baseline-hardening.ts', expectedTests: 3 }),
  gates({ name: 'Verify Waiver Hardening', file: 'verify-waiver-hardening.ts', expectedTests: 4, task: 'P2-T4' }),
  gates({ name: 'Verify Mitigation Stacking', file: 'verify-mitigation-stacking.ts', expectedTests: 2 }),
  gates({ name: 'CI Verify Wrapper', file: 'ci-verify-wrapper.ts', expectedTests: 3 }),
  gates({ name: 'CI Summary Markdown', file: 'ci-summary-markdown.ts', expectedTests: 4, task: 'P1-T5' }),
  gates({ name: 'Package Script Surface', file: 'package-script-surface.ts', expectedTests: 8, task: 'P4-T1/P4-T2' }),
  gates({ name: 'P4 Sample Repo And CI Templates', file: 'p4-sample-ci-templates.ts', expectedTests: 3, task: 'P4-T2' }),
  gates({ name: 'P4 Documentation Experience', file: 'p4-docs-experience.ts', expectedTests: 6, task: 'P4-T3' }),
  gates({ name: 'Integration Payloads', file: 'integration-payloads.ts', expectedTests: 6, task: 'P7-T2/M7-T2' }),
  gates({ name: 'Contract Source Adapters', file: 'contract-source-adapters.ts', expectedTests: 5, task: 'P7-T3' }),
  gates({ name: 'P9 External Graph Import Only', file: 'p9-external-graph-import-only.ts', expectedTests: 6, task: 'P9-T6' }),
  runtime({ name: 'Greenfield Canonicalization Contract', file: 'greenfield-canonicalization.ts', expectedTests: 6, task: 'TC-03' }),
  changeImplement({ name: 'Change Dual Mode', file: 'change-dual-mode.ts', expectedTests: 5, task: 'P2-T3' }),
  changeImplement({ name: 'Change Default Mode Config', file: 'change-default-mode-config.ts', expectedTests: 7, task: 'N7/P1-T1' }),
  changeImplement({ name: 'Change Mainline Hints', file: 'change-mainline-hints.ts', expectedTests: 2 }),
  changeImplement({ name: 'Implement Mainline Lane', file: 'implement-mainline-lane.ts', expectedTests: 3 }),
  changeImplement({ name: 'Implement Handoff Mainline', file: 'implement-handoff-mainline.ts', expectedTests: 1 }),
  changeImplement({ name: 'Implement Patch Mediation', file: 'implement-patch-mediation.ts', expectedTests: 4, task: 'P2-T1' }),
  changeImplement({ name: 'Implement Handoff Adapters', file: 'implement-handoff-adapters.ts', expectedTests: 6, task: 'P7-T1' }),
  changeImplement({ name: 'Implement Stall Budget', file: 'implement-stall-budget.ts', expectedTests: 4, task: 'P2-T2' }),
  changeImplement({ name: 'Implement CLI Parity', file: 'implement-cli-parity.ts', expectedTests: 3, task: 'P2-T4' }),
  changeImplement({ name: 'KTM Runtime Atomic Publication', file: 'ktm-runtime.ts', expectedTests: 3, task: 'CK-06' }),
  changeImplement({ name: 'Ambiguity Debt Register', file: 'ambiguity-debt-register.ts', expectedTests: 6 }),
  changeImplement({ name: 'P9 Change Impact Summary', file: 'p9-change-impact-summary.ts', expectedTests: 7, task: 'P9-T3' }),
  changeImplement({ name: 'P10 Agent Discipline Artifacts', file: 'agent-discipline-artifacts.ts', expectedTests: 10, task: 'P10-T1/P10-T2/P10-T3/P10-T4' }),
  changeImplement({ name: 'P10 Agent Discipline Implement', file: 'agent-discipline-implement.ts', expectedTests: 4, task: 'P10-T5/P10-T6/P10-T7' }),
  changeImplement({ name: 'P10 Agent Discipline Verify CI', file: 'agent-discipline-verify-ci.ts', expectedTests: 3, task: 'P10-T8' }),
  runtime({ name: 'Stage Runner Identity', file: 'stage-runner-identity-apply.ts', expectedTests: 8 }),
  runtime({ name: 'Cache Key Spec', file: 'cache-key-spec.ts', expectedTests: 10 }),
  runtime({ name: 'Cache Manifest Spec', file: 'cache-manifest-spec.ts', expectedTests: 10 }),
  runtime({ name: 'Cache Integration', file: 'cache-integration.ts', expectedTests: 4 }),
  runtime({ name: 'Cache Integration E2E', file: 'cache-integration-e2e.ts', expectedTests: 4 }),
  runtime({ name: 'Cache Portability', file: 'cache-portability.ts', expectedTests: 1 }),
  runtime({ name: 'Cache Context Input', file: 'cache-context-input.ts', expectedTests: 2 }),
  runtime({ name: 'Cache Cross-Slice Context', file: 'cache-cross-slice-context.ts', expectedTests: 1 }),
  runtime({ name: 'Windows-Safe Naming', file: 'windows-safe-naming.ts', expectedTests: 3 }),
  runtime({ name: 'Terminal State Rerun', file: 'terminal-state-rerun.ts', expectedTests: 2 }),
  runtime({ name: 'Stable Snapshot Gates', file: 'stable-snapshot-gates.ts', expectedTests: 1 }),
  runtime({ name: 'Evidence Cleanup', file: 'evidence-cleanup.ts', expectedTests: 2 }),
  runtime({ name: 'Greenfield Truth Fingerprint', file: 'greenfield-truth-fingerprint.ts', expectedTests: 3, task: 'TC-05' }),
  runtime({ name: 'Greenfield Snapshot Verifier', file: 'greenfield-snapshot-verifier.ts', expectedTests: 4, task: 'TC-06' }),
  runtime({ name: 'Greenfield Deterministic Fixtures', file: 'greenfield-deterministic-fixtures.ts', expectedTests: 5, task: 'TC-08' }),
  runtime({ name: 'Distributed Scheduler MVP', file: 'distributed-scheduler-mvp.ts', expectedTests: 5 }),
  runtime({ name: 'Distributed Cache MVP', file: 'distributed-cache-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Distributed Cache Invalidation & Warmup', file: 'distributed-cache-invalidation-warmup.ts', expectedTests: 3 }),
  runtime({ name: 'Remote Runtime MVP', file: 'remote-runtime-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Resource Management', file: 'resource-management.ts', expectedTests: 3 }),
  runtime({ name: 'Fault Recovery', file: 'fault-recovery.ts', expectedTests: 4 }),
  runtime({ name: 'Collaboration MVP', file: 'collaboration-mvp.ts', expectedTests: 4 }),
  runtime({ name: 'Conflict Resolution MVP', file: 'conflict-resolution-mvp.ts', expectedTests: 4 }),
  runtime({ name: 'Collaboration Awareness MVP', file: 'collaboration-awareness-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Collaboration Locking MVP', file: 'collaboration-locking-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Collaboration Notifications MVP', file: 'collaboration-notifications-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Collaboration Analytics MVP', file: 'collaboration-analytics-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Console Read Model Contract', file: 'console-read-model-contract.ts', expectedTests: 10, task: 'T3.1/P2-T1' }),
  runtime({ name: 'Audit Event Ledger', file: 'audit-event-ledger.ts', expectedTests: 6, task: 'P2-T2/P6-T1' }),
  runtime({ name: 'Console Governance Dashboard', file: 'console-governance-dashboard.ts', expectedTests: 7, task: 'P2-T3' }),
  runtime({ name: 'Console UI Smoke', file: 'console-ui-smoke.ts', expectedTests: 4, task: 'P5-T1' }),
  runtime({ name: 'Console Governance Actions', file: 'console-governance-actions.ts', expectedTests: 5, task: 'P2-T4' }),
  runtime({ name: 'Console Governance Export', file: 'console-governance-export.ts', expectedTests: 2, task: 'P3-T3' }),
  runtime({ name: 'P12 Console Source Evolution', file: 'p12-console-source-evolution.ts', expectedTests: 5, task: 'P12-T1' }),
  runtime({ name: 'P12 Multi-Repo Owner Loop', file: 'p12-multi-repo-owner-loop.ts', expectedTests: 7, task: 'P12-T2' }),
  runtime({ name: 'P12 Doctor Global Profile', file: 'p12-doctor-global.ts', expectedTests: 6, task: 'P12-T3' }),
  runtime({ name: 'P13 Release Global Context', file: 'p13-release-global-context.ts', expectedTests: 4, task: 'P13-T1' }),
  runtime({ name: 'P13 Global Closure Acceptance', file: 'p13-global-closure-acceptance.ts', expectedTests: 3, task: 'P13-T2' }),
  runtime({ name: 'P13 Deferred Surface Promotion', file: 'p13-deferred-surface-promotion.ts', expectedTests: 3, task: 'P13-T3' }),
  runtime({ name: 'P1 Global Closure Regression', file: 'p1-global-closure-regression.ts', expectedTests: 4, task: 'P1-T7' }),
  runtime({ name: 'Console Multi-Repo Governance', file: 'console-multi-repo-governance.ts', expectedTests: 5, task: 'P5-T3/M7-T1' }),
  runtime({ name: 'P9 Multi-Repo Contract Drift Hints', file: 'p9-multi-repo-contract-drift-hints.ts', expectedTests: 6, task: 'P9-T5' }),
  runtime({ name: 'Privacy Redaction', file: 'privacy-redaction.ts', expectedTests: 7, task: 'P6-T2/M7-T3' }),
  runtime({ name: 'Policy Approval Workflow', file: 'policy-approval-workflow.ts', expectedTests: 6, task: 'P6-T3/M7-T3' }),
  runtime({ name: 'Value Report', file: 'value-report.ts', expectedTests: 5, task: 'P8-T1' }),
  runtime({ name: 'Commercial Pilot Readiness', file: 'pilot-readiness.ts', expectedTests: 6, task: 'P8-T2/T0-5' }),
  runtime({ name: 'Pilot Product Package', file: 'pilot-product-package.ts', expectedTests: 4, task: 'M7-T4' }),
  runtime({ name: 'North Star Acceptance', file: 'north-star-acceptance.ts', expectedTests: 4, task: 'M7-T5' }),
  runtime({ name: 'Regression Matrix Contract', file: 'regression-matrix-contract.ts', expectedTests: 5, task: 'M5-T3' }),
  runtime({ name: 'P9 Baseline Contract', file: 'p9-baseline-contract.ts', expectedTests: 6, task: 'P9-T1' }),
  runtime({ name: 'P9 Reviewer Companion Consolidation', file: 'p9-reviewer-companion-consolidation.ts', expectedTests: 6, task: 'P9-T4' }),
  runtime({ name: 'P9 External Tool Run Opt-In Boundary', file: 'p9-external-tool-run-opt-in-boundary.ts', expectedTests: 6, task: 'P9-T7' }),
  runtime({ name: 'Collaboration Surface Freeze', file: 'collaboration-surface-freeze.ts', expectedTests: 4, task: 'P4-T2' }),
];

export interface RegressionMatrixTotals {
  totalSuites: number;
  totalExpectedTests: number;
}

export const REGRESSION_MATRIX_TOTALS: RegressionMatrixTotals = {
  totalSuites: TEST_SUITES.length,
  totalExpectedTests: TEST_SUITES.reduce((sum, suite) => sum + suite.expectedTests, 0),
};

export const REGRESSION_MATRIX_AREA_TOTALS: Record<RegressionArea, RegressionAreaSummary> = Object.fromEntries(
  REGRESSION_AREA_ORDER.map((area) => {
    const suites = TEST_SUITES.filter((suite) => suite.area === area);
    return [
      area,
      {
        area,
        suiteCount: suites.length,
        expectedTests: suites.reduce((sum, suite) => sum + suite.expectedTests, 0),
      },
    ];
  }),
) as Record<RegressionArea, RegressionAreaSummary>;

interface RegressionAreaSummary {
  area: RegressionArea;
  suiteCount: number;
  expectedTests: number;
}

interface RegressionMatrixManifest {
  schemaVersion: 1;
  source: string;
  totalSuites: number;
  totalExpectedTests: number;
  areas: RegressionAreaSummary[];
  suites: TestSuite[];
  boundaries: {
    v1MainlineAreas: RegressionArea[];
    runtimeExtendedArea: 'runtime-extended';
    pilotReadiness: {
      suiteFile: string;
      regressionArea: RegressionArea | 'missing';
      doctorProfile: 'pilot';
      runtimeDiagnosticOnly: true;
    };
    deferredSurfaces: {
      contractVersion: number;
      suiteCount: number;
      expectedTests: number;
      allowedRegressionArea: 'runtime-extended';
      allowedDoctorProfiles: ['runtime'];
      forbiddenDoctorProfiles: ['v1', 'pilot', 'global'];
      diagnosticsOnly: true;
      suites: string[];
    };
  };
  consistency: {
    valid: boolean;
    issues: string[];
  };
}

export function buildRegressionMatrixManifest(): RegressionMatrixManifest {
  const areas = REGRESSION_AREA_ORDER.map((area) => REGRESSION_MATRIX_AREA_TOTALS[area]);

  const deferredSuites = getDeferredRegressionSuites();
  const deferredSuiteSet = new Set(deferredSuites);
  const deferredExpectedTests = TEST_SUITES
    .filter((suite) => deferredSuiteSet.has(suite.file))
    .reduce((sum, suite) => sum + suite.expectedTests, 0);
  const pilotSuite = TEST_SUITES.find((suite) => suite.file === 'pilot-readiness.ts');

  const issues: string[] = [];
  const areaTotalSuites = areas.reduce((sum, area) => sum + area.suiteCount, 0);
  const areaTotalExpectedTests = areas.reduce((sum, area) => sum + area.expectedTests, 0);
  if (areaTotalSuites !== TEST_SUITES.length) {
    issues.push(`Area suite total ${areaTotalSuites} does not match registered suite count ${TEST_SUITES.length}`);
  }
  if (areaTotalExpectedTests !== TEST_SUITES.reduce((sum, suite) => sum + suite.expectedTests, 0)) {
    issues.push('Area expected test total does not match registered suite expected test total');
  }

  const seenFiles = new Set<string>();
  for (const suite of TEST_SUITES) {
    if (seenFiles.has(suite.file)) {
      issues.push(`Duplicate regression suite file: ${suite.file}`);
    }
    seenFiles.add(suite.file);
  }

  for (const suite of deferredSuites) {
    const registered = TEST_SUITES.find((candidate) => candidate.file === suite);
    if (!registered) {
      issues.push(`Deferred surface suite is not registered: ${suite}`);
    } else if (registered.area !== 'runtime-extended') {
      issues.push(`Deferred surface suite must stay in runtime-extended: ${suite}`);
    }
  }

  if (!pilotSuite) {
    issues.push('Pilot readiness regression suite is not registered: pilot-readiness.ts');
  } else if (pilotSuite.area !== 'runtime-extended') {
    issues.push('Pilot readiness regression suite must stay in runtime-extended and leave gating to doctor pilot');
  }

  for (const contract of getDeferredSurfaceContracts()) {
    if (!contract.forbiddenDoctorProfiles.includes('pilot') || !contract.forbiddenDoctorProfiles.includes('global')) {
      issues.push(`Deferred surface contract ${contract.id} does not forbid doctor pilot/global gating`);
    }
  }

  return {
    schemaVersion: 1,
    source: 'tools/jispec/tests/regression-runner.ts',
    totalSuites: REGRESSION_MATRIX_TOTALS.totalSuites,
    totalExpectedTests: REGRESSION_MATRIX_TOTALS.totalExpectedTests,
    areas,
    suites: TEST_SUITES.map((suite) => ({ ...suite })),
    boundaries: {
      v1MainlineAreas: [
        'core-mainline',
        'bootstrap-takeover-hardening',
        'retakeover-regression-pool',
        'verify-ci-gates',
        'change-implement',
      ],
      runtimeExtendedArea: 'runtime-extended',
      pilotReadiness: {
        suiteFile: 'pilot-readiness.ts',
        regressionArea: pilotSuite?.area ?? 'missing',
        doctorProfile: 'pilot',
        runtimeDiagnosticOnly: true,
      },
      deferredSurfaces: {
        contractVersion: DEFERRED_SURFACE_CONTRACT_VERSION,
        suiteCount: deferredSuites.length,
        expectedTests: deferredExpectedTests,
        allowedRegressionArea: 'runtime-extended',
        allowedDoctorProfiles: ['runtime'],
        forbiddenDoctorProfiles: ['v1', 'pilot', 'global'],
        diagnosticsOnly: true,
        suites: deferredSuites,
      },
    },
    consistency: {
      valid: issues.length === 0,
      issues,
    },
  };
}

interface TestResult {
  suite: string;
  area: RegressionArea;
  task?: string;
  passed: boolean;
  expected: number;
  actual: number;
  error?: string;
}

interface RegressionBuildWorkspace {
  root: string;
  preparedAt: number;
  reused: boolean;
}

interface RegressionBuildManifest {
  schemaVersion: 1;
  signature: string;
  preparedAt: string;
}

const REGRESSION_BUILD_SCHEMA_VERSION = 1;
const REGRESSION_BUILD_DIR_NAME = '.tmp-regression-runtime';
const REGRESSION_BUILD_MANIFEST = '.regression-build.json';
const REGRESSION_WRITABLE_DIRS = ['tools', 'scripts'] as const;
const REGRESSION_LINKED_DIRS = ['agents', 'bin', 'contexts', 'docs', 'examples', 'jiproject', 'schemas', 'templates'] as const;
const REGRESSION_COPIED_FILES = [
  '.gitlab-ci.jispec-template.yml',
  'package.json',
  'README.md',
  'README.zh-CN.md',
  'tsconfig.json',
] as const;

function getProjectRoot(): string {
  return path.join(__dirname, '..', '..', '..');
}

function buildRootPath(projectRoot: string): string {
  return path.join(projectRoot, REGRESSION_BUILD_DIR_NAME);
}

function buildManifestPath(buildRoot: string): string {
  return path.join(buildRoot, REGRESSION_BUILD_MANIFEST);
}

function collectRegressionBuildSignature(projectRoot: string): string {
  const trackedPaths = [
    ...REGRESSION_WRITABLE_DIRS.map((entry) => path.join(projectRoot, entry)),
    ...REGRESSION_COPIED_FILES.map((entry) => path.join(projectRoot, entry)),
    path.join(projectRoot, 'node_modules', 'typescript', 'package.json'),
  ];
  const entries: string[] = [];

  for (const trackedPath of trackedPaths) {
    collectSignatureEntries(trackedPath, projectRoot, entries);
  }

  return entries.sort().join('\n');
}

function collectSignatureEntries(targetPath: string, projectRoot: string, entries: string[]): void {
  if (!fs.existsSync(targetPath)) {
    const relativePath = path.relative(projectRoot, targetPath).replace(/\\/g, '/');
    entries.push(`missing:${relativePath}`);
    return;
  }

  const stats = fs.statSync(targetPath);
  const relativePath = path.relative(projectRoot, targetPath).replace(/\\/g, '/');

  if (stats.isDirectory()) {
    entries.push(`dir:${relativePath}`);
    const children = fs.readdirSync(targetPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      collectSignatureEntries(path.join(targetPath, child.name), projectRoot, entries);
    }
    return;
  }

  entries.push(`file:${relativePath}:${stats.size}:${Math.trunc(stats.mtimeMs)}`);
}

function readRegressionBuildManifest(buildRoot: string): RegressionBuildManifest | undefined {
  const manifestPath = buildManifestPath(buildRoot);
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as RegressionBuildManifest;
  } catch {
    return undefined;
  }
}

function writeRegressionBuildManifest(buildRoot: string, signature: string): void {
  const manifest: RegressionBuildManifest = {
    schemaVersion: REGRESSION_BUILD_SCHEMA_VERSION,
    signature,
    preparedAt: new Date().toISOString(),
  };
  fs.writeFileSync(buildManifestPath(buildRoot), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

function ensureRegressionBuildWorkspace(projectRoot: string): RegressionBuildWorkspace {
  const buildRoot = buildRootPath(projectRoot);
  const signature = collectRegressionBuildSignature(projectRoot);
  const existingManifest = readRegressionBuildManifest(buildRoot);
  const compiledRunnerPath = path.join(buildRoot, 'tools', 'jispec', 'tests', 'regression-runner.js');

  if (
    existingManifest?.schemaVersion === REGRESSION_BUILD_SCHEMA_VERSION &&
    existingManifest.signature === signature &&
    fs.existsSync(compiledRunnerPath)
  ) {
    return {
      root: buildRoot,
      preparedAt: Date.now(),
      reused: true,
    };
  }

  fs.rmSync(buildRoot, { recursive: true, force: true });
  fs.mkdirSync(buildRoot, { recursive: true });

  for (const directory of REGRESSION_WRITABLE_DIRS) {
    fs.cpSync(path.join(projectRoot, directory), path.join(buildRoot, directory), { recursive: true });
  }

  for (const directory of REGRESSION_LINKED_DIRS) {
    const sourcePath = path.join(projectRoot, directory);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    fs.symlinkSync(sourcePath, path.join(buildRoot, directory), process.platform === 'win32' ? 'junction' : 'dir');
  }

  const githubSource = path.join(projectRoot, '.github');
  if (fs.existsSync(githubSource)) {
    fs.symlinkSync(githubSource, path.join(buildRoot, '.github'), process.platform === 'win32' ? 'junction' : 'dir');
  }

  for (const file of REGRESSION_COPIED_FILES) {
    const sourcePath = path.join(projectRoot, file);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    fs.copyFileSync(sourcePath, path.join(buildRoot, file));
  }

  compileRegressionBuildWorkspace(buildRoot, projectRoot);
  writeRegressionBuildManifest(buildRoot, signature);

  return {
    root: buildRoot,
    preparedAt: Date.now(),
    reused: false,
  };
}

function compileRegressionBuildWorkspace(buildRoot: string, projectRoot: string): void {
  const typescriptCli = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const result = spawnSync(
    process.execPath,
    [typescriptCli, '--outDir', '.', '--rootDir', '.', '--incremental', 'false', '--pretty', 'false'],
    {
      cwd: buildRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
      shell: false,
    },
  );

  if (result.error) {
    throw new Error(`Failed to start regression build compiler: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Regression build compiler exited with a non-zero status.');
  }
}

function compiledSuitePath(workspaceRoot: string, suite: TestSuite): string {
  return path.join(workspaceRoot, 'tools', 'jispec', 'tests', suite.file.replace(/\.ts$/, '.js'));
}

async function runTestSuite(suite: TestSuite, workspaceRoot?: string): Promise<TestResult> {
  const testPath = workspaceRoot ? compiledSuitePath(workspaceRoot, suite) : path.join(__dirname, suite.file);
  const cwd = workspaceRoot ?? getProjectRoot();
  const args = workspaceRoot ? [testPath] : ['--import', 'tsx', testPath];

  try {
    const output = execFileSync(process.execPath, args, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd,
    });

    // Parse output for test count - try multiple patterns
    let match = output.match(/(\d+)\/(\d+)/);
    if (!match) {
      // Try "X passed, Y failed" pattern
      match = output.match(/(\d+) passed, (\d+) failed/);
      if (match) {
        const passed = parseInt(match[1], 10);
        const failed = parseInt(match[2], 10);
        const actual = passed;
        const expected = passed + failed;

        return {
          suite: suite.name,
          area: suite.area,
          task: suite.task,
          passed: failed === 0 && expected === suite.expectedTests,
          expected: suite.expectedTests,
          actual,
        };
      }
    }
    if (!match) {
      // Try "Passed: X\nFailed: Y" pattern
      const passedMatch = output.match(/Passed: (\d+)/);
      const failedMatch = output.match(/Failed: (\d+)/);
      if (passedMatch && failedMatch) {
        const passed = parseInt(passedMatch[1], 10);
        const failed = parseInt(failedMatch[1], 10);
        const actual = passed;
        const expected = passed + failed;

        return {
          suite: suite.name,
          area: suite.area,
          task: suite.task,
          passed: failed === 0 && expected === suite.expectedTests,
          expected: suite.expectedTests,
          actual,
        };
      }
    }
    if (!match) {
      // Try alternative pattern: "X tests passed"
      match = output.match(/(\d+)\/(\d+) tests passed/);
    }
    if (!match) {
      // Try another pattern: "All X tests passed"
      match = output.match(/All (\d+) tests passed/);
      if (match) {
        const count = parseInt(match[1], 10);
        return {
          suite: suite.name,
          area: suite.area,
          task: suite.task,
          passed: count === suite.expectedTests,
          expected: suite.expectedTests,
          actual: count,
        };
      }
    }

    if (match) {
      const actual = parseInt(match[1], 10);
      const expected = parseInt(match[2], 10);

      return {
        suite: suite.name,
        area: suite.area,
        task: suite.task,
        passed: actual === expected && expected === suite.expectedTests,
        expected: suite.expectedTests,
        actual,
      };
    }

    return {
      suite: suite.name,
      area: suite.area,
      task: suite.task,
      passed: false,
      expected: suite.expectedTests,
      actual: 0,
      error: 'Could not parse test output',
    };
  } catch (error: any) {
    return {
      suite: suite.name,
      area: suite.area,
      task: suite.task,
      passed: false,
      expected: suite.expectedTests,
      actual: 0,
      error: error.message,
    };
  }
}

async function main(options: { area?: RegressionArea } = {}) {
  const suites = options.area ? TEST_SUITES.filter((suite) => suite.area === options.area) : TEST_SUITES;
  const scopeSuffix = options.area ? ` (${options.area})` : '';
  console.log(`=== JiSpec Unified Regression Test Matrix${scopeSuffix} ===\n`);

  const buildStartedAt = Date.now();
  let workspace: RegressionBuildWorkspace | undefined;
  try {
    workspace = ensureRegressionBuildWorkspace(getProjectRoot());
    const buildSeconds = ((Date.now() - buildStartedAt) / 1000).toFixed(1);
    const workspaceStatus = workspace.reused ? 'reused' : 'prepared';
    console.log(`Using compiled regression workspace (${workspaceStatus}) in ${buildSeconds}s\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const buildSeconds = ((Date.now() - buildStartedAt) / 1000).toFixed(1);
    console.log(`Compiled regression workspace unavailable after ${buildSeconds}s; falling back to tsx.`);
    console.log(`Reason: ${message}\n`);
  }

  const results: TestResult[] = [];

  for (const suite of suites) {
    const taskSuffix = suite.task ? ` ${suite.task}` : '';
    process.stdout.write(`Running [${suite.area}${taskSuffix}] ${suite.name}... `);
    const result = await runTestSuite(suite, workspace?.root);
    results.push(result);

    if (result.passed) {
      console.log(`✓ ${result.actual}/${result.expected}`);
    } else {
      console.log(`✗ ${result.actual}/${result.expected}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    }
  }

  console.log('\n=== Summary ===');
  const totalPassed = results.filter(r => r.passed).length;
  const totalSuites = results.length;
  const totalTests = results.reduce((sum, r) => sum + r.actual, 0);
  const totalExpected = results.reduce((sum, r) => sum + r.expected, 0);

  console.log(`Suites: ${totalPassed}/${totalSuites} passed`);
  console.log(`Tests: ${totalTests}/${totalExpected} passed`);
  printAreaSummary(results);

  if (totalPassed === totalSuites) {
    console.log('\n✓ All regression tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some regression tests failed');
    process.exit(1);
  }
}

function printAreaSummary(results: TestResult[]): void {
  console.log('\n=== Matrix By Area ===');
  for (const area of REGRESSION_AREA_ORDER) {
    const areaResults = results.filter((result) => result.area === area);
    if (areaResults.length === 0) {
      continue;
    }

    const passedSuites = areaResults.filter((result) => result.passed).length;
    const actualTests = areaResults.reduce((sum, result) => sum + result.actual, 0);
    const expectedTests = areaResults.reduce((sum, result) => sum + result.expected, 0);
    console.log(`${area}: ${passedSuites}/${areaResults.length} suites, ${actualTests}/${expectedTests} tests`);
  }
}

function isRegressionArea(value: string): value is RegressionArea {
  return REGRESSION_AREA_ORDER.includes(value as RegressionArea);
}

function readOptionValue(optionName: string): string | undefined {
  const index = process.argv.indexOf(optionName);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runCli(): void {
  if (process.argv.includes('--manifest-json')) {
    console.log(JSON.stringify(buildRegressionMatrixManifest(), null, 2));
    return;
  }

  const areaOption = readOptionValue('--area');
  if (areaOption && !isRegressionArea(areaOption)) {
    console.error(`Unknown regression area: ${areaOption}`);
    process.exit(1);
  }

  main({ area: areaOption ? (areaOption as RegressionArea) : undefined }).catch(error => {
    console.error('Regression runner failed:', error);
    process.exit(1);
  });
}

if (require.main === module) {
  runCli();
}
