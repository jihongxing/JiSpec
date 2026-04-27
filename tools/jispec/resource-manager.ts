import { randomUUID } from "node:crypto";
import type { ResourceRequirements } from "./distributed-scheduler";

export interface ManagedResourceCapacity {
  cpu: number;
  memory: number;
  disk: number;
}

export interface ManagedResourceUsage {
  cpu: number;
  memory: number;
  disk: number;
}

export interface ManagedResourceStatus {
  capacity: ManagedResourceCapacity;
  used: ManagedResourceUsage;
  available: ManagedResourceUsage;
  utilization: ManagedResourceUsage;
  allocationCount: number;
}

export interface ManagedResourceAllocation {
  id: string;
  ownerId: string;
  taskId: string;
  requirements: ManagedResourceUsage;
  allocatedAt: Date;
}

export interface WaitForResourcesOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

function cloneUsage(usage: ManagedResourceUsage): ManagedResourceUsage {
  return {
    cpu: usage.cpu,
    memory: usage.memory,
    disk: usage.disk,
  };
}

function toUsage(requirements: Pick<ResourceRequirements, "cpu" | "memory" | "disk">): ManagedResourceUsage {
  return {
    cpu: requirements.cpu,
    memory: requirements.memory,
    disk: requirements.disk,
  };
}

export class ResourceManager {
  private readonly capacity: ManagedResourceCapacity;
  private readonly allocations = new Map<string, ManagedResourceAllocation>();
  private readonly allocationIdsByOwner = new Map<string, Set<string>>();

  constructor(capacity: ManagedResourceCapacity) {
    this.capacity = {
      cpu: capacity.cpu,
      memory: capacity.memory,
      disk: capacity.disk,
    };
  }

  allocateResources(
    ownerId: string,
    taskId: string,
    requirements: Pick<ResourceRequirements, "cpu" | "memory" | "disk">
  ): ManagedResourceAllocation {
    const requested = toUsage(requirements);

    if (!this.canAllocate(requested)) {
      const available = this.getAvailableResources();
      throw new Error(
        `Insufficient resources for ${taskId} on ${ownerId}: requested cpu=${requested.cpu}, memory=${requested.memory}, disk=${requested.disk}; available cpu=${available.cpu}, memory=${available.memory}, disk=${available.disk}`
      );
    }

    const allocation: ManagedResourceAllocation = {
      id: randomUUID(),
      ownerId,
      taskId,
      requirements: requested,
      allocatedAt: new Date(),
    };

    this.allocations.set(allocation.id, allocation);

    const ownerAllocations = this.allocationIdsByOwner.get(ownerId) ?? new Set<string>();
    ownerAllocations.add(allocation.id);
    this.allocationIdsByOwner.set(ownerId, ownerAllocations);

    return allocation;
  }

  releaseResources(allocationId: string): void {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      return;
    }

    this.allocations.delete(allocationId);

    const ownerAllocations = this.allocationIdsByOwner.get(allocation.ownerId);
    if (!ownerAllocations) {
      return;
    }

    ownerAllocations.delete(allocationId);
    if (ownerAllocations.size === 0) {
      this.allocationIdsByOwner.delete(allocation.ownerId);
    }
  }

  releaseOwnerResources(ownerId: string): void {
    const allocationIds = this.allocationIdsByOwner.get(ownerId);
    if (!allocationIds) {
      return;
    }

    for (const allocationId of allocationIds) {
      this.allocations.delete(allocationId);
    }

    this.allocationIdsByOwner.delete(ownerId);
  }

  canAllocate(requirements: Pick<ResourceRequirements, "cpu" | "memory" | "disk">): boolean {
    const requested = toUsage(requirements);
    const available = this.getAvailableResources();

    return (
      requested.cpu <= available.cpu &&
      requested.memory <= available.memory &&
      requested.disk <= available.disk
    );
  }

  getAvailableResources(): ManagedResourceUsage {
    const used = this.getUsedResources();

    return {
      cpu: Math.max(0, this.capacity.cpu - used.cpu),
      memory: Math.max(0, this.capacity.memory - used.memory),
      disk: Math.max(0, this.capacity.disk - used.disk),
    };
  }

  getUsedResources(): ManagedResourceUsage {
    const used: ManagedResourceUsage = { cpu: 0, memory: 0, disk: 0 };

    for (const allocation of this.allocations.values()) {
      used.cpu += allocation.requirements.cpu;
      used.memory += allocation.requirements.memory;
      used.disk += allocation.requirements.disk;
    }

    return used;
  }

  getStatus(): ManagedResourceStatus {
    const used = this.getUsedResources();
    const available = this.getAvailableResources();

    return {
      capacity: cloneUsage(this.capacity),
      used,
      available,
      utilization: {
        cpu: this.capacity.cpu === 0 ? 0 : used.cpu / this.capacity.cpu,
        memory: this.capacity.memory === 0 ? 0 : used.memory / this.capacity.memory,
        disk: this.capacity.disk === 0 ? 0 : used.disk / this.capacity.disk,
      },
      allocationCount: this.allocations.size,
    };
  }

  getAllocations(): ManagedResourceAllocation[] {
    return Array.from(this.allocations.values()).map((allocation) => ({
      ...allocation,
      requirements: cloneUsage(allocation.requirements),
      allocatedAt: new Date(allocation.allocatedAt),
    }));
  }

  getOwnerAllocations(ownerId: string): ManagedResourceAllocation[] {
    const allocationIds = this.allocationIdsByOwner.get(ownerId);
    if (!allocationIds) {
      return [];
    }

    return Array.from(allocationIds)
      .map((allocationId) => this.allocations.get(allocationId))
      .filter((allocation): allocation is ManagedResourceAllocation => allocation !== undefined)
      .map((allocation) => ({
        ...allocation,
        requirements: cloneUsage(allocation.requirements),
        allocatedAt: new Date(allocation.allocatedAt),
      }));
  }

  async waitForResources(
    requirements: Pick<ResourceRequirements, "cpu" | "memory" | "disk">,
    options: WaitForResourcesOptions = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollIntervalMs = options.pollIntervalMs ?? 25;
    const start = Date.now();

    while (Date.now() - start <= timeoutMs) {
      if (this.canAllocate(requirements)) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const available = this.getAvailableResources();
    throw new Error(
      `Timed out waiting for resources: requested cpu=${requirements.cpu}, memory=${requirements.memory}, disk=${requirements.disk}; available cpu=${available.cpu}, memory=${available.memory}, disk=${available.disk}`
    );
  }
}
