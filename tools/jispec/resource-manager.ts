import * as os from "os";
import * as fs from "fs";

/**
 * 资源类型
 */
export type ResourceType = "cpu" | "memory" | "disk" | "network";

/**
 * 资源分配
 */
export interface ResourceAllocation {
  id: string;
  taskId: string;
  cpu: number;
  memory: number;
  disk: number;
  allocatedAt: Date;
  releasedAt?: Date;
}

/**
 * 资源状态
 */
export interface ResourceStatus {
  cpu: {
    total: number;
    used: number;
    available: number;
    utilization: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    utilization: number;
  };
  disk: {
    total: number;
    used: number;
    available: number;
    utilization: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

/**
 * 资源监控数据
 */
export interface ResourceMetrics {
  timestamp: Date;
  cpu: {
    usage: number[];
    loadAverage: number[];
  };
  memory: {
    total: number;
    free: number;
    used: number;
    cached: number;
  };
  disk: {
    total: number;
    free: number;
    used: number;
  };
}

/**
 * 资源管理器
 */
export class ResourceManager {
  private allocations: Map<string, ResourceAllocation> = new Map();
  private metricsHistory: ResourceMetrics[] = [];
  private maxHistorySize: number = 1000;
  private monitoringInterval: NodeJS.Timeout | null = null;

  allocateResources(
    taskId: string,
    requirements: { cpu: number; memory: number; disk: number }
  ): ResourceAllocation {
    const status = this.getResourceStatus();

    if (
      status.cpu.available < requirements.cpu ||
      status.memory.available < requirements.memory ||
      status.disk.available < requirements.disk
    ) {
      throw new Error("Insufficient resources");
    }

    const allocation: ResourceAllocation = {
      id: `alloc-${Date.now()}-${Math.random()}`,
      taskId,
      cpu: requirements.cpu,
      memory: requirements.memory,
      disk: requirements.disk,
      allocatedAt: new Date(),
    };

    this.allocations.set(allocation.id, allocation);
    return allocation;
  }

  releaseResources(allocationId: string): void {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${allocationId} not found`);
    }

    allocation.releasedAt = new Date();
    this.allocations.delete(allocationId);
  }

  getResourceStatus(): ResourceStatus {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    let allocatedCpu = 0;
    let allocatedMemory = 0;
    let allocatedDisk = 0;

    for (const allocation of this.allocations.values()) {
      allocatedCpu += allocation.cpu;
      allocatedMemory += allocation.memory;
      allocatedDisk += allocation.disk;
    }

    const totalCpu = cpus.length;
    const usedCpu = allocatedCpu;
    const availableCpu = totalCpu - usedCpu;
    const cpuUtilization = usedCpu / totalCpu;

    const usedMemory = totalMemory - freeMemory + allocatedMemory;
    const availableMemory = totalMemory - usedMemory;
    const memoryUtilization = usedMemory / totalMemory;

    const diskInfo = this.getDiskInfo();
    const usedDisk = diskInfo.used + allocatedDisk;
    const availableDisk = diskInfo.total - usedDisk;
    const diskUtilization = usedDisk / diskInfo.total;

    const networkInfo = this.getNetworkInfo();

    return {
      cpu: {
        total: totalCpu,
        used: usedCpu,
        available: availableCpu,
        utilization: cpuUtilization,
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        available: availableMemory,
        utilization: memoryUtilization,
      },
      disk: {
        total: diskInfo.total,
        used: usedDisk,
        available: availableDisk,
        utilization: diskUtilization,
      },
      network: networkInfo,
    };
  }

  private getDiskInfo(): { total: number; used: number; free: number } {
    return {
      total: 100 * 1024 * 1024 * 1024,
      used: 50 * 1024 * 1024 * 1024,
      free: 50 * 1024 * 1024 * 1024,
    };
  }

  private getNetworkInfo(): {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  } {
    return {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
    };
  }

  collectMetrics(): ResourceMetrics {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const diskInfo = this.getDiskInfo();

    const cpuUsage = cpus.map((cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return 1 - idle / total;
    });

    const metrics: ResourceMetrics = {
      timestamp: new Date(),
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        cached: 0,
      },
      disk: diskInfo,
    };

    this.metricsHistory.push(metrics);

    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    return metrics;
  }

  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  getMetricsHistory(limit?: number): ResourceMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  getResourceTrends(duration: number = 3600000): {
    cpu: { avg: number; max: number; min: number };
    memory: { avg: number; max: number; min: number };
    disk: { avg: number; max: number; min: number };
  } {
    const now = Date.now();
    const cutoff = now - duration;

    const recentMetrics = this.metricsHistory.filter(
      (m) => m.timestamp.getTime() >= cutoff
    );

    if (recentMetrics.length === 0) {
      return {
        cpu: { avg: 0, max: 0, min: 0 },
        memory: { avg: 0, max: 0, min: 0 },
        disk: { avg: 0, max: 0, min: 0 },
      };
    }

    const cpuUsages = recentMetrics.map((m) =>
      m.cpu.usage.reduce((a, b) => a + b, 0) / m.cpu.usage.length
    );
    const cpuAvg = cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length;
    const cpuMax = Math.max(...cpuUsages);
    const cpuMin = Math.min(...cpuUsages);

    const memoryUsages = recentMetrics.map(
      (m) => m.memory.used / m.memory.total
    );
    const memoryAvg =
      memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
    const memoryMax = Math.max(...memoryUsages);
    const memoryMin = Math.min(...memoryUsages);

    const diskUsages = recentMetrics.map((m) => m.disk.used / m.disk.total);
    const diskAvg = diskUsages.reduce((a, b) => a + b, 0) / diskUsages.length;
    const diskMax = Math.max(...diskUsages);
    const diskMin = Math.min(...diskUsages);

    return {
      cpu: { avg: cpuAvg, max: cpuMax, min: cpuMin },
      memory: { avg: memoryAvg, max: memoryMax, min: memoryMin },
      disk: { avg: diskAvg, max: diskMax, min: diskMin },
    };
  }

  checkHealth(): {
    healthy: boolean;
    warnings: string[];
    critical: string[];
  } {
    const status = this.getResourceStatus();
    const warnings: string[] = [];
    const critical: string[] = [];

    if (status.cpu.utilization > 0.9) {
      critical.push(`CPU utilization critical: ${(status.cpu.utilization * 100).toFixed(1)}%`);
    } else if (status.cpu.utilization > 0.7) {
      warnings.push(`CPU utilization high: ${(status.cpu.utilization * 100).toFixed(1)}%`);
    }

    if (status.memory.utilization > 0.9) {
      critical.push(`Memory utilization critical: ${(status.memory.utilization * 100).toFixed(1)}%`);
    } else if (status.memory.utilization > 0.7) {
      warnings.push(`Memory utilization high: ${(status.memory.utilization * 100).toFixed(1)}%`);
    }

    if (status.disk.utilization > 0.9) {
      critical.push(`Disk utilization critical: ${(status.disk.utilization * 100).toFixed(1)}%`);
    } else if (status.disk.utilization > 0.8) {
      warnings.push(`Disk utilization high: ${(status.disk.utilization * 100).toFixed(1)}%`);
    }

    return {
      healthy: critical.length === 0,
      warnings,
      critical,
    };
  }

  async waitForResources(
    requirements: { cpu: number; memory: number; disk: number },
    timeoutMs: number = 60000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = this.getResourceStatus();

      if (
        status.cpu.available >= requirements.cpu &&
        status.memory.available >= requirements.memory &&
        status.disk.available >= requirements.disk
      ) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Timeout waiting for resources");
  }

  getAllocations(): ResourceAllocation[] {
    return Array.from(this.allocations.values());
  }

  saveMetrics(outputPath: string): void {
    const data = {
      timestamp: new Date().toISOString(),
      status: this.getResourceStatus(),
      trends: this.getResourceTrends(),
      health: this.checkHealth(),
      allocations: this.getAllocations(),
      history: this.metricsHistory.slice(-100),
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  }
}
