import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { DistributedTask, WorkerInfo } from "./distributed-scheduler";

export interface RemoteExecutionProtocol {
  assignTask(workerId: string, task: DistributedTask): Promise<void>;
  cancelTask(workerId: string, taskId: string): Promise<void>;
  registerWorker(worker: WorkerInfo): Promise<void>;
  unregisterWorker(workerId: string): Promise<void>;
  sendHeartbeat(workerId: string, load: WorkerInfo["currentLoad"]): Promise<void>;
  reportTaskCompleted(taskId: string, result: unknown): Promise<void>;
  reportTaskFailed(taskId: string, error: string): Promise<void>;
}

export interface WorkerRegistrationPayload extends Omit<WorkerInfo, "status" | "runningTasks" | "lastHeartbeat" | "totalTasksCompleted" | "totalTasksFailed"> {}

export class RemoteExecutionClient implements RemoteExecutionProtocol {
  constructor(private readonly masterUrl: string) {}

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

  async sendHeartbeat(workerId: string, load: WorkerInfo["currentLoad"]): Promise<void> {
    await this.post(`/workers/${workerId}/heartbeat`, load);
  }

  async reportTaskCompleted(taskId: string, result: unknown): Promise<void> {
    await this.post(`/tasks/${taskId}/complete`, { result });
  }

  async reportTaskFailed(taskId: string, error: string): Promise<void> {
    await this.post(`/tasks/${taskId}/fail`, { error });
  }

  private async post(pathname: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.masterUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.status === 204 ? undefined : response.json();
  }

