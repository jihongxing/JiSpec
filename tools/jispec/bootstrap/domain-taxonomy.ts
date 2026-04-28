import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { normalizeBoundaryLabel } from "./domain-boundary-policy";
import { normalizeEvidencePath } from "./evidence-graph";

export type BuiltinDomainTaxonomyPackId = "finance-portfolio" | "network-gateway" | "saas-control-plane";
export type DomainTaxonomyPackId = string;

export interface DomainTaxonomyTerm {
  label: string;
  phrases: string[];
  weight: number;
  aggregateName?: string;
  scenario?: DomainTaxonomyScenarioTemplate;
}

export interface DomainTaxonomyScenarioTemplate {
  scenarioName: string;
  given: string;
  when: string;
  then: string;
}

export interface DomainTaxonomyServiceMapping {
  servicePatterns: RegExp[];
  boundedContext: string;
  contextLabels: string[];
  aggregateRoots: string[];
}

export interface DomainTaxonomyPack {
  id: DomainTaxonomyPackId;
  title: string;
  terms: DomainTaxonomyTerm[];
  pathHints: Array<{
    label: string;
    patterns: RegExp[];
    boost: number;
  }>;
  serviceMappings?: DomainTaxonomyServiceMapping[];
}

export interface DomainTaxonomyEvidenceBoost {
  score: number;
  reasons: string[];
  labels: string[];
}

type UnknownRecord = Record<string, unknown>;

