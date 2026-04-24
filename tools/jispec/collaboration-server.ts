import * as WebSocket from "ws";
import { EventEmitter } from "events";
import * as http from "http";

/**
 * CRDT 操作类型
 */
export type CRDTOperationType = "insert" | "delete" | "update" | "cursor" | "selection";

/**
 * CRDT 操作
 */
export interface CRDTOperation {
  id: string;
  type: CRDTOperationType;
  userId: string;
  timestamp: Date;
  position?: number;
  length?: number;
  content?: any;
  metadata?: Record<string, any>;
}

/**
 * 文档状态
 */
export interface DocumentState {
  id: string;
  content: any;
  version: number;
  operations: CRDTOperation[];
  lastModified: Date;
}

/**
 * 用户会话
 */
export interface UserSession {
  id: string;
  userId: string;
  username: string;
  documentId: string;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * 协作消息
 */
export interface CollaborationMessage {
  type: "operation" | "cursor" | "selection" | "join" | "leave" | "sync";
  sessionId: string;
  userId: string;
  documentId: string;
  operation?: CRDTOperation;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  state?: DocumentState;
  timestamp: Date;
}

/**
 * 实时协作服务器
 */
export class CollaborationServer extends EventEmitter {
  private wss: WebSocket.Server;
  private sessions: Map<string, UserSession> = new Map();
  private documents: Map<string, DocumentState> = new Map();
  private connections: Map<string, WebSocket> = new Map();

  constructor(server: http.Server) {
    super();
    this.wss = new WebSocket.Server({ server });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
      const sessionId = this.generateSessionId();

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const message: CollaborationMessage = JSON.parse(data.toString());
          this.handleMessage(sessionId, ws, message);
        } catch (error) {
          ws.send(JSON.stringify({ type: "error", error: String(error) }));
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(sessionId);
      });

      ws.on("error", (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
        this.handleDisconnect(sessionId);
      });

      this.connections.set(sessionId, ws);
    });
  }

  private handleMessage(sessionId: string, ws: WebSocket, message: CollaborationMessage): void {
    switch (message.type) {
      case "join":
        this.handleJoin(sessionId, ws, message);
        break;

      case "operation":
        this.handleOperation(sessionId, message);
        break;

      case "cursor":
        this.handleCursor(sessionId, message);
        break;

      case "selection":
        this.handleSelection(sessionId, message);
        break;

      case "sync":
        this.handleSync(sessionId, ws, message);
        break;

      default:
        ws.send(JSON.stringify({ type: "error", error: "Unknown message type" }));
    }
  }

  private handleJoin(sessionId: string, ws: WebSocket, message: CollaborationMessage): void {
    const session: UserSession = {
      id: sessionId,
      userId: message.userId,
      username: message.userId,
      documentId: message.documentId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);

    if (!this.documents.has(message.documentId)) {
      this.documents.set(message.documentId, {
        id: message.documentId,
        content: {},
        version: 0,
        operations: [],
        lastModified: new Date(),
      });
    }

    const state = this.documents.get(message.documentId)!;
    ws.send(JSON.stringify({
      type: "sync",
      sessionId,
      state,
      timestamp: new Date(),
    }));

    this.broadcast(message.documentId, {
      type: "join",
      sessionId,
      userId: message.userId,
      documentId: message.documentId,
      timestamp: new Date(),
    }, sessionId);

    this.emit("user:join", session);
  }

  private handleOperation(sessionId: string, message: CollaborationMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const document = this.documents.get(message.documentId);
    if (!document || !message.operation) {
      return;
    }

    document.operations.push(message.operation);
    document.version++;
    document.lastModified = new Date();

    this.applyOperation(document, message.operation);

    session.lastActivity = new Date();

    this.broadcast(message.documentId, message, sessionId);

    this.emit("operation", message.operation);
  }

  private applyOperation(document: DocumentState, operation: CRDTOperation): void {
    switch (operation.type) {
      case "insert":
        if (operation.position !== undefined && operation.content !== undefined) {
          // 简化的插入逻辑
          document.content = operation.content;
        }
        break;

      case "delete":
        if (operation.position !== undefined && operation.length !== undefined) {
          // 简化的删除逻辑
          document.content = operation.content;
        }
        break;

      case "update":
        if (operation.content !== undefined) {
          document.content = operation.content;
        }
        break;
    }
  }

  private handleCursor(sessionId: string, message: CollaborationMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session || !message.cursor) {
      return;
    }

    session.cursor = message.cursor;
    session.lastActivity = new Date();

    this.broadcast(message.documentId, message, sessionId);
  }

  private handleSelection(sessionId: string, message: CollaborationMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session || !message.selection) {
      return;
    }

    session.selection = message.selection;
    session.lastActivity = new Date();

    this.broadcast(message.documentId, message, sessionId);
  }

  private handleSync(sessionId: string, ws: WebSocket, message: CollaborationMessage): void {
    const document = this.documents.get(message.documentId);
    if (!document) {
      return;
    }

    ws.send(JSON.stringify({
      type: "sync",
      sessionId,
      state: document,
      timestamp: new Date(),
    }));
  }

  private handleDisconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.broadcast(session.documentId, {
        type: "leave",
        sessionId,
        userId: session.userId,
        documentId: session.documentId,
        timestamp: new Date(),
      });

      this.sessions.delete(sessionId);
      this.emit("user:leave", session);
    }

    this.connections.delete(sessionId);
  }

  private broadcast(documentId: string, message: CollaborationMessage, excludeSessionId?: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.documentId === documentId && sessionId !== excludeSessionId) {
        const ws = this.connections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      }
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getActiveSessions(documentId?: string): UserSession[] {
    if (documentId) {
      return Array.from(this.sessions.values()).filter(s => s.documentId === documentId);
    }
    return Array.from(this.sessions.values());
  }

  getDocument(documentId: string): DocumentState | undefined {
    return this.documents.get(documentId);
  }

  getStats(): {
    totalSessions: number;
    totalDocuments: number;
    totalOperations: number;
    byDocument: Record<string, { sessions: number; operations: number }>;
  } {
    const byDocument: Record<string, { sessions: number; operations: number }> = {};

    for (const document of this.documents.values()) {
      byDocument[document.id] = {
        sessions: this.getActiveSessions(document.id).length,
        operations: document.operations.length,
      };
    }

    return {
      totalSessions: this.sessions.size,
      totalDocuments: this.documents.size,
      totalOperations: Array.from(this.documents.values()).reduce(
        (sum, doc) => sum + doc.operations.length,
        0
      ),
      byDocument,
    };
  }

  close(): void {
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.wss.close();
  }
}