  private async delete(pathname: string): Promise<void> {
    const response = await fetch(`${this.masterUrl}${pathname}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  }
}

type MasterHandlers = {
  onWorkerRegister?: (worker: WorkerRegistrationPayload) => Promise<void> | void;
  onWorkerUnregister?: (workerId: string) => Promise<void> | void;
  onHeartbeat?: (workerId: string, load: WorkerInfo["currentLoad"]) => Promise<void> | void;
  onTaskCompleted?: (taskId: string, result: unknown) => Promise<void> | void;
  onTaskFailed?: (taskId: string, error: string) => Promise<void> | void;
};

export class RemoteExecutionServer {
  private server: http.Server | null = null;
  private readonly handlers: MasterHandlers = {};

  on(event: "worker:register", handler: NonNullable<MasterHandlers["onWorkerRegister"]>): void;
  on(event: "worker:unregister", handler: NonNullable<MasterHandlers["onWorkerUnregister"]>): void;
  on(event: "heartbeat", handler: NonNullable<MasterHandlers["onHeartbeat"]>): void;
  on(event: "task:completed", handler: NonNullable<MasterHandlers["onTaskCompleted"]>): void;
  on(event: "task:failed", handler: NonNullable<MasterHandlers["onTaskFailed"]>): void;
  on(event: string, handler: ((...args: unknown[]) => unknown) | NonNullable<MasterHandlers["onWorkerRegister"]> | NonNullable<MasterHandlers["onWorkerUnregister"]> | NonNullable<MasterHandlers["onHeartbeat"]> | NonNullable<MasterHandlers["onTaskCompleted"]> | NonNullable<MasterHandlers["onTaskFailed"]>): void {
    switch (event) {
      case "worker:register":
        this.handlers.onWorkerRegister = handler as NonNullable<MasterHandlers["onWorkerRegister"]>;
        break;
      case "worker:unregister":
        this.handlers.onWorkerUnregister = handler as NonNullable<MasterHandlers["onWorkerUnregister"]>;
        break;
      case "heartbeat":
        this.handlers.onHeartbeat = handler as NonNullable<MasterHandlers["onHeartbeat"]>;
        break;
      case "task:completed":
        this.handlers.onTaskCompleted = handler as NonNullable<MasterHandlers["onTaskCompleted"]>;
        break;
      case "task:failed":
        this.handlers.onTaskFailed = handler as NonNullable<MasterHandlers["onTaskFailed"]>;
        break;
      default:
        throw new Error(`Unsupported event: ${event}`);
    }
  }

  async start(port: number): Promise<number> {
    if (this.server) {
      throw new Error("Remote execution server already started");
    }

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to determine remote execution server port");
    }

    return address.port;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.server = null;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;

    if (method === "GET" && pathname === "/health") {
      this.writeJson(res, 200, { status: "healthy" });
      return;
    }

    if (method === "POST" && pathname === "/workers") {
      const worker = await this.readJson<WorkerRegistrationPayload>(req);
      await this.handlers.onWorkerRegister?.(worker);
      this.writeJson(res, 201, { success: true });
      return;
    }

    const workerHeartbeat = pathname.match(/^\/workers\/([^/]+)\/heartbeat$/);
    if (method === "POST" && workerHeartbeat) {
      const load = await this.readJson<WorkerInfo["currentLoad"]>(req);
      await this.handlers.onHeartbeat?.(decodeURIComponent(workerHeartbeat[1]), load);
      this.writeJson(res, 200, { success: true });
      return;
    }

    const workerDelete = pathname.match(/^\/workers\/([^/]+)$/);
    if (method === "DELETE" && workerDelete) {
      await this.handlers.onWorkerUnregister?.(decodeURIComponent(workerDelete[1]));
      this.writeJson(res, 200, { success: true });
      return;
    }

    const taskComplete = pathname.match(/^\/tasks\/([^/]+)\/complete$/);
    if (method === "POST" && taskComplete) {
      const payload = await this.readJson<{ result: unknown }>(req);
      await this.handlers.onTaskCompleted?.(decodeURIComponent(taskComplete[1]), payload.result);
      this.writeJson(res, 200, { success: true });
      return;
    }

    const taskFail = pathname.match(/^\/tasks\/([^/]+)\/fail$/);
    if (method === "POST" && taskFail) {
      const payload = await this.readJson<{ error: string }>(req);
      await this.handlers.onTaskFailed?.(decodeURIComponent(taskFail[1]), payload.error);
      this.writeJson(res, 200, { success: true });
      return;
    }

    this.writeJson(res, 404, { error: `Unhandled route: ${method} ${pathname}` });
  }

  private async readJson<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks).toString("utf8");
    return body ? JSON.parse(body) as T : {} as T;
  }

  private writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
  }
}

type WorkerHandlers = {
  onTaskAssigned?: (task: DistributedTask) => Promise<void>;
  onTaskCancelled?: (taskId: string) => Promise<void>;
};

export class WorkerHttpServer {
  private server: http.Server | null = null;
  private readonly handlers: WorkerHandlers = {};

  on(event: "task:assigned", handler: NonNullable<WorkerHandlers["onTaskAssigned"]>): void;
  on(event: "task:cancelled", handler: NonNullable<WorkerHandlers["onTaskCancelled"]>): void;
  on(event: string, handler: ((...args: unknown[]) => unknown) | NonNullable<WorkerHandlers["onTaskAssigned"]> | NonNullable<WorkerHandlers["onTaskCancelled"]>): void {
    switch (event) {
      case "task:assigned":
        this.handlers.onTaskAssigned = handler as NonNullable<WorkerHandlers["onTaskAssigned"]>;
        break;
      case "task:cancelled":
        this.handlers.onTaskCancelled = handler as NonNullable<WorkerHandlers["onTaskCancelled"]>;
        break;
      default:
        throw new Error(`Unsupported event: ${event}`);
    }
  }

  async start(port: number): Promise<number> {
    if (this.server) {
      throw new Error("Worker HTTP server already started");
    }

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to determine worker HTTP server port");
    }

    return address.port;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.server = null;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;

    if (method === "GET" && pathname === "/health") {
      this.writeJson(res, 200, { status: "healthy" });
      return;
    }

    const taskAssign = pathname.match(/^\/workers\/([^/]+)\/tasks$/);
    if (method === "POST" && taskAssign) {
      const task = await this.readJson<DistributedTask>(req);
      await this.handlers.onTaskAssigned?.(task);
      this.writeJson(res, 201, { success: true });
      return;
    }

    const taskCancel = pathname.match(/^\/workers\/([^/]+)\/tasks\/([^/]+)$/);
    if (method === "DELETE" && taskCancel) {
      await this.handlers.onTaskCancelled?.(decodeURIComponent(taskCancel[2]));
      this.writeJson(res, 200, { success: true });
      return;
    }

    this.writeJson(res, 404, { error: `Unhandled route: ${method} ${pathname}` });
  }

  private async readJson<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks).toString("utf8");
    return body ? JSON.parse(body) as T : {} as T;
  }

  private writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
  }
}

export class TaskSerializer {
  static serialize(task: DistributedTask): string {
    return JSON.stringify(task);
  }

  static deserialize(data: string): DistributedTask {
    return JSON.parse(data) as DistributedTask;
  }
}

export class RemoteExecutor {
  constructor(private readonly client: RemoteExecutionClient) {}

  async executeRemote(workerId: string, task: DistributedTask): Promise<void> {
    await this.client.assignTask(workerId, task);
  }

  async cancelRemote(workerId: string, taskId: string): Promise<void> {
    await this.client.cancelTask(workerId, taskId);
  }

  getClient(): RemoteExecutionClient {
    return this.client;
  }
}
