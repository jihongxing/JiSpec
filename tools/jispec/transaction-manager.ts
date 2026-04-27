/**
 * Transaction Manager
 *
 * Provides explicit transaction semantics for stage execution.
 * Ensures atomicity between snapshot creation, result application, and state updates.
 */

import path from "node:path";
import yaml from "js-yaml";
import { FilesystemStorage } from "./filesystem-storage.js";
import { buildSnapshotName } from "./portable-naming.js";
import type { StageExecutionResult } from "./stage-execution-result.js";

export type TransactionState = "pending" | "prepared" | "committed" | "rolled_back";

export interface AppliedWrite {
  path: string;
  type: "file" | "directory";
}

export interface TransactionRecord {
  transactionId: string;
  sliceId: string;
  stageId: string;
  state: TransactionState;
  createdAt: string;
  snapshotId?: string;
  preparedSliceState?: any;
  appliedWrites: AppliedWrite[];
  appliedGateUpdates: Array<{ gate: string; oldValue: boolean; newValue: boolean }>;
  appliedTraceLinks: string[];
  committedAt?: string;
  rolledBackAt?: string;
}

export interface TransactionOptions {
  sliceId: string;
  stageId: string;
  targetLifecycleState?: any;
}

export class TransactionManager {
  private storage: FilesystemStorage;
  private root: string;
  private activeTransactions: Map<string, TransactionRecord> = new Map();

  constructor(root: string) {
    this.root = root;
    this.storage = new FilesystemStorage(root);
  }

  async begin(options: TransactionOptions): Promise<StageTransaction> {
    const transactionId = `tx:${options.sliceId}:${options.stageId}:${Date.now()}`;

    const record: TransactionRecord = {
      transactionId,
      sliceId: options.sliceId,
      stageId: options.stageId,
      state: "pending",
      createdAt: new Date().toISOString(),
      appliedWrites: [],
      appliedGateUpdates: [],
      appliedTraceLinks: [],
    };

    this.activeTransactions.set(transactionId, record);
    return new StageTransaction(this, record, options.targetLifecycleState);
  }

  getTransaction(transactionId: string): TransactionRecord | undefined {
    return this.activeTransactions.get(transactionId);
  }

  updateTransaction(transactionId: string, updates: Partial<TransactionRecord>): void {
    const record = this.activeTransactions.get(transactionId);
    if (!record) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    Object.assign(record, updates);
  }

  completeTransaction(transactionId: string): void {
    this.activeTransactions.delete(transactionId);
  }

  getStorage(): FilesystemStorage {
    return this.storage;
  }

  getRoot(): string {
    return this.root;
  }
}

export class StageTransaction {
  private manager: TransactionManager;
  private record: TransactionRecord;
  private targetLifecycleState?: any;

  constructor(manager: TransactionManager, record: TransactionRecord, targetLifecycleState?: any) {
    this.manager = manager;
    this.record = record;
    this.targetLifecycleState = targetLifecycleState;
  }

  get id(): string {
    return this.record.transactionId;
  }

  get state(): TransactionState {
    return this.record.state;
  }

  async prepareSnapshot(): Promise<void> {
    if (this.record.state !== "pending") {
      throw new Error(`Cannot prepare snapshot in state: ${this.record.state}`);
    }

    const storage = this.manager.getStorage();
    const root = this.manager.getRoot();
    const sliceFile = this.findSliceFile(this.record.sliceId);
    const sliceContent = storage.readFileSync(sliceFile, "utf-8") as string;
    const currentSliceState = yaml.load(sliceContent);

    // Snapshot captures CURRENT stable state, not target state
    const snapshotState = currentSliceState;

    const snapshotDir = path.join(root, ".jispec", "snapshots", this.record.sliceId);
    storage.mkdirSync(snapshotDir);

    const timestamp = new Date();
    const snapshotFileName = buildSnapshotName(this.record.sliceId, this.record.stageId, timestamp);
    const snapshotPath = path.join(snapshotDir, snapshotFileName);

    const sliceDir = path.dirname(sliceFile);
    const existingFiles = this.getSliceFiles(sliceDir);
    const filesBackup = new Map<string, string>();

    for (const file of existingFiles) {
      const content = storage.readFileSync(file, "utf-8") as string;
      filesBackup.set(file, content);
    }

    const snapshotData = {
      sliceId: this.record.sliceId,
      stageId: this.record.stageId,
      timestamp: timestamp.toISOString(),
      sliceState: snapshotState,
      filesBackup: Array.from(filesBackup.entries()),
      existingFiles,
    };

    storage.writeFileSync(snapshotPath, JSON.stringify(snapshotData, null, 2), "utf-8");

    this.manager.updateTransaction(this.record.transactionId, {
      state: "prepared",
      snapshotId: snapshotFileName,
      preparedSliceState: undefined, // Don't store target state
    });

    console.log(`[Transaction] Snapshot prepared: ${snapshotFileName}`);
  }