const BUILTIN_DOMAIN_TAXONOMY_PACKS: DomainTaxonomyPack[] = [
  {
    id: "finance-portfolio",
    title: "Finance Portfolio",
    terms: [
      {
        label: "portfolio",
        phrases: [
          "portfolio",
          "asset portfolio",
          "family asset",
          "family assets",
          "holdings",
          "holding book",
          "asset allocation",
          "rebalance",
          "rebalancing",
          "allocation policy",
          "投资组合",
          "资产组合",
          "家庭资产",
          "组合管理",
          "持仓",
          "调仓",
          "再平衡",
        ],
        weight: 118,
        aggregateName: "Portfolio",
        scenario: {
          scenarioName: "Portfolio control action preserves risk boundaries",
          given: "portfolio state requires a controlled allocation decision",
          when: "the portfolio control action is evaluated",
          then: "the resulting allocation respects the configured risk boundary",
        },
      },
      {
        label: "governance",
        phrases: [
          "governance",
          "policy approval",
          "approval workflow",
          "risk governance",
          "investment committee",
          "owner approval",
          "approval memo",
          "risk limit",
          "rebalance approval",
          "治理",
          "策略审批",
          "审批",
          "风控治理",
          "权限治理",
          "授权审批",
          "投委会",
        ],
        weight: 112,
        aggregateName: "GovernanceDecision",
        scenario: {
          scenarioName: "Governance decision is applied with audit evidence",
          given: "a policy or operational change requires governance approval",
          when: "the governance decision is accepted by an authorized actor",
          then: "the approved decision is persisted with reviewable audit evidence",
        },
      },
      {
        label: "ledger",
        phrases: ["ledger", "bookkeeping", "accounting ledger", "capital ledger", "cash ledger", "position ledger", "账本", "台账", "流水账", "资金台账", "持仓台账"],
        weight: 104,
        aggregateName: "Ledger",
        scenario: {
          scenarioName: "Ledger movement preserves an auditable balance trail",
          given: "a financial movement changes account state",
          when: "the movement is committed through the ledger boundary",
          then: "balances and reconciliation evidence remain traceable",
        },
      },
      {
        label: "reporting",
        phrases: [
          "reporting",
          "report suite",
          "report center",
          "reconciliation report",
          "audit trail",
          "statement workspace",
          "performance statement",
          "NAV report",
          "report pack",
          "报表",
          "报告",
          "对账",
          "留痕",
          "审计留痕",
          "绩效报表",
          "净值报表",
        ],
        weight: 102,
        aggregateName: "ReportingView",
        scenario: {
          scenarioName: "Reporting output reflects committed system state",
          given: "committed domain state is available for reporting",
          when: "a report is generated for an operator",
          then: "the report reflects the latest auditable domain facts",
        },
      },
      {
        label: "broker-sync",
        phrases: ["broker sync", "broker synchronization", "broker-sync", "broker reconciliation", "custodian import", "broker import", "custodian reconciliation", "券商同步", "经纪商同步", "交易商同步", "托管行同步", "券商导入"],
        weight: 100,
        aggregateName: "BrokerSyncRun",
        scenario: {
          scenarioName: "Broker sync reconciles external and internal positions",
          given: "broker state and internal state may differ",
          when: "broker synchronization completes",
          then: "differences are recorded for reconciliation before execution proceeds",
        },
      },
      {
        label: "alpha-ledger",
        phrases: ["alpha ledger", "alpha-ledger", "alpha账本", "alpha 账本", "实验账本", "策略账本"],
        weight: 98,
        aggregateName: "AlphaLedger",
        scenario: {
          scenarioName: "Alpha experiment remains isolated from the main ledger",
          given: "an alpha experiment produces a candidate movement",
          when: "the experiment records its result",
          then: "the alpha ledger remains isolated from the main portfolio ledger",
        },
      },
      {
        label: "withdrawal",
        phrases: ["withdrawal", "withdrawal request", "withdraw request", "payout", "提现", "出金", "提款"],
        weight: 96,
        aggregateName: "WithdrawalRequest",
        scenario: {
          scenarioName: "Withdrawal request is approved, executed, and recorded",
          given: "a withdrawal request is pending manual approval",
          when: "an authorized operator approves and records the execution",
          then: "the ledger and audit trail preserve the approved withdrawal outcome",
        },
      },
    ],
    pathHints: [
      { label: "portfolio", patterns: [/holdings/i, /portfolio/i, /allocation/i, /rebalance/i], boost: 18 },
      { label: "governance", patterns: [/governance/i, /approval/i, /risk/i], boost: 16 },
      { label: "ledger", patterns: [/ledger/i, /positions?/i, /capital/i], boost: 14 },
      { label: "reporting", patterns: [/reports?/i, /statement/i, /performance/i], boost: 14 },
      { label: "broker-sync", patterns: [/broker/i, /custodian/i, /sync/i], boost: 14 },
    ],
  },
  {
    id: "network-gateway",
    title: "Network Gateway",
    terms: [
      {
        label: "gateway",
        phrases: ["gateway", "access gateway", "tunnel gateway", "edge ingress", "traffic gateway", "access edge", "gateway fabric", "网关", "接入网关", "隧道网关", "边缘接入", "流量网关"],
        weight: 116,
        aggregateName: "Gateway",
        scenario: {
          scenarioName: "Gateway strategy switch preserves transport continuity",
          given: "a gateway is serving traffic under an active strategy",
          when: "a strategy switch is issued by the control plane",
          then: "the gateway applies the new strategy without losing recovery evidence",
        },
      },
      {
        label: "control-plane",
        phrases: ["control plane", "control-plane", "policy control", "policy rollout", "control command", "fleet policy", "runtime policy", "控制平面", "策略控制", "管控面", "策略下发", "控制指令"],
        weight: 112,
        aggregateName: "ControlCommand",
        scenario: {
          scenarioName: "Control plane applies a policy change safely",
          given: "a control-plane policy change has been requested",
          when: "the policy is validated and applied to managed components",
          then: "downstream components observe the accepted policy version",
        },
      },
      {
        label: "protocol",
        phrases: ["protocol", "grpc contract", "protobuf contract", "wire protocol", "tunnel protocol", "transport contract", "handshake protocol", "协议", "通信协议", "接口协议", "隧道协议", "传输协议"],
        weight: 108,
        aggregateName: "ControlCommand",
        scenario: {
          scenarioName: "Protocol contract keeps producer and consumer behavior aligned",
          given: "a producer and consumer exchange protocol-backed messages",
          when: "a protocol operation is invoked",
          then: "the request and response remain compatible with the declared contract",
        },
      },
      {
        label: "session",
        phrases: ["session recovery", "session continuity", "failover session", "session handoff", "connection recovery", "continuity token", "会话恢复", "会话保持", "断线恢复", "会话切换", "连接恢复"],
        weight: 104,
        aggregateName: "Session",
        scenario: {
          scenarioName: "Session recovery preserves continuity evidence",
          given: "a session is active before a continuity event",
          when: "the session recovery path is exercised",
          then: "recovery state remains traceable for the owner",
        },
      },
      {
        label: "cell-runtime",
        phrases: ["runtime cell", "edge cell", "placement cell", "cell runtime", "运行单元", "边缘单元"],
        weight: 102,
        aggregateName: "Cell",
        scenario: {
          scenarioName: "Cell runtime command updates managed session state",
          given: "a cell runtime is managing active sessions",
          when: "the cell service accepts a runtime command",
          then: "cell and session state remain aligned with the protobuf contract",
        },
      },
      {
        label: "client",
        phrases: ["client session", "access client", "client recovery", "客户端会话", "客户端恢复"],
        weight: 96,
        aggregateName: "ClientSession",
        scenario: {
          scenarioName: "Client session recovers after access disruption",
          given: "a client session is active and network access is disrupted",
          when: "the client reconnects through the supported access boundary",
          then: "session continuity and recovery state remain visible",
        },
      },
    ],
    pathHints: [
      { label: "gateway", patterns: [/gateway/i, /ingress/i, /edge/i], boost: 18 },
      { label: "control-plane", patterns: [/control[-_]?plane/i, /policy/i, /command/i], boost: 16 },
      { label: "protocol", patterns: [/proto/i, /protocol/i, /transport/i, /tunnel/i], boost: 16 },
      { label: "session", patterns: [/session/i, /recovery/i, /failover/i], boost: 14 },
      { label: "cell-runtime", patterns: [/cell/i, /runtime/i, /placement/i], boost: 14 },
      { label: "client", patterns: [/client/i], boost: 10 },
    ],
    serviceMappings: [
      {
        servicePatterns: [/\bgateway(?:service)?\b/i, /\bgateway\s+service\b/i],
        boundedContext: "gateway-control-plane",
        contextLabels: ["gateway", "control-plane"],
        aggregateRoots: ["Gateway", "ControlCommand"],
      },
      {
        servicePatterns: [/\bcell(?:service)?\b/i, /\bcell\s+service\b/i],
        boundedContext: "cell-runtime",
        contextLabels: ["cell-runtime"],
        aggregateRoots: ["Cell", "Session"],
      },
      {
        servicePatterns: [/\bsession(?:service)?\b/i, /\bsession\s+service\b/i],
        boundedContext: "session",
        contextLabels: ["session"],
        aggregateRoots: ["Session"],
      },
    ],
  },
  {
    id: "saas-control-plane",
    title: "SaaS Control Plane",
    terms: [
      {
        label: "tenant",
        phrases: ["tenant lifecycle", "tenant workspace", "tenant account", "租户", "租户空间"],
        weight: 112,
        aggregateName: "Tenant",
      },
      {
        label: "entitlement",
        phrases: ["entitlement", "feature entitlement", "plan limit", "subscription limit", "权益", "套餐限制"],
        weight: 108,
        aggregateName: "Entitlement",
      },
      {
        label: "billing-account",
        phrases: ["billing account", "subscription invoice", "metered billing", "账单账户", "订阅账单"],
        weight: 106,
        aggregateName: "BillingAccount",
        scenario: {
          scenarioName: "Billing account change preserves account consistency",
          given: "a billing account has a pending protocol-backed change",
          when: "the billing service accepts the account operation",
          then: "billing account state remains consistent with the protobuf contract",
        },
      },
      {
        label: "workspace",
        phrases: ["workspace provisioning", "workspace policy", "project workspace", "工作区", "项目空间"],
        weight: 102,
        aggregateName: "Workspace",
      },
      {
        label: "control-plane",
        phrases: ["admin control plane", "policy rollout", "organization policy", "管理控制台", "组织策略"],
        weight: 100,
        aggregateName: "ControlCommand",
      },
    ],
    pathHints: [
      { label: "tenant", patterns: [/tenant/i, /organization/i, /org/i], boost: 18 },
      { label: "entitlement", patterns: [/entitlement/i, /\bplan\b/i, /\blimit\b/i], boost: 16 },
      { label: "billing-account", patterns: [/billing/i, /invoice/i, /subscription/i], boost: 16 },
      { label: "workspace", patterns: [/workspace/i, /project/i], boost: 14 },
      { label: "control-plane", patterns: [/admin/i, /policy/i, /control/i], boost: 14 },
    ],
    serviceMappings: [
      {
        servicePatterns: [/\bbilling(?:service)?\b/i, /\baccount(?:service)?\b/i, /\binvoice(?:service)?\b/i],
        boundedContext: "billing-account",
        contextLabels: ["billing-account"],
        aggregateRoots: ["BillingAccount"],
      },
    ],
  },
];

