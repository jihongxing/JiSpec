import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  PresenceManager,
  type ActivityEvent,
  type AwarenessStats,
  type CursorPosition,
  type PresenceSnapshot,
  type Selection,
} from "./presence-manager";
import { PermissionManager, type ResourceLock } from "./permission-manager";
import { AdvancedConflictResolver, type ConflictResolution, type OperationConflict } from "./advanced-conflict-resolver";
import { NotificationService } from "./notification-service";

export type CollaborationOperationType = "insert" | "delete" | "replace";
export type CollaborationMessageType = "join" | "leave" | "sync" | "operation" | "cursor" | "selection" | "comment" | "notification";

export interface CollaborationOperation {
  id: string;
  userId: string;
  type: CollaborationOperationType;
  position: number;
  length?: number;
  content?: string;
  baseVersion: number;
  timestamp: string;
}

export interface CollaborationComment {
  id: string;
  userId: string;
  documentId: string;
  content: string;
  anchor?: {
    start: number;
    end: number;
  };
  createdAt: string;
}

export interface CollaborationDocumentState {
  id: string;
  initialContent: string;
  content: string;
  version: number;
  operations: CollaborationOperation[];
  comments: CollaborationComment[];
  lastModifiedAt: string;
}

export interface CollaborationSession {
  sessionId: string;
  userId: string;
  userName: string;
  documentId: string;
  connectedAt: string;
  lastActivityAt: string;
}

export interface DocumentReplayFrame {
  version: number;
  content: string;
  operation?: CollaborationOperation;
  timestamp: string;
}

export interface CollaborationAwarenessStats extends AwarenessStats {
  totalSessions: number;
  documentVersion?: number;
  operationTimelineLength: number;
  commentCount: number;
  conflictCount: number;
}

export interface CollaborationLockInfo {
  resourceId: string;
  userId: string;
  lockedAt: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

export interface CollaborationMessage {
  type: CollaborationMessageType;
  sessionId: string;
  userId: string;
  documentId: string;
  timestamp: string;
  operation?: CollaborationOperation;
  cursor?: CursorPosition;
  selection?: Selection;
  state?: CollaborationDocumentState;
  comment?: CollaborationComment;
  payload?: Record<string, unknown>;
}

export interface JoinSessionInput {
  userId: string;
  userName: string;
  documentId: string;
  initialContent?: string;
}

export interface CollaborationServerOptions {
  presenceManager?: PresenceManager;
  permissionManager?: PermissionManager;
  conflictResolver?: AdvancedConflictResolver;
  notificationService?: NotificationService;
}

export class CollaborationServer extends EventEmitter {
  private readonly presenceManager: PresenceManager;
  private readonly ownsPresenceManager: boolean;
  private readonly permissionManager?: PermissionManager;
  private readonly conflictResolver: AdvancedConflictResolver;
  private readonly notificationService?: NotificationService;
  private readonly documents = new Map<string, CollaborationDocumentState>();
  private readonly sessions = new Map<string, CollaborationSession>();
  private readonly sessionListeners = new Map<string, Set<(message: CollaborationMessage) => void>>();

  constructor(options: CollaborationServerOptions = {}) {
    super();
    this.ownsPresenceManager = options.presenceManager === undefined;
    this.presenceManager = options.presenceManager ?? new PresenceManager();
    this.permissionManager = options.permissionManager;
    this.conflictResolver = options.conflictResolver ?? new AdvancedConflictResolver();
    this.notificationService = options.notificationService;
  }

