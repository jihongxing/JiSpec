import { EventEmitter } from "events";

/**
 * 权限类型
 */
export type Permission = "read" | "write" | "delete" | "admin" | "lock" | "unlock";

/**
 * 角色
 */
export type Role = "owner" | "admin" | "editor" | "viewer" | "guest";

/**
 * 资源类型
 */
export type ResourceType = "document" | "slice" | "stage" | "project";

/**
 * 角色权限映射
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ["read", "write", "delete", "admin", "lock", "unlock"],
  admin: ["read", "write", "delete", "admin", "lock", "unlock"],
  editor: ["read", "write", "lock", "unlock"],
  viewer: ["read"],
  guest: ["read"],
};

/**
 * 用户权限
 */
export interface UserPermission {
  userId: string;
  resourceId: string;
  resourceType: ResourceType;
  role: Role;
  permissions: Permission[];
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

/**
 * 资源锁
 */
export interface ResourceLock {
  id: string;
  resourceId: string;
  resourceType: ResourceType;
  userId: string;
  lockedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole?: Role;
}

/**
 * 权限管理器
 */
export class PermissionManager extends EventEmitter {
  private permissions: Map<string, UserPermission> = new Map();
  private locks: Map<string, ResourceLock> = new Map();
  private lockTimeout: number = 300000; // 5 分钟默认锁超时

  constructor(lockTimeout: number = 300000) {
    super();
    this.lockTimeout = lockTimeout;
  }

  /**
   * 授予权限
   */
  grantPermission(
    userId: string,
    resourceId: string,
    resourceType: ResourceType,
    role: Role,
    grantedBy: string,
    expiresAt?: Date
  ): UserPermission {
    const key = this.getPermissionKey(userId, resourceId);

    const permission: UserPermission = {
      userId,
      resourceId,
      resourceType,
      role,
      permissions: ROLE_PERMISSIONS[role],
      grantedBy,
      grantedAt: new Date(),
      expiresAt,
    };

    this.permissions.set(key, permission);
    this.emit("permission:granted", permission);

    return permission;
  }

  /**
   * 撤销权限
   */
  revokePermission(userId: string, resourceId: string): void {
    const key = this.getPermissionKey(userId, resourceId);
    const permission = this.permissions.get(key);

    if (permission) {
      this.permissions.delete(key);
      this.emit("permission:revoked", permission);
    }
  }

  /**
   * 更新角色
   */
  updateRole(userId: string, resourceId: string, newRole: Role): void {
    const key = this.getPermissionKey(userId, resourceId);
    const permission = this.permissions.get(key);

    if (!permission) {
      throw new Error(`Permission not found for user ${userId} on resource ${resourceId}`);
    }

    const oldRole = permission.role;
    permission.role = newRole;
    permission.permissions = ROLE_PERMISSIONS[newRole];

    this.emit("role:updated", permission, oldRole);
  }

  /**
   * 检查权限
   */
  checkPermission(
    userId: string,
    resourceId: string,
    requiredPermission: Permission
  ): PermissionCheckResult {
    const key = this.getPermissionKey(userId, resourceId);
    const permission = this.permissions.get(key);

    if (!permission) {
      return {
        allowed: false,
        reason: "No permission found",
      };
    }

    // 检查是否过期
    if (permission.expiresAt && permission.expiresAt < new Date()) {
      return {
        allowed: false,
        reason: "Permission expired",
      };
    }

    // 检查是否有所需权限
    if (!permission.permissions.includes(requiredPermission)) {
      return {
        allowed: false,
        reason: `Missing permission: ${requiredPermission}`,
        requiredRole: this.getMinimumRole(requiredPermission),
      };
    }

    return { allowed: true };
  }

  /**
   * 获取最小所需角色
   */
  private getMinimumRole(permission: Permission): Role {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (permissions.includes(permission)) {
        return role as Role;
      }
    }
    return "owner";
  }

  /**
   * 获取用户权限
   */
  getUserPermission(userId: string, resourceId: string): UserPermission | undefined {
    const key = this.getPermissionKey(userId, resourceId);
    return this.permissions.get(key);
  }

  /**
   * 获取用户所有权限
   */
  getUserPermissions(userId: string): UserPermission[] {
    return Array.from(this.permissions.values()).filter(p => p.userId === userId);
  }

  /**
   * 获取资源的所有权限
   */
  getResourcePermissions(resourceId: string): UserPermission[] {
    return Array.from(this.permissions.values()).filter(p => p.resourceId === resourceId);
  }

  /**
   * 锁定资源
   */
  lockResource(
    resourceId: string,
    resourceType: ResourceType,
    userId: string,
    duration?: number,
    metadata?: Record<string, any>
  ): ResourceLock {
    // 检查是否已被锁定
    const existingLock = this.getLock(resourceId);
    if (existingLock) {
      throw new Error(`Resource ${resourceId} is already locked by user ${existingLock.userId}`);
    }

    // 检查用户是否有锁定权限
    const permissionCheck = this.checkPermission(userId, resourceId, "lock");
    if (!permissionCheck.allowed) {
      throw new Error(`User ${userId} does not have lock permission: ${permissionCheck.reason}`);
    }

    const lock: ResourceLock = {
      id: `lock-${Date.now()}-${Math.random()}`,
      resourceId,
      resourceType,
      userId,
      lockedAt: new Date(),
      expiresAt: duration ? new Date(Date.now() + duration) : new Date(Date.now() + this.lockTimeout),
      metadata,
    };

    this.locks.set(resourceId, lock);
    this.emit("resource:locked", lock);

    return lock;
  }