export function getBuiltinDomainTaxonomyPacks(): DomainTaxonomyPack[] {
  return BUILTIN_DOMAIN_TAXONOMY_PACKS;
}

export function resolveDomainTaxonomyPacks(packIds: string[]): DomainTaxonomyPack[] {
  const byId = new Map(BUILTIN_DOMAIN_TAXONOMY_PACKS.map((pack) => [pack.id, pack]));
  const packs: DomainTaxonomyPack[] = [];
  const seen = new Set<string>();

  for (const rawId of packIds) {
    const id = normalizeTaxonomyPackId(rawId);
    if (!id || seen.has(id)) {
      continue;
    }
    const pack = byId.get(id as BuiltinDomainTaxonomyPackId);
    if (pack) {
      packs.push(pack);
      seen.add(id);
    }
  }

  return packs;
}

export function loadDomainTaxonomyPacksFromRoot(rootInput: string): DomainTaxonomyPack[] {
  const root = path.resolve(rootInput);
  const project = loadProjectConfig(root);
  if (!project) {
    return [];
  }

  return mergeDomainTaxonomyPacks([
    ...resolveDomainTaxonomyPacks(extractTaxonomyPackIds(project)),
    ...extractInlineTaxonomyPacks(project),
    ...loadTaxonomyPacksFromFiles(root, project),
  ]);
}