  joinSession(input: JoinSessionInput, onMessage?: (message: CollaborationMessage) => void): {
    session: CollaborationSession;
    state: CollaborationDocumentState;
  } {
    this.assertCanRead(input.userId, input.documentId);

    const sessionId = randomUUID();
    const timestamp = new Date().toISOString();
    const session: CollaborationSession = {
      sessionId,
      userId: input.userId,
      userName: input.userName,
      documentId: input.documentId,
      connectedAt: timestamp,
      lastActivityAt: timestamp,
    };

    this.sessions.set(sessionId, session);
    if (onMessage) {
      const sessionListeners = this.sessionListeners.get(sessionId) ?? new Set<(message: CollaborationMessage) => void>();
      sessionListeners.add(onMessage);
      this.sessionListeners.set(sessionId, sessionListeners);
    }

    const state = this.ensureDocument(input.documentId, input.initialContent ?? "");
    this.presenceManager.userOnline(input.userId, input.userName, { documentId: input.documentId });
    this.presenceManager.recordView(input.userId, input.documentId);

    const syncMessage: CollaborationMessage = {
      type: "sync",
      sessionId,
      userId: input.userId,
      documentId: input.documentId,
      timestamp,
      state: this.cloneDocumentState(state),
    };

    this.presenceManager.recordSync(input.userId, input.documentId, {
      sessionId,
      version: state.version,
    });
    this.dispatchToSession(sessionId, syncMessage);
    this.broadcast(
      input.documentId,
      {
        type: "join",
        sessionId,
        userId: input.userId,
        documentId: input.documentId,
        timestamp,
      },
      sessionId
    );

    this.emit("session:joined", session);
    return { session, state: this.cloneDocumentState(state) };
  }

  leaveSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);
    this.sessionListeners.delete(sessionId);
    this.presenceManager.userOffline(session.userId);

    this.broadcast(session.documentId, {
      type: "leave",
      sessionId,
      userId: session.userId,
      documentId: session.documentId,
      timestamp: new Date().toISOString(),
    });