  /**
   * 解锁资源
   */
  unlockResource(resourceId: string, userId: string): void {
    const lock = this.locks.get(resourceId);

    if (!lock) {
      throw new Error(`Resource ${resourceId} is not locked`);
    }

    // 只有锁的所有者或管理员可以解锁
    if (lock.userId !== userId) {
      const permissionCheck = this.checkPermission(userId, resourceId, "admin");
      if (!permissionCheck.allowed) {
        throw new Error(`User ${userId} cannot unlock resource locked by ${lock.userId}`);
      }
    }

    this.locks.delete(resourceId);
    this.emit("resource:unlocked", lock);
  }

  /**
   * 获取锁
   */
  getLock(resourceId: string): ResourceLock | undefined {
    const lock = this.locks.get(resourceId);

    // 检查锁是否过期
    if (lock && lock.expiresAt && lock.expiresAt < new Date()) {
      this.locks.delete(resourceId);
      this.emit("lock:expired", lock);
      return undefined;
    }

    return lock;
  }

  /**
   * 检查资源是否被锁定
   */
  isLocked(resourceId: string): boolean {
    return this.getLock(resourceId) !== undefined;
  }

  /**
   * 检查用户是否可以访问被锁定的资源
   */
  canAccessLockedResource(resourceId: string, userId: string): boolean {
    const lock = this.getLock(resourceId);
    if (!lock) {
      return true; // 未锁定，可以访问
    }

    // 锁的所有者可以访问
    if (lock.userId === userId) {
      return true;
    }

    // 管理员可以访问
    const permission = this.getUserPermission(userId, resourceId);
    return permission?.role === "admin" || permission?.role === "owner";
  }

  /**
   * 续期锁
   */
  renewLock(resourceId: string, userId: string, duration?: number): void {
    const lock = this.locks.get(resourceId);

    if (!lock) {
      throw new Error(`Resource ${resourceId} is not locked`);
    }

    if (lock.userId !== userId) {
      throw new Error(`User ${userId} cannot renew lock owned by ${lock.userId}`);
    }

    lock.expiresAt = new Date(Date.now() + (duration || this.lockTimeout));
    this.emit("lock:renewed", lock);
  }

  /**
   * 强制解锁（管理员）
   */
  forceUnlock(resourceId: string, adminUserId: string): void {
    const lock = this.locks.get(resourceId);

    if (!lock) {
      throw new Error(`Resource ${resourceId} is not locked`);
    }

    // 检查管理员权限
    const permissionCheck = this.checkPermission(adminUserId, resourceId, "admin");
    if (!permissionCheck.allowed) {
      throw new Error(`User ${adminUserId} does not have admin permission`);
    }

    this.locks.delete(resourceId);
    this.emit("resource:force-unlocked", lock, adminUserId);
  }

  /**
   * 清理过期的锁
   */
  cleanupExpiredLocks(): number {
    const now = new Date();
    let count = 0;

    for (const [resourceId, lock] of this.locks) {
      if (lock.expiresAt && lock.expiresAt < now) {
        this.locks.delete(resourceId);
        this.emit("lock:expired", lock);
        count++;
      }
    }

    return count;
  }

  /**
   * 清理过期的权限
   */
  cleanupExpiredPermissions(): number {
    const now = new Date();
    let count = 0;

    for (const [key, permission] of this.permissions) {
      if (permission.expiresAt && permission.expiresAt < now) {
        this.permissions.delete(key);
        this.emit("permission:expired", permission);
        count++;
      }
    }

    return count;
  }

  /**
   * 获取权限键
   */
  private getPermissionKey(userId: string, resourceId: string): string {
    return `${userId}:${resourceId}`;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalPermissions: number;
    totalLocks: number;
    byRole: Record<Role, number>;
    byResourceType: Record<ResourceType, number>;
    activeLocks: number;
    expiredLocks: number;
  } {
    const permissions = Array.from(this.permissions.values());
    const locks = Array.from(this.locks.values());
    const now = new Date();

    const byRole: Record<Role, number> = {
      owner: 0,
      admin: 0,
      editor: 0,
      viewer: 0,
      guest: 0,
    };

    const byResourceType: Record<ResourceType, number> = {
      document: 0,
      slice: 0,
      stage: 0,
      project: 0,
    };

    for (const permission of permissions) {
      byRole[permission.role]++;
      byResourceType[permission.resourceType]++;
    }

    const activeLocks = locks.filter(l => !l.expiresAt || l.expiresAt > now).length;
    const expiredLocks = locks.filter(l => l.expiresAt && l.expiresAt <= now).length;

    return {
      totalPermissions: permissions.length,
      totalLocks: locks.length,
      byRole,
      byResourceType,
      activeLocks,
      expiredLocks,
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.permissions.clear();
    this.locks.clear();
    this.removeAllListeners();
  }
}
