import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * 缓存层级
 */
export type CacheLevel = "L1" | "L2" | "L3";

/**
 * 缓存策略
 */
export type CacheStrategy = "content_addressed" | "incremental" | "predictive";

/**
 * 缓存条目
 */
export interface CacheEntry {
  key: string;
  value: any;
  size: number;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  ttl: number; // Time to live in ms
  dependencies?: string[]; // 依赖的其他缓存键
  metadata?: Record<string, any>;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
  evictions: number;
  byLevel: {
    L1: { hits: number; misses: number; size: number };
    L2: { hits: number; misses: number; size: number };
    L3: { hits: number; misses: number; size: number };
  };
}

/**
 * L1 缓存 (内存)
 */
class L1Cache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private currentSize: number = 0;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 100 * 1024 * 1024) {
    // 默认 100MB
    this.maxSize = maxSize;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.delete(key);
      this.misses++;
      return null;
    }

    // 更新访问信息
    entry.accessedAt = new Date();
    entry.accessCount++;
    this.hits++;

    return entry.value;
  }

  set(key: string, value: any, ttl: number = 3600000): void {
    // 默认 1 小时
    const size = this.estimateSize(value);

    // 如果超过最大大小，执行驱逐
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      key,
      value,
      size,
      createdAt: new Date(),
      accessedAt: new Date(),
      accessCount: 0,
      ttl,
    };

    // 如果键已存在，先删除旧的
    if (this.cache.has(key)) {
      this.delete(key);
    }

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const age = now - entry.createdAt.getTime();
    return age > entry.ttl;
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache) {
      const lastAccess = entry.accessedAt.getTime();
      if (lastAccess < lruTime) {
        lruTime = lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
    }
  }

  private estimateSize(value: any): number {
    // 简化的大小估算
    const json = JSON.stringify(value);
    return Buffer.byteLength(json, "utf8");
  }

  getStats(): { hits: number; misses: number; size: number; count: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.currentSize,
      count: this.cache.size,
    };
  }
}

/**
 * L2 缓存 (本地磁盘)
 */
class L2Cache {
  private cacheDir: string;
  private hits: number = 0;
  private misses: number = 0;

  constructor(cacheDir: string = ".jispec/cache/l2") {
    this.cacheDir = cacheDir;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  get(key: string): any | null {
    const filePath = this.getFilePath(key);

    if (!fs.existsSync(filePath)) {
      this.misses++;
      return null;
    }

    try {
      const data = fs.readFileSync(filePath, "utf8");
      const entry: CacheEntry = JSON.parse(data);

      // 检查是否过期
      if (this.isExpired(entry)) {
        this.delete(key);
        this.misses++;
        return null;
      }

      this.hits++;
      return entry.value;
    } catch (error) {
      this.misses++;
      return null;
    }
  }

  set(key: string, value: any, ttl: number = 86400000): void {
    // 默认 24 小时
    const entry: CacheEntry = {
      key,
      value,
      size: 0,
      createdAt: new Date(),
      accessedAt: new Date(),
      accessCount: 0,
      ttl,
    };

    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(entry), "utf8");
  }

  delete(key: string): void {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  clear(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  has(key: string): boolean {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const data = fs.readFileSync(filePath, "utf8");
      const entry: CacheEntry = JSON.parse(data);
      return !this.isExpired(entry);
    } catch {
      return false;
    }
  }

  private getFilePath(key: string): string {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const subdir = hash.substring(0, 2);
    return path.join(this.cacheDir, subdir, `${hash}.json`);
  }

  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const age = now - new Date(entry.createdAt).getTime();
    return age > entry.ttl;
  }

  getStats(): { hits: number; misses: number; size: number; count: number } {
    let totalSize = 0;
    let count = 0;

    const countFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          countFiles(filePath);
        } else {
          totalSize += stat.size;
          count++;
        }
      }
    };

    countFiles(this.cacheDir);

    return {
      hits: this.hits,
      misses: this.misses,
      size: totalSize,
      count,
    };
  }
}

/**
 * L3 缓存 (分布式对象存储)
 */
class L3Cache {
  private hits: number = 0;
  private misses: number = 0;

  // TODO: 实现 S3/MinIO 集成
  get(key: string): any | null {
    this.misses++;
    return null;
  }

  set(key: string, value: any, ttl: number = 604800000): void {
    // 默认 7 天
    // TODO: 实现 S3/MinIO 上传
  }

  delete(key: string): void {
    // TODO: 实现 S3/MinIO 删除
  }

  clear(): void {
    // TODO: 实现 S3/MinIO 批量删除
  }

