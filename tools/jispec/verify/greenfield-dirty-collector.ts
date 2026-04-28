import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { DirtyGraph } from "../greenfield/contract-graph";
import type { VerifyIssue } from "./verdict";

interface AdoptionRecord {
  status?: string;
}

interface DirtyRequiredUpdateRecord {
  node_id?: string;
  kind?: string;
  path?: string;
  reason?: string;
  status?: string;
}

interface DirtyGraphRecord {
  change_id?: string;
  seeds?: string[];
  required_updates?: DirtyRequiredUpdateRecord[];
  dirty_asset_paths?: string[];
  warnings?: string[];
}

const DELTAS_DIR = ".spec/deltas";
const DIRTY_GRAPH_FILE = "dirty-graph.json";
const ADOPTION_RECORD_FILE = "adoption-record.yaml";

export function collectGreenfieldDirtyIssues(rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const dirtyGraphs = findDirtyGraphs(root);
  const issues: VerifyIssue[] = [];

  for (const dirtyGraphPath of dirtyGraphs) {
    const relativeDirtyGraphPath = normalizePath(path.relative(root, dirtyGraphPath));
    const dirtyGraph = loadDirtyGraph(dirtyGraphPath);
    if (!dirtyGraph) {
      issues.push({
        kind: "semantic",
        severity: "blocking",
        code: "GREENFIELD_DIRTY_GRAPH_INVALID",
        path: relativeDirtyGraphPath,
        message: "Dirty propagation graph is present but could not be parsed.",
      });
      continue;
    }

    if (!isActiveDirtyGraph(dirtyGraphPath)) {
      continue;
    }

    for (const update of unresolvedRequiredUpdates(dirtyGraph)) {
      issues.push({
        kind: "semantic",
        severity: "blocking",
        code: "GREENFIELD_DIRTY_CHAIN_UNRECONCILED",
        path: update.path ?? relativeDirtyGraphPath,
        message: `Dirty node ${update.node_id ?? "unknown"} from ${dirtyGraph.change_id ?? "unknown change"} still requires contract synchronization.`,
        details: {
          change_id: dirtyGraph.change_id,
          dirty_graph_path: relativeDirtyGraphPath,
          node_id: update.node_id,
          node_kind: update.kind,
          required_update_status: update.status ?? "pending",
          reason: update.reason,
          seeds: dirtyGraph.seeds ?? [],
          dirty_asset_paths: dirtyGraph.dirty_asset_paths ?? [],
        },
      });
    }

    for (const warning of dirtyGraph.warnings ?? []) {
      issues.push({
        kind: "semantic",
        severity: "advisory",
        code: "GREENFIELD_DIRTY_GRAPH_WARNING",
        path: relativeDirtyGraphPath,
        message: warning,
        details: {
          change_id: dirtyGraph.change_id,
        },
      });
    }
  }

  return issues.sort((left, right) =>
    `${left.severity}|${left.code}|${left.path ?? ""}|${left.message}`.localeCompare(
      `${right.severity}|${right.code}|${right.path ?? ""}|${right.message}`,
    ),
  );
}

export function readGreenfieldDirtyCounts(rootInput: string): {
  unresolvedRequiredUpdateCount: number;
  dirtyGraphWarningCount: number;
} {
  const issues = collectGreenfieldDirtyIssues(rootInput);
  return {
    unresolvedRequiredUpdateCount: issues.filter((issue) => issue.code === "GREENFIELD_DIRTY_CHAIN_UNRECONCILED").length,
    dirtyGraphWarningCount: issues.filter((issue) => issue.code === "GREENFIELD_DIRTY_GRAPH_WARNING").length,
  };
}

function findDirtyGraphs(root: string): string[] {
  const deltasRoot = path.join(root, DELTAS_DIR);
  if (!fs.existsSync(deltasRoot)) {
    return [];
  }

  return fs.readdirSync(deltasRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(deltasRoot, entry.name, DIRTY_GRAPH_FILE))
    .filter((dirtyGraphPath) => fs.existsSync(dirtyGraphPath))
    .sort((left, right) => left.localeCompare(right));
}

function loadDirtyGraph(dirtyGraphPath: string): DirtyGraphRecord | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(dirtyGraphPath, "utf-8")) as DirtyGraph;
    return parsed as DirtyGraphRecord;
  } catch {
    return undefined;
  }
}

function isActiveDirtyGraph(dirtyGraphPath: string): boolean {
  const adoptionRecordPath = path.join(path.dirname(dirtyGraphPath), ADOPTION_RECORD_FILE);
  if (!fs.existsSync(adoptionRecordPath)) {
    return true;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(adoptionRecordPath, "utf-8"));
    const record = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as AdoptionRecord
      : {};
    return record.status !== "adopted";
  } catch {
    return true;
  }
}

function unresolvedRequiredUpdates(dirtyGraph: DirtyGraphRecord): DirtyRequiredUpdateRecord[] {
  return (dirtyGraph.required_updates ?? [])
    .filter((update) => (update.status ?? "pending") === "pending")
    .sort((left, right) => `${left.node_id ?? ""}|${left.path ?? ""}`.localeCompare(`${right.node_id ?? ""}|${right.path ?? ""}`));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
