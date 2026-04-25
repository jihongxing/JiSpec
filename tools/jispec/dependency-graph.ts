import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { findSliceFile, isLifecycleState, type LifecycleState, LIFECYCLE_ORDER } from "./validator";

export interface SliceDependency {
  slice_id: string;
  kind: string;
  required_state: LifecycleState;
  optional?: boolean;
}

export interface DependencyNode {
  sliceId: string;
  state: LifecycleState;
  dependencies: SliceDependency[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: string;
  required_state: LifecycleState;
  optional: boolean;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  reverseEdges: Map<string, DependencyEdge[]>;
}

export class DependencyGraphBuilder {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  build(): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const edges: DependencyEdge[] = [];
    const reverseEdges = new Map<string, DependencyEdge[]>();

    // Find all slices
    const sliceFiles = this.findAllSliceFiles();

    // Build nodes
    for (const sliceFile of sliceFiles) {
      const sliceData = this.loadSliceData(sliceFile);
      if (!sliceData) continue;

      const sliceId = sliceData.id as string;
      const lifecycle = sliceData.lifecycle as { state: string };
      const state = lifecycle?.state as LifecycleState;
      const dependencies = (sliceData.dependencies as SliceDependency[]) || [];

      nodes.set(sliceId, {
        sliceId,
        state,
        dependencies,
      });
    }

    // Build edges
    for (const node of nodes.values()) {
      for (const dep of node.dependencies) {
        const edge: DependencyEdge = {
          from: node.sliceId,
          to: dep.slice_id,
          kind: dep.kind,
          required_state: dep.required_state,
          optional: dep.optional ?? false,
        };
        edges.push(edge);

        // Build reverse edges
        if (!reverseEdges.has(dep.slice_id)) {
          reverseEdges.set(dep.slice_id, []);
        }
        reverseEdges.get(dep.slice_id)!.push(edge);
      }
    }

    return { nodes, edges, reverseEdges };
  }

  topologicalOrder(graph: DependencyGraph): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];
    const visiting = new Set<string>();

    const visit = (sliceId: string): void => {
      if (visited.has(sliceId)) return;
      if (visiting.has(sliceId)) {
        throw new Error(`Dependency cycle detected involving slice: ${sliceId}`);
      }

      visiting.add(sliceId);

      const node = graph.nodes.get(sliceId);
      if (node) {
        for (const dep of node.dependencies) {
          if (!dep.optional) {
            visit(dep.slice_id);
          }
        }
      }

      visiting.delete(sliceId);
      visited.add(sliceId);
      stack.push(sliceId);
    };

    for (const sliceId of graph.nodes.keys()) {
      visit(sliceId);
    }

    return stack;
  }

  findCycles(graph: DependencyGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const visit = (sliceId: string): void => {
      if (visited.has(sliceId)) return;
      if (visiting.has(sliceId)) {
        const cycleStart = path.indexOf(sliceId);
        cycles.push([...path.slice(cycleStart), sliceId]);
        return;
      }

      visiting.add(sliceId);
      path.push(sliceId);

      const node = graph.nodes.get(sliceId);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep.slice_id);
        }
      }

      path.pop();
      visiting.delete(sliceId);
      visited.add(sliceId);
    };

    for (const sliceId of graph.nodes.keys()) {
      visit(sliceId);
    }

    return cycles;
  }

  getUpstream(graph: DependencyGraph, sliceId: string): string[] {
    const upstream = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = graph.nodes.get(id);
      if (node) {
        for (const dep of node.dependencies) {
          upstream.add(dep.slice_id);
          visit(dep.slice_id);
        }
      }
    };

    visit(sliceId);
    return Array.from(upstream);
  }

  getDownstream(graph: DependencyGraph, sliceId: string): string[] {
    const downstream = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const edges = graph.reverseEdges.get(id) || [];
      for (const edge of edges) {
        downstream.add(edge.from);
        visit(edge.from);
      }
    };

    visit(sliceId);
    return Array.from(downstream);
  }

  private findAllSliceFiles(): string[] {
    const contextsRoot = path.join(this.root, "contexts");
    const results: string[] = [];
    if (!fs.existsSync(contextsRoot)) {
      return results;
    }

    for (const contextEntry of fs.readdirSync(contextsRoot, { withFileTypes: true })) {
      if (!contextEntry.isDirectory()) continue;

      const slicesRoot = path.join(contextsRoot, contextEntry.name, "slices");
      if (!fs.existsSync(slicesRoot)) continue;

      for (const sliceEntry of fs.readdirSync(slicesRoot, { withFileTypes: true })) {
        if (!sliceEntry.isDirectory()) continue;

        const sliceFile = path.join(slicesRoot, sliceEntry.name, "slice.yaml");
        if (fs.existsSync(sliceFile)) {
          results.push(sliceFile);
        }
      }
    }

    return results;
  }

  private loadSliceData(sliceFile: string): Record<string, unknown> | null {
    try {
      const content = fs.readFileSync(sliceFile, "utf-8");
      const data = yaml.load(content);
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        return data as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
}