  has(key: string): boolean {
    // TODO: 实现 S3/MinIO 检查
    return false;
  }

  getStats(): { hits: number; misses: number; size: number; count: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: 0,
      count: 0,
    };
  }
}

/**
 * 智能缓存管理器
 */
export class CacheManager {
  private l1: L1Cache;
  private l2: L2Cache;
  private l3: L3Cache;
  private strategy: CacheStrategy = "content_addressed";
  private evictions: number = 0;

  constructor(
    l1MaxSize?: number,
    l2CacheDir?: string,
    strategy: CacheStrategy = "content_addressed"
  ) {
    this.l1 = new L1Cache(l1MaxSize);
    this.l2 = new L2Cache(l2CacheDir);
    this.l3 = new L3Cache();
    this.strategy = strategy;
  }

  /**
   * 获取缓存
   */
  get(key: string): any | null {
    // L1 查找
    let value = this.l1.get(key);
    if (value !== null) {
      return value;
    }

    // L2 查找
    value = this.l2.get(key);
    if (value !== null) {
      // 提升到 L1
      this.l1.set(key, value);
      return value;
    }

    // L3 查找
    value = this.l3.get(key);
    if (value !== null) {
      // 提升到 L2 和 L1
      this.l2.set(key, value);
      this.l1.set(key, value);
      return value;
    }

    return null;
  }

  /**
   * 设置缓存
   */
  set(key: string, value: any, ttl?: number): void {
    // 写入所有层级
    this.l1.set(key, value, ttl);
    this.l2.set(key, value, ttl);
    // L3 可选，用于大型对象
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.l1.delete(key);
    this.l2.delete(key);
    this.l3.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.l1.clear();
    this.l2.clear();
    this.l3.clear();
  }

  /**
   * 检查缓存是否存在
   */
  has(key: string): boolean {
    return this.l1.has(key) || this.l2.has(key) || this.l3.has(key);
  }

  /**
   * 计算内容哈希（用于内容寻址）
   */
  computeContentHash(content: any): string {
    const json = JSON.stringify(content);
    return crypto.createHash("sha256").update(json).digest("hex");
  }

  /**
   * 基于内容的缓存键
   */
  getContentKey(prefix: string, content: any): string {
    const hash = this.computeContentHash(content);
    return `${prefix}:${hash}`;
  }

  /**
   * 使失效（基于依赖）
   */
  invalidate(key: string): void {
    this.delete(key);

    // TODO: 查找并删除依赖此键的其他缓存
  }

  /**
   * 批量使失效
   */
  invalidatePattern(pattern: string): void {
    // TODO: 实现模式匹配删除
  }

  /**
   * 预热缓存
   */
  async warmup(keys: string[], loader: (key: string) => Promise<any>): Promise<void> {
    const promises = keys.map(async (key) => {
      if (!this.has(key)) {
        const value = await loader(key);
        this.set(key, value);
      }
    });

    await Promise.all(promises);
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    const l1Stats = this.l1.getStats();
    const l2Stats = this.l2.getStats();
    const l3Stats = this.l3.getStats();

    const totalHits = l1Stats.hits + l2Stats.hits + l3Stats.hits;
    const totalMisses = l1Stats.misses + l2Stats.misses + l3Stats.misses;
    const hitRate = totalHits / (totalHits + totalMisses) || 0;

    return {
      hits: totalHits,
      misses: totalMisses,
      hitRate,
      totalSize: l1Stats.size + l2Stats.size + l3Stats.size,
      entryCount: l1Stats.count + l2Stats.count + l3Stats.count,
      evictions: this.evictions,
      byLevel: {
        L1: { hits: l1Stats.hits, misses: l1Stats.misses, size: l1Stats.size },
        L2: { hits: l2Stats.hits, misses: l2Stats.misses, size: l2Stats.size },
        L3: { hits: l3Stats.hits, misses: l3Stats.misses, size: l3Stats.size },
      },
    };
  }

  /**
   * 设置策略
   */
  setStrategy(strategy: CacheStrategy): void {
    this.strategy = strategy;
  }

  /**
   * 获取策略
   */
  getStrategy(): CacheStrategy {
    return this.strategy;
  }
}

/**
 * 缓存装饰器
 */
export function Cached(ttl?: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const cacheManager = new CacheManager();

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${propertyKey}:${JSON.stringify(args)}`;

      // 尝试从缓存获取
      const cached = cacheManager.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 执行原方法
      const result = await originalMethod.apply(this, args);

      // 缓存结果
      cacheManager.set(cacheKey, result, ttl);

      return result;
    };

    return descriptor;
  };
}