  async apply(executionResult: StageExecutionResult): Promise<void> {
    if (this.record.state !== "prepared") {
      throw new Error(`Cannot apply in state: ${this.record.state}`);
    }

    const storage = this.manager.getStorage();
    const root = this.manager.getRoot();
    const appliedWrites: AppliedWrite[] = [];

    // 1. Apply writes (legacy format)
    if (executionResult.writes) {
      for (const write of executionResult.writes) {
        const filePath = path.join(root, write.path);
        appliedWrites.push({ path: filePath, type: "file" });
        const encoding = (write.encoding || "utf-8") as BufferEncoding;
        await storage.writeFile(filePath, write.content, encoding);
        console.log(`[Transaction] Written: ${write.path}`);
      }
    }

    // 1b. Apply writeOperations (new format with directory support)
    if (executionResult.writeOperations && executionResult.writeOperations.length > 0) {
      for (const op of executionResult.writeOperations) {
        if (op.type === "directory") {
          const dirPath = path.join(root, op.path);
          storage.mkdirSync(dirPath);
          appliedWrites.push({ path: dirPath, type: "directory" });
          console.log(`[Transaction] Created directory: ${op.path}`);
        } else if (op.type === "file") {
          const filePath = path.join(root, op.path);
          const encoding = (op.encoding || "utf-8") as BufferEncoding;
          await storage.writeFile(filePath, op.content || "", encoding);
          appliedWrites.push({ path: filePath, type: "file" });
          console.log(`[Transaction] Written: ${op.path}`);
        }
      }
    }

    const appliedGateUpdates: Array<{ gate: string; oldValue: boolean; newValue: boolean }> = [];

    // 2. Apply gate updates
    if (executionResult.gateUpdates && executionResult.gateUpdates.length > 0) {
      const sliceFile = this.findSliceFile(this.record.sliceId);
      const sliceContent = storage.readFileSync(sliceFile, "utf-8") as string;
      const sliceData = yaml.load(sliceContent) as any;

      for (const gateUpdate of executionResult.gateUpdates) {
        const oldValue = sliceData.gates?.[gateUpdate.gate] || false;
        appliedGateUpdates.push({
          gate: gateUpdate.gate,
          oldValue,
          newValue: gateUpdate.passed,
        });

        if (!sliceData.gates) {
          sliceData.gates = {};
        }
        sliceData.gates[gateUpdate.gate] = gateUpdate.passed;
        console.log(`[Transaction] Gate update: ${gateUpdate.gate} = ${gateUpdate.passed}`);
      }

      storage.writeFileSync(sliceFile, yaml.dump(sliceData), "utf-8");
    }

    const appliedTraceLinks: string[] = [];

    // 3. Apply trace links
    if (executionResult.traceLinks && executionResult.traceLinks.length > 0) {
      const traceFile = path.join(root, "contexts", this.getContextId(this.record.sliceId), "slices", this.record.sliceId, "trace.yaml");
      appliedTraceLinks.push(traceFile);

      let traceData: any = { links: [] };
      if (storage.existsSync(traceFile)) {
        const traceContent = storage.readFileSync(traceFile, "utf-8") as string;
        traceData = yaml.load(traceContent) || { links: [] };
      }

      if (!traceData.links) {
        traceData.links = [];
      }
      traceData.links.push(...executionResult.traceLinks);

      await storage.writeFile(traceFile, yaml.dump(traceData));
      console.log(`[Transaction] Applied ${executionResult.traceLinks.length} trace link(s)`);
    }

    // 4. Record evidence (if any)
    if (executionResult.evidence && executionResult.evidence.length > 0) {
      const evidenceDir = path.join(root, ".jispec", "evidence", this.record.sliceId);
      storage.mkdirSync(evidenceDir);

      for (const ev of executionResult.evidence) {
        const evidenceFile = path.join(evidenceDir, `${this.record.stageId}-${Date.now()}.json`);
        await storage.writeFile(evidenceFile, JSON.stringify(ev, null, 2));
        appliedWrites.push({ path: evidenceFile, type: "file" });
      }
      console.log(`[Transaction] Recorded ${executionResult.evidence.length} evidence item(s)`);
    }

    this.manager.updateTransaction(this.record.transactionId, {
      appliedWrites,
      appliedGateUpdates,
      appliedTraceLinks,
    });

    console.log(`[Transaction] Applied ${appliedWrites.length} writes, ${appliedGateUpdates.length} gate updates, ${appliedTraceLinks.length} trace links`);
  }

