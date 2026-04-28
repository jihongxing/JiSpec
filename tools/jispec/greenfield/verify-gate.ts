import * as yaml from "js-yaml";
import { createFactsContract } from "../facts/facts-contract";
import type { VerifyPolicy } from "../policy/policy-schema";

export interface GreenfieldVerifyGateDraft {
  policy: VerifyPolicy;
  ciWorkflow: string;
  gateReadme: string;
}

export function draftGreenfieldVerifyGate(): GreenfieldVerifyGateDraft {
  const policy = createGreenfieldVerifyPolicy();

  return {
    policy,
    ciWorkflow: renderGitHubWorkflow(),
    gateReadme: renderVerifyGateReadme(policy),
  };
}

export function renderGreenfieldVerifyPolicy(policy: VerifyPolicy): string {
  return dumpYaml(policy);
}

function createGreenfieldVerifyPolicy(): VerifyPolicy {
  const contract = createFactsContract();

  return {
    version: 1,
    requires: {
      facts_contract: contract.version,
    },
    greenfield: {
      review_gate: {
        blocking_review_item_blocks: true,
        low_confidence_blocks: true,
        low_confidence_blocks_by_decision_type: {
          product_framing: true,
          domain_context: true,
          contract: true,
          behavior: true,
          slice_plan: true,
          open_decision: true,
        },
        conflict_blocks: true,
        blocking_open_decision_types: [],
        rejected_blocks: true,
        deferred_or_waived_severity: "advisory",
        expired_defer_or_waive_severity: "blocking",
      },
    },
    rules: [
      {
        id: "greenfield-block-expired-spec-debt",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify blocks merge while expired spec debt remains open.",
        when: {
          fact: "greenfield.spec_debt_expired_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-block-unresolved-review-items",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify blocks implementation while blocking Initialization Review Pack items remain unresolved.",
        when: {
          fact: "greenfield.review_unresolved_blocking_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-block-low-confidence-review-items",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify blocks implementation while low-confidence review decisions are still only proposed.",
        when: {
          fact: "greenfield.review_low_confidence_unadopted_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-block-rejected-review-items",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify blocks implementation while rejected review decisions have not been corrected.",
        when: {
          fact: "greenfield.review_rejected_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-review-open-spec-debt",
        enabled: true,
        action: "warn",
        message: "Greenfield verify found open spec debt that should be planned for repayment.",
        when: {
          fact: "greenfield.spec_debt_open_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-block-code-drift",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify blocks merge while code exposes governed implementation facts that are not mapped to the Evidence Graph.",
        when: {
          fact: "greenfield.code_drift_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-block-spec-drift",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify blocks merge while the Evidence Graph references missing spec assets or missing coverage edges.",
        when: {
          fact: "greenfield.spec_drift_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-review-classified-drift",
        enabled: true,
        action: "warn",
        message: "Greenfield verify found implementation facts classified as ignored, experimental, or intentional.",
        when: {
          fact: "greenfield.classified_drift_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-no-blocking-verify-issues",
        enabled: true,
        action: "fail_blocking",
        message: "Greenfield verify gate blocks merge while blocking JiSpec issues exist.",
        when: {
          fact: "verify.blocking_issue_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "greenfield-review-advisory-verify-issues",
        enabled: true,
        action: "warn",
        message: "Greenfield verify found advisory or nonblocking issues that should be reviewed before release.",
        when: {
          fact: "verify.issue_count",
          op: ">",
          value: 0,
        },
      },
    ],
  };
}

function renderGitHubWorkflow(): string {
  return [
    "name: JiSpec Verify",
    "",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches:",
    "      - main",
    "      - master",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  jispec-verify:",
    "    runs-on: ubuntu-latest",
    "",
    "    steps:",
    "      - name: Check out repository",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Set up Node.js",
    "        uses: actions/setup-node@v4",
    "        with:",
    '          node-version: "22"',
    "",
    "      - name: Install project dependencies when present",
    "        shell: bash",
    "        run: |",
    "          if [ -f package-lock.json ]; then",
    "            npm ci",
    "          elif [ -f package.json ]; then",
    "            npm install",
    "          else",
    '            echo "No package.json found; JiSpec will run through npx."',
    "          fi",
    "",
    "      - name: Run JiSpec verify gate",
    "        shell: bash",
    "        run: |",
    "          if [ -f package.json ] && npm run | grep -q \"ci:verify\"; then",
    "            npm run ci:verify -- --root .",
    "          else",
    "            npx --yes jispec verify --root . --policy .spec/policy.yaml --baseline",
    "          fi",
  ].join("\n");
}

function renderVerifyGateReadme(policy: VerifyPolicy): string {
  return [
    "# JiSpec Verify Gate",
    "",
    "This project was initialized with a Greenfield verify gate.",
    "",
    "## Local Command",
    "",
    "```bash",
    "jispec-cli verify --root . --policy .spec/policy.yaml",
    "```",
    "",
    "## CI Command",
    "",
    "GitHub Actions runs `.github/workflows/jispec-verify.yml` on pull requests and pushes to `main` or `master`.",
    "",
    "## Default Policy",
    "",
    ...policy.rules.map((rule) => `- \`${rule.id}\`: ${rule.action}`),
    "",
    "## Gate Semantics",
    "",
    "- Blocking JiSpec issues fail the gate.",
    "- Advisory or nonblocking issues keep the command exit code green but remain visible in verify output.",
    "- Policy rules are pinned to the facts contract version declared in `.spec/policy.yaml`.",
    "- Review gate thresholds live under `greenfield.review_gate` in `.spec/policy.yaml`.",
    "- Initialization Review Pack decisions live in `.spec/greenfield/review-pack/review-record.yaml`.",
    "- Blocking review items, low-confidence proposed decisions, and rejected decisions stop implementation until resolved.",
    "- Code Drift means implementation facts such as routes, schemas, migrations, tests, or type definitions exist without Evidence Graph trace.",
    "- Spec Drift means Evidence Graph expectations reference missing assets or missing coverage edges.",
    "- Intentional, ignored, or experimental drift can be recorded in `.spec/evidence/ratchet-classifications.yaml`.",
    "- Waivers, deferrals, and known inconsistencies should be recorded in `.spec/spec-debt/ledger.yaml` with owner, expiration, affected assets, and repayment hint.",
    "",
  ].join("\n");
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}