/**
 * 协作客户端
 */
export class CollaborationClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor(
    private serverUrl: string,
    private userId: string,
    private documentId: string
  ) {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on("open", () => {
        this.reconnectAttempts = 0;
        this.sendJoin();
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message: CollaborationMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emit("error", error);
        }
      });

      this.ws.on("close", () => {
        this.emit("disconnected");
        this.attemptReconnect();
      });

      this.ws.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });
    });
  }

  private sendJoin(): void {
    this.send({
      type: "join",
      sessionId: "",
      userId: this.userId,
      documentId: this.documentId,
      timestamp: new Date(),
    });
  }

  private handleMessage(message: CollaborationMessage): void {
    switch (message.type) {
      case "sync":
        this.sessionId = message.sessionId;
        this.emit("sync", message.state);
        break;

      case "operation":
        this.emit("operation", message.operation);
        break;

      case "cursor":
        this.emit("cursor", message.userId, message.cursor);
        break;

      case "selection":
        this.emit("selection", message.userId, message.selection);
        break;

      case "join":
        this.emit("user:join", message.userId);
        break;

      case "leave":
        this.emit("user:leave", message.userId);
        break;
    }
  }

  sendOperation(operation: CRDTOperation): void {
    this.send({
      type: "operation",
      sessionId: this.sessionId!,
      userId: this.userId,
      documentId: this.documentId,
      operation,
      timestamp: new Date(),
    });
  }

  sendCursor(cursor: { line: number; column: number }): void {
    this.send({
      type: "cursor",
      sessionId: this.sessionId!,
      userId: this.userId,
      documentId: this.documentId,
      cursor,
      timestamp: new Date(),
    });
  }

  sendSelection(selection: { start: number; end: number }): void {
    this.send({
      type: "selection",
      sessionId: this.sessionId!,
      userId: this.userId,
      documentId: this.documentId,
      selection,
      timestamp: new Date(),
    });
  }

  requestSync(): void {
    this.send({
      type: "sync",
      sessionId: this.sessionId!,
      userId: this.userId,
      documentId: this.documentId,
      timestamp: new Date(),
    });
  }

  private send(message: CollaborationMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnect:failed");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.emit("reconnecting", this.reconnectAttempts);
      this.connect().catch(() => {
        // 重连失败，会触发 close 事件，继续尝试
      });
    }, delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