  async commit(): Promise<void> {
    if (this.record.state !== "prepared") {
      throw new Error(`Cannot commit in state: ${this.record.state}`);
    }

    const storage = this.manager.getStorage();
    const sliceFile = this.findSliceFile(this.record.sliceId);

    // Read current slice state (already updated by tx.apply with gates)
    const sliceContent = storage.readFileSync(sliceFile, "utf-8") as string;
    const currentSliceState = yaml.load(sliceContent) as any;

    // Update lifecycle state to target (using correct nested structure)
    if (this.targetLifecycleState && this.targetLifecycleState.lifecycle) {
      if (!currentSliceState.lifecycle) {
        currentSliceState.lifecycle = {};
      }
      currentSliceState.lifecycle.state = this.targetLifecycleState.lifecycle.state;
      currentSliceState.lifecycle.updated_at = this.targetLifecycleState.lifecycle.updated_at;

      storage.writeFileSync(sliceFile, yaml.dump(currentSliceState), "utf-8");
      console.log(`[Transaction] Lifecycle advanced to: ${this.targetLifecycleState.lifecycle.state}`);
    }

    this.manager.updateTransaction(this.record.transactionId, {
      state: "committed",
      committedAt: new Date().toISOString(),
    });

    console.log(`[Transaction] Committed: ${this.record.transactionId}`);
    this.manager.completeTransaction(this.record.transactionId);
  }