    this.emit("session:left", session);
  }

  applyOperation(sessionId: string, operation: CollaborationOperation): CollaborationDocumentState {
    const session = this.requireSession(sessionId);
    this.assertCanWrite(session.userId, session.documentId);

    const document = this.ensureDocument(session.documentId, "");
    const conflict = this.detectConflict(document, operation);
    const transformedOperation = this.transformOperation(document, operation);

    document.content = this.applyTextOperation(document.content, transformedOperation);
    document.operations.push(transformedOperation);
    document.version += 1;
    document.lastModifiedAt = new Date().toISOString();

    session.lastActivityAt = document.lastModifiedAt;
    this.presenceManager.recordEdit(session.userId, session.documentId, transformedOperation);

    const message: CollaborationMessage = {
      type: "operation",
      sessionId,
      userId: session.userId,
      documentId: session.documentId,
      timestamp: document.lastModifiedAt,
      operation: transformedOperation,
      state: this.cloneDocumentState(document),
    };

    this.broadcast(session.documentId, message, sessionId);
    this.emit("operation", transformedOperation, this.cloneDocumentState(document));
    if (conflict) {
      this.presenceManager.recordConflict(session.userId, session.documentId, {
        conflictId: conflict.id,
        type: conflict.type,
        resolution: conflict.resolution?.strategy,
      });
      void this.notifyConflictParticipants(session.documentId, conflict, session.userId);
      this.emit("conflict", conflict, conflict.resolution);
    }

    return this.cloneDocumentState(document);
  }

  updateCursor(sessionId: string, cursor: CursorPosition): void {
    const session = this.requireSession(sessionId);
    session.lastActivityAt = new Date().toISOString();
    this.presenceManager.updateCursor(session.userId, cursor);

    const message: CollaborationMessage = {
      type: "cursor",
      sessionId,
      userId: session.userId,
      documentId: session.documentId,
      timestamp: session.lastActivityAt,
      cursor,
    };

    this.broadcast(session.documentId, message, sessionId);
    this.emit("cursor", session.userId, cursor);
  }

  updateSelection(sessionId: string, selection: Selection): void {
    const session = this.requireSession(sessionId);
    session.lastActivityAt = new Date().toISOString();
    this.presenceManager.updateSelection(session.userId, selection);

    const message: CollaborationMessage = {
      type: "selection",
      sessionId,
      userId: session.userId,
      documentId: session.documentId,
      timestamp: session.lastActivityAt,
      selection,
    };

    this.broadcast(session.documentId, message, sessionId);
    this.emit("selection", session.userId, selection);
  }

  addComment(sessionId: string, content: string, anchor?: { start: number; end: number }): CollaborationComment {
    const session = this.requireSession(sessionId);
    this.assertCanWrite(session.userId, session.documentId);

    const document = this.ensureDocument(session.documentId, "");
    const comment: CollaborationComment = {
      id: randomUUID(),
      userId: session.userId,
      documentId: session.documentId,
      content,
      anchor,
      createdAt: new Date().toISOString(),
    };

    document.comments.push(comment);
    document.lastModifiedAt = comment.createdAt;
    session.lastActivityAt = comment.createdAt;

    const message: CollaborationMessage = {
      type: "comment",
      sessionId,
      userId: session.userId,
      documentId: session.documentId,
      timestamp: comment.createdAt,
      comment,
      state: this.cloneDocumentState(document),
    };

    this.presenceManager.recordComment(session.userId, session.documentId, {
      commentId: comment.id,
      anchor,
      contentLength: content.length,
    });
    void this.notifyCommentParticipants(session.documentId, session.userId, content);
    this.broadcast(session.documentId, message, sessionId);
    this.emit("comment", comment);
    return comment;
  }

  lockDocument(
    sessionId: string,
    duration?: number,
    metadata?: Record<string, any>
  ): CollaborationLockInfo {
    const session = this.requireSession(sessionId);
    const permissionManager = this.requirePermissionManager();
    const lock = permissionManager.lockResource(
      session.documentId,
      "document",
      session.userId,
      duration,
      metadata
    );

    const info = this.toLockInfo(lock);
    void this.notifyDocumentLockParticipants(session.documentId, session.userId, "locked");
    this.broadcastLockNotification(session.documentId, session.sessionId, session.userId, "locked", info);
    this.emit("document:locked", info, session);
    return info;
  }

  unlockDocument(sessionId: string): void {
    const session = this.requireSession(sessionId);
    const permissionManager = this.requirePermissionManager();
    permissionManager.unlockResource(session.documentId, session.userId);

    void this.notifyDocumentLockParticipants(session.documentId, session.userId, "unlocked");
    this.broadcastLockNotification(session.documentId, session.sessionId, session.userId, "unlocked");
    this.emit("document:unlocked", session.documentId, session.userId, session);
  }

  renewDocumentLock(sessionId: string, duration?: number): CollaborationLockInfo {
    const session = this.requireSession(sessionId);
    const permissionManager = this.requirePermissionManager();
    permissionManager.renewLock(session.documentId, session.userId, duration);

    const lock = permissionManager.getLock(session.documentId);
    if (!lock) {
      throw new Error(`Document ${session.documentId} is not locked`);
    }

    const info = this.toLockInfo(lock);
    void this.notifyDocumentLockParticipants(session.documentId, session.userId, "renewed");
    this.broadcastLockNotification(session.documentId, session.sessionId, session.userId, "renewed", info);
    this.emit("document:lock-renewed", info, session);
    return info;
  }

  forceUnlockDocument(sessionId: string): void {
    const session = this.requireSession(sessionId);
    const permissionManager = this.requirePermissionManager();
    permissionManager.forceUnlock(session.documentId, session.userId);

    void this.notifyDocumentLockParticipants(session.documentId, session.userId, "force-unlocked");
    this.broadcastLockNotification(session.documentId, session.sessionId, session.userId, "force-unlocked");
    this.emit("document:force-unlocked", session.documentId, session.userId, session);
  }

  syncDocument(sessionId: string): CollaborationDocumentState {
    const session = this.requireSession(sessionId);
    session.lastActivityAt = new Date().toISOString();
    const state = this.cloneDocumentState(this.ensureDocument(session.documentId, ""));
    this.presenceManager.recordSync(session.userId, session.documentId, {
      sessionId,
      version: state.version,
    });
    return state;
  }

  subscribe(sessionId: string, listener: (message: CollaborationMessage) => void): () => void {
    const listeners = this.sessionListeners.get(sessionId) ?? new Set<(message: CollaborationMessage) => void>();
    listeners.add(listener);
    this.sessionListeners.set(sessionId, listeners);

    return () => {
      const current = this.sessionListeners.get(sessionId);
      current?.delete(listener);
      if (current && current.size === 0) {
        this.sessionListeners.delete(sessionId);
      }
    };
  }

  getDocument(documentId: string): CollaborationDocumentState | undefined {
    const document = this.documents.get(documentId);
    return document ? this.cloneDocumentState(document) : undefined;
  }

  getDocumentLock(documentId: string): CollaborationLockInfo | undefined {
    if (!this.permissionManager) {
      return undefined;
    }

    const lock = this.permissionManager.getLock(documentId);
    return lock ? this.toLockInfo(lock) : undefined;
  }

  getSessions(documentId?: string): CollaborationSession[] {
    const sessions = Array.from(this.sessions.values());
    return sessions
      .filter((session) => !documentId || session.documentId === documentId)
      .map((session) => ({ ...session }));
  }

  getPresenceSnapshot(documentId?: string): PresenceSnapshot {
    return this.presenceManager.getPresenceSnapshot(documentId);
  }

  getActivityFeed(documentId?: string, limit?: number): ActivityEvent[] {
    return this.presenceManager.getActivityFeed({ documentId, limit });
  }

  getOperationTimeline(documentId: string, limit?: number): ActivityEvent[] {
    return this.presenceManager.getDocumentOperationTimeline(documentId, limit);
  }

  replayDocumentOperations(documentId: string): DocumentReplayFrame[] {
    const document = this.documents.get(documentId);
    if (!document) {
      return [];
    }

    let content = document.initialContent;
    const frames: DocumentReplayFrame[] = [
      {
        version: 0,
        content,
        timestamp: document.operations[0]?.timestamp ?? document.lastModifiedAt,
      },
    ];

    for (let index = 0; index < document.operations.length; index += 1) {
      const operation = document.operations[index];
      content = this.applyTextOperation(content, operation);
      frames.push({
        version: index + 1,
        content,
        operation: { ...operation },
        timestamp: operation.timestamp,
      });
    }

    return frames;
  }

  getAwarenessStats(documentId?: string): CollaborationAwarenessStats {
    const awareness = this.presenceManager.getAwarenessStats(documentId);
    const document = documentId ? this.documents.get(documentId) : undefined;
    const conflictStats = this.conflictResolver.getStats();

    return {
      ...awareness,
      totalSessions: this.getSessions(documentId).length,
      documentVersion: document?.version,
      operationTimelineLength: documentId
        ? this.presenceManager.getDocumentOperationTimeline(documentId).length
        : Array.from(this.documents.values()).reduce((sum, current) => sum + current.operations.length, 0),
      commentCount: documentId
        ? (this.documents.get(documentId)?.comments.length ?? 0)
        : Array.from(this.documents.values()).reduce((sum, current) => sum + current.comments.length, 0),
      conflictCount: documentId
        ? this.presenceManager.getActivityFeed({ documentId, types: ["conflict"] }).length
        : conflictStats.totalConflicts,
    };
  }

  getStats(): {
    totalSessions: number;
    totalDocuments: number;
    totalOperations: number;
    totalComments: number;
    totalConflicts: number;
    totalPresenceUsers: number;
    totalLocks: number;
  } {
    const documents = Array.from(this.documents.values());
    const conflictStats = this.conflictResolver.getStats();
    const awareness = this.presenceManager.getAwarenessStats();
    const permissionStats = this.permissionManager?.getStats();

    return {
      totalSessions: this.sessions.size,
      totalDocuments: documents.length,
      totalOperations: documents.reduce((sum, document) => sum + document.operations.length, 0),
      totalComments: documents.reduce((sum, document) => sum + document.comments.length, 0),
      totalConflicts: conflictStats.totalConflicts,
      totalPresenceUsers: awareness.totalUsers,
      totalLocks: permissionStats?.activeLocks ?? 0,
    };
  }

  getConflictResolver(): AdvancedConflictResolver {
    return this.conflictResolver;
  }

  close(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.leaveSession(sessionId);
    }
    if (this.ownsPresenceManager) {
      this.presenceManager.destroy();
    }
    this.removeAllListeners();
  }

  private ensureDocument(documentId: string, initialContent: string): CollaborationDocumentState {
    const existing = this.documents.get(documentId);
    if (existing) {
      return existing;
    }

    const document: CollaborationDocumentState = {
      id: documentId,
      initialContent,
      content: initialContent,
      version: 0,
      operations: [],
      comments: [],
      lastModifiedAt: new Date().toISOString(),
    };

    this.documents.set(documentId, document);
    return document;
  }

  private requireSession(sessionId: string): CollaborationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  private transformOperation(
    document: CollaborationDocumentState,
    operation: CollaborationOperation
  ): CollaborationOperation {
    let position = operation.position;

    if (operation.baseVersion < document.version) {
      const laterOperations = document.operations.slice(operation.baseVersion);
      for (const applied of laterOperations) {
        if (applied.type === "insert" && applied.position <= position) {
          position += applied.content?.length ?? 0;
        }
        if (applied.type === "delete" && applied.position < position) {
          position = Math.max(applied.position, position - (applied.length ?? 0));
        }
        if (applied.type === "replace" && applied.position < position) {
          const delta = (applied.content?.length ?? 0) - (applied.length ?? 0);
          position = Math.max(applied.position, position + delta);
        }
      }
    }

    return {
      ...operation,
      position,
      baseVersion: document.version,
    };
  }

  private detectConflict(
    document: CollaborationDocumentState,
    incomingOperation: CollaborationOperation
  ): OperationConflict | null {
    if (incomingOperation.baseVersion >= document.version || document.operations.length === 0) {
      return null;
    }

    const conflictingOperations = document.operations.slice(incomingOperation.baseVersion);

    for (const existingOperation of conflictingOperations) {
      const conflict = this.conflictResolver.detectConflict(existingOperation, incomingOperation);
      if (!conflict) {
        continue;
      }

      let resolution: ConflictResolution;
      try {
        resolution = this.conflictResolver.resolveConflict(conflict.id);
      } catch {
        resolution = this.conflictResolver.resolveConflict(conflict.id, "last_write_wins");
      }

      conflict.resolution = resolution;
      conflict.resolved = true;
      return conflict;
    }

    return null;
  }

  private applyTextOperation(content: string, operation: CollaborationOperation): string {
    switch (operation.type) {
      case "insert":
        return content.slice(0, operation.position) + (operation.content ?? "") + content.slice(operation.position);

      case "delete":
        return content.slice(0, operation.position) + content.slice(operation.position + (operation.length ?? 0));

      case "replace":
        return (
          content.slice(0, operation.position) +
          (operation.content ?? "") +
          content.slice(operation.position + (operation.length ?? 0))
        );

      default:
        return content;
    }
  }

  private dispatchToSession(sessionId: string, message: CollaborationMessage): void {
    const listeners = this.sessionListeners.get(sessionId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(this.cloneMessage(message));
    }
  }

  private broadcast(documentId: string, message: CollaborationMessage, excludeSessionId?: string): void {
    for (const session of this.sessions.values()) {
      if (session.documentId !== documentId || session.sessionId === excludeSessionId) {
        continue;
      }
      this.dispatchToSession(session.sessionId, message);
    }
  }

  private cloneDocumentState(document: CollaborationDocumentState): CollaborationDocumentState {
    return {
      ...document,
      operations: document.operations.map((operation) => ({ ...operation })),
      comments: document.comments.map((comment) => ({
        ...comment,
        anchor: comment.anchor ? { ...comment.anchor } : undefined,
      })),
    };
  }

  private cloneMessage(message: CollaborationMessage): CollaborationMessage {
    return {
      ...message,
      operation: message.operation ? { ...message.operation } : undefined,
      cursor: message.cursor ? { ...message.cursor } : undefined,
      selection: message.selection
        ? {
            ...message.selection,
            start: { ...message.selection.start },
            end: { ...message.selection.end },
          }
        : undefined,
      state: message.state ? this.cloneDocumentState(message.state) : undefined,
      comment: message.comment
        ? {
            ...message.comment,
            anchor: message.comment.anchor ? { ...message.comment.anchor } : undefined,
          }
        : undefined,
      payload: message.payload ? { ...message.payload } : undefined,
    };
  }

  private toLockInfo(lock: ResourceLock): CollaborationLockInfo {
    return {
      resourceId: lock.resourceId,
      userId: lock.userId,
      lockedAt: lock.lockedAt.toISOString(),
      expiresAt: lock.expiresAt?.toISOString(),
      metadata: lock.metadata ? { ...lock.metadata } : undefined,
    };
  }

  private broadcastLockNotification(
    documentId: string,
    sessionId: string,
    userId: string,
    action: "locked" | "unlocked" | "renewed" | "force-unlocked",
    lock?: CollaborationLockInfo
  ): void {
    const message: CollaborationMessage = {
      type: "notification",
      sessionId,
      userId,
      documentId,
      timestamp: new Date().toISOString(),
      payload: {
        category: "lock",
        action,
        lock,
      },
    };

    this.broadcast(documentId, message);
  }

  private assertCanRead(userId: string, documentId: string): void {
    if (!this.permissionManager) {
      return;
    }
    const check = this.permissionManager.checkPermission(userId, documentId, "read");
    if (!check.allowed) {
      throw new Error(`User ${userId} cannot read document ${documentId}: ${check.reason}`);
    }
  }

  private assertCanWrite(userId: string, documentId: string): void {
    if (!this.permissionManager) {
      return;
    }
    const check = this.permissionManager.checkPermission(userId, documentId, "write");
    if (!check.allowed) {
      throw new Error(`User ${userId} cannot write document ${documentId}: ${check.reason}`);
    }

    if (!this.permissionManager.canAccessLockedResource(documentId, userId)) {
      const lock = this.permissionManager.getLock(documentId);
      throw new Error(
        `User ${userId} cannot write locked document ${documentId}: locked by ${lock?.userId ?? "unknown"}`
      );
    }
  }

  private requirePermissionManager(): PermissionManager {
    if (!this.permissionManager) {
      throw new Error("Document locking requires a PermissionManager");
    }

    return this.permissionManager;
  }

  private async notifyCommentParticipants(
    documentId: string,
    authorUserId: string,
    content: string
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const recipients = this.getNotificationRecipients(documentId, authorUserId);
    const authorName = this.getUserName(authorUserId);
    const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;

    await Promise.all(
      recipients.map((userId) =>
        this.notificationService!.notifyComment(userId, documentId, authorName, preview)
      )
    );

    const mentions = this.notificationService.extractMentions(content)
      .filter((userId) => userId !== authorUserId);

    await Promise.all(
      mentions.map((mentionedUserId) =>
        this.notificationService!.notifyMention(
          mentionedUserId,
          authorName,
          documentId,
          "document",
          preview
        )
      )
    );
  }

  private async notifyConflictParticipants(
    documentId: string,
    conflict: OperationConflict,
    actorUserId: string
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const recipients = new Set<string>(this.getNotificationRecipients(documentId, actorUserId));
    for (const operation of conflict.operations) {
      if (operation.userId !== actorUserId) {
        recipients.add(operation.userId);
      }
    }

    await Promise.all(
      Array.from(recipients).map((userId) =>
        this.notificationService!.notifyConflict(userId, conflict.id, documentId, conflict.type)
      )
    );
  }

  private async notifyDocumentLockParticipants(
    documentId: string,
    actorUserId: string,
    action: "locked" | "unlocked" | "renewed" | "force-unlocked"
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const actorName = this.getUserName(actorUserId);
    const recipients = this.getNotificationRecipients(documentId, actorUserId);

    await Promise.all(
      recipients.map((userId) =>
        this.notificationService!.notifyLock(userId, documentId, actorName, action)
      )
    );
  }

  private getNotificationRecipients(documentId: string, actorUserId: string): string[] {
    return Array.from(
      new Set(
        this.getSessions(documentId)
          .map((session) => session.userId)
          .filter((userId) => userId !== actorUserId)
      )
    );
  }

  private getUserName(userId: string): string {
    const session = Array.from(this.sessions.values()).find((candidate) => candidate.userId === userId);
    return session?.userName ?? userId;
  }
}