export function loadDomainTaxonomyPackIdsFromRoot(rootInput: string): string[] {
  return extractTaxonomyPackIds(loadProjectConfig(path.resolve(rootInput)) ?? {});
}

export function summarizeDomainTaxonomyPacks(packs: DomainTaxonomyPack[]): string[] {
  return packs.map((pack) => `${pack.id} (${pack.terms.length} label(s))`);
}

export function getDomainTaxonomyTerms(packs: DomainTaxonomyPack[]): Array<DomainTaxonomyTerm & { packId: string }> {
  return packs.flatMap((pack) =>
    pack.terms.map((term) => ({
      ...term,
      label: normalizeBoundaryLabel(term.label),
      packId: pack.id,
    })));
}

export function getTaxonomyAggregateName(label: string, packs: DomainTaxonomyPack[]): string | undefined {
  const normalizedLabel = normalizeBoundaryLabel(label);
  for (const term of getDomainTaxonomyTerms(packs)) {
    if (term.label === normalizedLabel && term.aggregateName) {
      return term.aggregateName;
    }
  }
  return undefined;
}

export function getTaxonomyScenarioTemplate(label: string, packs: DomainTaxonomyPack[]): DomainTaxonomyScenarioTemplate | undefined {
  const normalizedLabel = normalizeBoundaryLabel(label);
  for (const term of getDomainTaxonomyTerms(packs)) {
    if (term.label === normalizedLabel && term.scenario) {
      return term.scenario;
    }
  }
  return undefined;
}

export function matchDomainTaxonomyServiceMapping(
  value: string,
  packs: DomainTaxonomyPack[],
): (Omit<DomainTaxonomyServiceMapping, "servicePatterns"> & { packId: string }) | undefined {
  const haystack = buildSearchableTaxonomyText(value);
  const matches: Array<Omit<DomainTaxonomyServiceMapping, "servicePatterns"> & { packId: string; score: number }> = [];

  for (const pack of packs) {
    for (const mapping of pack.serviceMappings ?? []) {
      const matched = mapping.servicePatterns.some((pattern) => pattern.test(haystack));
      if (!matched) {
        continue;
      }
      matches.push({
        packId: pack.id,
        boundedContext: normalizeBoundaryLabel(mapping.boundedContext),
        contextLabels: normalizeLabels(mapping.contextLabels),
        aggregateRoots: normalizeStringList(mapping.aggregateRoots),
        score: Math.max(mapping.contextLabels.length * 10 + mapping.aggregateRoots.length * 8, 1),
      });
    }
  }

  return matches
    .sort((left, right) => right.score - left.score || left.boundedContext.localeCompare(right.boundedContext))
    .map(({ score: _score, ...mapping }) => mapping)[0];
}

export function scoreDomainTaxonomyEvidence(
  value: string,
  packs: DomainTaxonomyPack[],
): DomainTaxonomyEvidenceBoost {
  const normalizedValue = buildSearchableTaxonomyText(value);
  const reasons: string[] = [];
  const labels: string[] = [];
  let score = 0;

  for (const pack of packs) {
    for (const term of pack.terms) {
      const label = normalizeBoundaryLabel(term.label);
      const phraseMatched = term.phrases.some((phrase) => normalizedValue.includes(buildSearchableTaxonomyText(phrase)));
      const labelMatched = normalizedValue.includes(label) || normalizedValue.includes(label.replace(/-/g, " "));
      if (phraseMatched || labelMatched) {
        const boost = Math.min(term.weight / 7, 24);
        score += boost;
        labels.push(label);
        reasons.push(`${pack.id} taxonomy ${label} signal`);
      }
    }

    for (const hint of pack.pathHints) {
      if (hint.patterns.some((pattern) => pattern.test(normalizedValue))) {
        const label = normalizeBoundaryLabel(hint.label);
        score += hint.boost;
        labels.push(label);
        reasons.push(`${pack.id} path hint for ${label}`);
      }
    }
  }

  return {
    score: Number(Math.min(score, 48).toFixed(4)),
    reasons: [...new Set(reasons)],
    labels: [...new Set(labels)],
  };
}