  async rollback(): Promise<void> {
    if (this.record.state === "committed") {
      throw new Error("Cannot rollback committed transaction");
    }

    const storage = this.manager.getStorage();
    const root = this.manager.getRoot();

    // 1. Clean up all applied writes (files, directories, evidence)
    if (this.record.appliedWrites && this.record.appliedWrites.length > 0) {
      console.log(`[Transaction] Cleaning up ${this.record.appliedWrites.length} applied writes...`);

      // Sort by path length descending to remove files before their parent directories
      const sortedWrites = [...this.record.appliedWrites].sort((a, b) => b.path.length - a.path.length);

      for (const write of sortedWrites) {
        if (storage.existsSync(write.path)) {
          if (write.type === "directory") {
            // Remove directory recursively
            try {
              await storage.removeDirectory(write.path);
              console.log(`[Transaction] Removed directory: ${write.path}`);
            } catch (err) {
              console.log(`[Transaction] Could not remove directory: ${write.path}`);
            }
          } else {
            // Remove file
            await storage.removeFile(write.path);
            console.log(`[Transaction] Removed file: ${write.path}`);
          }
        }
      }
    }

    // 1b. Clean up evidence directory if it exists
    const evidenceDir = path.join(root, ".jispec", "evidence", this.record.sliceId);
    if (storage.existsSync(evidenceDir)) {
      const evidenceFiles = storage.listFilesSync(evidenceDir);
      for (const file of evidenceFiles) {
        if (file.startsWith(this.record.stageId)) {
          const evidenceFile = path.join(evidenceDir, file);
          await storage.removeFile(evidenceFile);
          console.log(`[Transaction] Removed evidence: ${evidenceFile}`);
        }
      }
    }

    // 2. Restore from snapshot
    if (this.record.snapshotId) {
      const snapshotPath = path.join(root, ".jispec", "snapshots", this.record.sliceId, this.record.snapshotId);

      if (storage.existsSync(snapshotPath)) {
        const snapshotContent = storage.readFileSync(snapshotPath, "utf-8") as string;
        const snapshotData = JSON.parse(snapshotContent);

        // Restore slice.yaml to snapshot state
        const sliceFile = this.findSliceFile(this.record.sliceId);
        storage.writeFileSync(sliceFile, yaml.dump(snapshotData.sliceState), "utf-8");
        console.log(`[Transaction] Restored slice.yaml to snapshot state`);

        // Restore backed up files
        const filesBackup = new Map<string, string>(snapshotData.filesBackup);
        for (const [file, content] of filesBackup) {
          storage.writeFileSync(file, content, "utf-8");
        }
        console.log(`[Transaction] Restored ${filesBackup.size} backed up files`);

        // Remove files that didn't exist in snapshot
        const sliceDir = path.dirname(sliceFile);
        const currentFiles = this.getSliceFiles(sliceDir);
        for (const file of currentFiles) {
          if (!snapshotData.existingFiles.includes(file)) {
            await storage.removeFile(file);
            console.log(`[Transaction] Removed new file: ${file}`);
          }
        }

        console.log(`[Transaction] Rolled back to snapshot: ${this.record.snapshotId}`);
      }
    }

    // 3. Revert gate updates
    if (this.record.appliedGateUpdates && this.record.appliedGateUpdates.length > 0) {
      const sliceFile = this.findSliceFile(this.record.sliceId);
      const sliceContent = storage.readFileSync(sliceFile, "utf-8") as string;
      const sliceData = yaml.load(sliceContent) as any;

      for (const gateUpdate of this.record.appliedGateUpdates) {
        if (sliceData.gates) {
          sliceData.gates[gateUpdate.gate] = gateUpdate.oldValue;
          console.log(`[Transaction] Reverted gate: ${gateUpdate.gate} = ${gateUpdate.oldValue}`);
        }
      }

      storage.writeFileSync(sliceFile, yaml.dump(sliceData), "utf-8");
    }

    this.manager.updateTransaction(this.record.transactionId, {
      state: "rolled_back",
      rolledBackAt: new Date().toISOString(),
    });

    this.manager.completeTransaction(this.record.transactionId);
  }

  private findSliceFile(sliceId: string): string {
    const storage = this.manager.getStorage();
    const root = this.manager.getRoot();
    const contextId = this.getContextId(sliceId);
    const sliceFile = path.join(root, "contexts", contextId, "slices", sliceId, "slice.yaml");

    if (!storage.existsSync(sliceFile)) {
      throw new Error(`Slice file not found: ${sliceFile}`);
    }

    return sliceFile;
  }

  private getContextId(sliceId: string): string {
    return sliceId.split("-")[0];
  }

  private getSliceFiles(sliceDir: string): string[] {
    const storage = this.manager.getStorage();
    const files: string[] = [];

    const collectFiles = (dir: string) => {
      const entries = storage.listFilesSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);

        if (storage.existsSync(fullPath)) {
          try {
            const stats = storage.statSync(fullPath);
            if (stats.isDirectory()) {
              collectFiles(fullPath);
            } else {
              files.push(fullPath);
            }
          } catch {
            files.push(fullPath);
          }
        }
      }
    };

    collectFiles(sliceDir);
    return files;
  }
}