export class CollaborationClient extends EventEmitter {
  private sessionId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly server: CollaborationServer,
    private readonly userId: string,
    private readonly userName: string,
    private readonly documentId: string
  ) {
    super();
  }

  connect(initialContent = ""): CollaborationDocumentState {
    const { session, state } = this.server.joinSession({
      userId: this.userId,
      userName: this.userName,
      documentId: this.documentId,
      initialContent,
    });

    this.sessionId = session.sessionId;
    this.unsubscribe = this.server.subscribe(session.sessionId, (message) => this.handleMessage(message));
    this.emit("connected", session);
    return state;
  }

  disconnect(): void {
    if (!this.sessionId) {
      return;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.server.leaveSession(this.sessionId);
    this.emit("disconnected", this.sessionId);
    this.sessionId = null;
  }

  sendOperation(input: Omit<CollaborationOperation, "id" | "userId" | "timestamp">): CollaborationDocumentState {
    const sessionId = this.requireSessionId();
    return this.server.applyOperation(sessionId, {
      id: randomUUID(),
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ...input,
    });
  }

  sendCursor(cursor: CursorPosition): void {
    this.server.updateCursor(this.requireSessionId(), cursor);
  }

  sendSelection(selection: Selection): void {
    this.server.updateSelection(this.requireSessionId(), selection);
  }

  addComment(content: string, anchor?: { start: number; end: number }): CollaborationComment {
    return this.server.addComment(this.requireSessionId(), content, anchor);
  }

  lockDocument(duration?: number, metadata?: Record<string, any>): CollaborationLockInfo {
    return this.server.lockDocument(this.requireSessionId(), duration, metadata);
  }

  unlockDocument(): void {
    this.server.unlockDocument(this.requireSessionId());
  }

  renewDocumentLock(duration?: number): CollaborationLockInfo {
    return this.server.renewDocumentLock(this.requireSessionId(), duration);
  }

  forceUnlockDocument(): void {
    this.server.forceUnlockDocument(this.requireSessionId());
  }

  getDocumentLock(): CollaborationLockInfo | undefined {
    return this.server.getDocumentLock(this.documentId);
  }

  requestSync(): CollaborationDocumentState {
    const state = this.server.syncDocument(this.requireSessionId());
    this.emit("sync", state);
    return state;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private handleMessage(message: CollaborationMessage): void {
    this.emit(message.type, message);
  }

  private requireSessionId(): string {
    if (!this.sessionId) {
      throw new Error("Client is not connected");
    }
    return this.sessionId;
  }
}