function extractTaxonomyPackIds(project: UnknownRecord): string[] {
  return [
    ...getStringArray(project.taxonomy_packs),
    ...getStringArray(project.domain_taxonomy_packs),
    ...getStringArray(asRecord(project.domain_taxonomy)?.packs),
    ...getStringArray(asRecord(project.bootstrap)?.taxonomy_packs),
  ];
}

function extractInlineTaxonomyPacks(project: UnknownRecord): DomainTaxonomyPack[] {
  return [
    ...getPackArray(asRecord(project.domain_taxonomy)?.custom_packs),
    ...getPackArray(asRecord(project.domain_taxonomy)?.customPacks),
    ...getPackArray(project.taxonomy_pack_definitions),
  ];
}

function loadTaxonomyPacksFromFiles(root: string, project: UnknownRecord): DomainTaxonomyPack[] {
  const configuredFiles = [
    ...getStringArray(asRecord(project.domain_taxonomy)?.files),
    ...getStringArray(asRecord(project.domain_taxonomy)?.pack_files),
  ];
  const defaultDirectory = path.join(root, "jiproject", "taxonomies");
  const files = new Set<string>();

  for (const configuredFile of configuredFiles) {
    files.add(path.resolve(root, configuredFile));
  }

  if (fs.existsSync(defaultDirectory)) {
    for (const entry of fs.readdirSync(defaultDirectory, { withFileTypes: true })) {
      if (entry.isFile() && /\.(ya?ml|json)$/i.test(entry.name)) {
        files.add(path.join(defaultDirectory, entry.name));
      }
    }
  }

  const packs: DomainTaxonomyPack[] = [];
  for (const filePath of files) {
    try {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size > 256 * 1024) {
        continue;
      }
      const parsed = /\.(json)$/i.test(filePath)
        ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
        : yaml.load(fs.readFileSync(filePath, "utf-8"));
      packs.push(...normalizeTaxonomyPackDocument(parsed));
    } catch {
      continue;
    }
  }

  return packs;
}

