import * as http from "http";
import * as express from "express";
import { DistributedTask, WorkerInfo } from "./distributed-scheduler";

/**
 * 远程执行协议
 */
export interface RemoteExecutionProtocol {
  // Master -> Worker
  assignTask(workerId: string, task: DistributedTask): Promise<void>;
  cancelTask(workerId: string, taskId: string): Promise<void>;

  // Worker -> Master
  registerWorker(worker: WorkerInfo): Promise<void>;
  unregisterWorker(workerId: string): Promise<void>;
  sendHeartbeat(workerId: string, load: WorkerInfo["currentLoad"]): Promise<void>;
  reportTaskCompleted(taskId: string, result: any): Promise<void>;
  reportTaskFailed(taskId: string, error: string): Promise<void>;
}

/**
 * HTTP 远程执行客户端
 */
export class RemoteExecutionClient implements RemoteExecutionProtocol {
  private masterUrl: string;

  constructor(masterUrl: string) {
    this.masterUrl = masterUrl;
  }

  async assignTask(workerId: string, task: DistributedTask): Promise<void> {
    await this.post(`/workers/${workerId}/tasks`, task);
  }

  async cancelTask(workerId: string, taskId: string): Promise<void> {
    await this.delete(`/workers/${workerId}/tasks/${taskId}`);
  }

  async registerWorker(worker: WorkerInfo): Promise<void> {
    await this.post("/workers", worker);
  }

  async unregisterWorker(workerId: string): Promise<void> {
    await this.delete(`/workers/${workerId}`);
  }

  async sendHeartbeat(
    workerId: string,
    load: WorkerInfo["currentLoad"]
  ): Promise<void> {
    await this.post(`/workers/${workerId}/heartbeat`, load);
  }

  async reportTaskCompleted(taskId: string, result: any): Promise<void> {
    await this.post(`/tasks/${taskId}/complete`, { result });
  }

  async reportTaskFailed(taskId: string, error: string): Promise<void> {
    await this.post(`/tasks/${taskId}/fail`, { error });
  }

  private async post(path: string, data: any): Promise<any> {
    const url = `${this.masterUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  private async delete(path: string): Promise<void> {
    const url = `${this.masterUrl}${path}`;
    const response = await fetch(url, { method: "DELETE" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  }
}

/**
 * HTTP 远程执行服务器
 */
export class RemoteExecutionServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private handlers: {
    onWorkerRegister?: (worker: WorkerInfo) => void;
    onWorkerUnregister?: (workerId: string) => void;
    onHeartbeat?: (workerId: string, load: WorkerInfo["currentLoad"]) => void;
    onTaskCompleted?: (taskId: string, result: any) => void;
    onTaskFailed?: (taskId: string, error: string) => void;
  } = {};

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Worker 注册
    this.app.post("/workers", (req, res) => {
      try {
        const worker: WorkerInfo = req.body;
        this.handlers.onWorkerRegister?.(worker);
        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Worker 注销
    this.app.delete("/workers/:workerId", (req, res) => {
      try {
        const { workerId } = req.params;
        this.handlers.onWorkerUnregister?.(workerId);
        res.status(200).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 心跳
    this.app.post("/workers/:workerId/heartbeat", (req, res) => {
      try {
        const { workerId } = req.params;
        const load = req.body;
        this.handlers.onHeartbeat?.(workerId, load);
        res.status(200).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 任务完成
    this.app.post("/tasks/:taskId/complete", (req, res) => {
      try {
        const { taskId } = req.params;
        const { result } = req.body;
        this.handlers.onTaskCompleted?.(taskId, result);
        res.status(200).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 任务失败
    this.app.post("/tasks/:taskId/fail", (req, res) => {
      try {
        const { taskId } = req.params;
        const { error } = req.body;
        this.handlers.onTaskFailed?.(taskId, error);
        res.status(200).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 健康检查
    this.app.get("/health", (req, res) => {
      res.status(200).json({ status: "healthy" });
    });
  }

  on(event: "worker:register", handler: (worker: WorkerInfo) => void): void;
  on(event: "worker:unregister", handler: (workerId: string) => void): void;
  on(event: "heartbeat", handler: (workerId: string, load: WorkerInfo["currentLoad"]) => void): void;
  on(event: "task:completed", handler: (taskId: string, result: any) => void): void;
  on(event: "task:failed", handler: (taskId: string, error: string) => void): void;
  on(event: string, handler: (...args: any[]) => void): void {
    switch (event) {
      case "worker:register":
        this.handlers.onWorkerRegister = handler;
        break;
      case "worker:unregister":
        this.handlers.onWorkerUnregister = handler;
        break;
      case "heartbeat":
        this.handlers.onHeartbeat = handler;
        break;
      case "task:completed":
        this.handlers.onTaskCompleted = handler;
        break;
      case "task:failed":
        this.handlers.onTaskFailed = handler;
        break;
    }
  }

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Remote execution server listening on port ${port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }
}

/**
 * Worker HTTP 服务器
 */
export class WorkerHttpServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private handlers: {
    onTaskAssigned?: (task: DistributedTask) => Promise<void>;
    onTaskCancelled?: (taskId: string) => Promise<void>;
  } = {};

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.post("/workers/:workerId/tasks", async (req, res) => {
      try {
        const task: DistributedTask = req.body;
        await this.handlers.onTaskAssigned?.(task);
        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    this.app.delete("/workers/:workerId/tasks/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;
        await this.handlers.onTaskCancelled?.(taskId);
        res.status(200).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    this.app.get("/health", (req, res) => {
      res.status(200).json({ status: "healthy" });
    });
  }

  on(event: "task:assigned", handler: (task: DistributedTask) => Promise<void>): void;
  on(event: "task:cancelled", handler: (taskId: string) => Promise<void>): void;
  on(event: string, handler: (...args: any[]) => void): void {
    switch (event) {
      case "task:assigned":
        this.handlers.onTaskAssigned = handler;
        break;
      case "task:cancelled":
        this.handlers.onTaskCancelled = handler;
        break;
    }
  }

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Worker HTTP server listening on port ${port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }
}

/**
 * 任务序列化器
 */
export class TaskSerializer {
  static serialize(task: DistributedTask): string {
    return JSON.stringify(task, (key, value) => {
      if (value instanceof Date) {
        return { __type: "Date", value: value.toISOString() };
      }
      return value;
    });
  }

  static deserialize(data: string): DistributedTask {
    return JSON.parse(data, (key, value) => {
      if (value && value.__type === "Date") {
        return new Date(value.value);
      }
      return value;
    });
  }
}

/**
 * 远程执行引擎
 */
export class RemoteExecutor {
  private client: RemoteExecutionClient;

  constructor(masterUrl: string) {
    this.client = new RemoteExecutionClient(masterUrl);
  }

  async executeRemote(task: DistributedTask): Promise<any> {
    const serialized = TaskSerializer.serialize(task);
    return { success: true };
  }

  getClient(): RemoteExecutionClient {
    return this.client;
  }
}