function loadProjectConfig(root: string): UnknownRecord | undefined {
  const projectPath = path.join(root, "jiproject", "project.yaml");
  if (!fs.existsSync(projectPath)) {
    return undefined;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(projectPath, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as UnknownRecord) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTaxonomyPackDocument(value: unknown): DomainTaxonomyPack[] {
  if (Array.isArray(value)) {
    return getPackArray(value);
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return [
    ...getPackArray(record.packs),
    ...getPackArray(record.taxonomy_packs),
    ...getPackArray(record.domain_taxonomy_packs),
    ...getPackArray(record.custom_packs),
    ...normalizeTaxonomyPack(record),
  ];
}

function getPackArray(value: unknown): DomainTaxonomyPack[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => normalizeTaxonomyPack(entry))
    : [];
}

function normalizeTaxonomyPack(value: unknown): DomainTaxonomyPack[] {
  const record = asRecord(value);
  const rawId = getString(record?.id);
  if (!record || !rawId) {
    return [];
  }

  const terms = getRecordArray(record.terms)
    .map(normalizeTaxonomyTerm)
    .filter((term): term is DomainTaxonomyTerm => Boolean(term));
  if (terms.length === 0) {
    return [];
  }

  return [{
    id: normalizeTaxonomyPackId(rawId),
    title: getString(record.title) ?? titleCase(rawId),
    terms,
    pathHints: getRecordArray(record.path_hints ?? record.pathHints).flatMap(normalizePathHint),
    serviceMappings: getRecordArray(record.service_mappings ?? record.serviceMappings).flatMap(normalizeServiceMapping),
  }];
}

function normalizeTaxonomyTerm(record: UnknownRecord): DomainTaxonomyTerm | undefined {
  const label = normalizeBoundaryLabel(getString(record.label) ?? "");
  const phrases = getStringArray(record.phrases);
  if (!label || phrases.length === 0) {
    return undefined;
  }

  return {
    label,
    phrases,
    weight: clampTaxonomyWeight(getNumber(record.weight) ?? 96),
    aggregateName: getString(record.aggregate_name ?? record.aggregateName),
    scenario: normalizeScenarioTemplate(record.scenario ?? record.scenario_template ?? record.scenarioTemplate),
  };
}

function normalizePathHint(record: UnknownRecord): DomainTaxonomyPack["pathHints"] {
  const label = normalizeBoundaryLabel(getString(record.label) ?? "");
  const patterns = getStringArray(record.patterns).map(compileHintPattern);
  if (!label || patterns.length === 0) {
    return [];
  }

  return [{
    label,
    patterns,
    boost: Math.max(1, Math.min(48, getNumber(record.boost) ?? 12)),
  }];
}

function normalizeServiceMapping(record: UnknownRecord): DomainTaxonomyServiceMapping[] {
  const boundedContext = normalizeBoundaryLabel(getString(record.bounded_context ?? record.boundedContext) ?? "");
  const contextLabels = normalizeLabels(getStringArray(record.context_labels ?? record.contextLabels));
  const aggregateRoots = normalizeStringList(getStringArray(record.aggregate_roots ?? record.aggregateRoots));
  const servicePatterns = [
    ...getStringArray(record.service_patterns ?? record.servicePatterns),
    ...getStringArray(record.patterns),
  ].map(compileHintPattern);

  if (!boundedContext || servicePatterns.length === 0) {
    return [];
  }

  return [{
    servicePatterns,
    boundedContext,
    contextLabels: contextLabels.length > 0 ? contextLabels : [boundedContext],
    aggregateRoots,
  }];
}

function normalizeScenarioTemplate(value: unknown): DomainTaxonomyScenarioTemplate | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const scenarioName = getString(record.scenario_name ?? record.scenarioName);
  const given = getString(record.given);
  const when = getString(record.when);
  const then = getString(record.then);
  if (!scenarioName || !given || !when || !then) {
    return undefined;
  }

  return { scenarioName, given, when, then };
}

function mergeDomainTaxonomyPacks(packs: DomainTaxonomyPack[]): DomainTaxonomyPack[] {
  const merged = new Map<string, DomainTaxonomyPack>();

  for (const pack of packs) {
    const id = normalizeTaxonomyPackId(pack.id);
    if (!id) {
      continue;
    }
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, { ...pack, id });
      continue;
    }

    merged.set(id, {
      id,
      title: existing.title,
      terms: mergeTerms([...existing.terms, ...pack.terms]),
      pathHints: [...existing.pathHints, ...pack.pathHints],
      serviceMappings: [...(existing.serviceMappings ?? []), ...(pack.serviceMappings ?? [])],
    });
  }

  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeTerms(terms: DomainTaxonomyTerm[]): DomainTaxonomyTerm[] {
  const merged = new Map<string, DomainTaxonomyTerm>();
  for (const term of terms) {
    const label = normalizeBoundaryLabel(term.label);
    const existing = merged.get(label);
    if (!existing) {
      merged.set(label, {
        ...term,
        label,
        phrases: [...new Set(term.phrases)].sort((left, right) => left.localeCompare(right)),
      });
      continue;
    }
    merged.set(label, {
      label,
      phrases: [...new Set([...existing.phrases, ...term.phrases])].sort((left, right) => left.localeCompare(right)),
      weight: Math.max(existing.weight, term.weight),
      aggregateName: existing.aggregateName ?? term.aggregateName,
      scenario: existing.scenario ?? term.scenario,
    });
  }

  return [...merged.values()].sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label));
}

function compileHintPattern(value: string): RegExp {
  const trimmed = value.trim();
  const regexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/i);
  if (regexMatch) {
    try {
      return new RegExp(regexMatch[1], regexMatch[2].includes("i") ? regexMatch[2] : `${regexMatch[2]}i`);
    } catch {
      return new RegExp(escapeRegExp(trimmed), "i");
    }
  }
  return new RegExp(escapeRegExp(trimmed), "i");
}

function normalizeTaxonomyPackId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function getRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is UnknownRecord => Boolean(asRecord(entry)))
    : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeLabels(values: string[]): string[] {
  return normalizeStringList(values.map((value) => normalizeBoundaryLabel(value)));
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function clampTaxonomyWeight(value: number): number {
  return Math.max(1, Math.min(200, value));
}

function buildSearchableTaxonomyText(value: string): string {
  return normalizeEvidencePath(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
