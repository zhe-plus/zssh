import { create } from "zustand";
import type { UUID } from "../types";

export type TransferDirection = "upload" | "download";

export type TransferTaskStatus = "queued" | "transferring" | "paused" | "completed" | "failed" | "cancelled";

export interface TransferTask {
  id: string;
  fileName: string;
  direction: TransferDirection;
  source: string;
  target: string;
  size: number;
  transferred: number;
  speed: number; // bytes per second
  status: TransferTaskStatus;
  error?: string;
  ptyId: UUID;
}

interface TransferState {
  tasks: TransferTask[];
  maxConcurrent: number;

  addTask(task: Omit<TransferTask, "id" | "transferred" | "speed" | "status">): void;
  updateProgress(taskId: string, transferred: number, speed?: number): void;
  setTaskStatus(taskId: string, status: TransferTaskStatus, error?: string): void;
  pauseTask(taskId: string): void;
  resumeTask(taskId: string): void;
  cancelTask(taskId: string): void;
  retryTask(taskId: string): void;
  clearCompleted(): void;
  clearAll(): void;
  pauseAll(): void;
  resumeAll(): void;

  getActiveCount(): number;
  getQueuedTasks(): TransferTask[];
}

function newId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  tasks: [],
  maxConcurrent: 3,

  addTask(task) {
    const id = newId();
    const newTask: TransferTask = {
      ...task,
      id,
      transferred: 0,
      speed: 0,
      status: "queued",
    };
    set((s) => ({ tasks: [...s.tasks, newTask] }));
  },

  updateProgress(taskId, transferred, speed) {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, transferred, speed: speed ?? t.speed } : t,
      ),
    }));
  },

  setTaskStatus(taskId, status, error) {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, status, error } : t,
      ),
    }));
  },

  pauseTask(taskId) {
    get().setTaskStatus(taskId, "paused");
  },

  resumeTask(taskId) {
    get().setTaskStatus(taskId, "queued");
  },

  cancelTask(taskId) {
    get().setTaskStatus(taskId, "cancelled");
  },

  retryTask(taskId) {
    get().setTaskStatus(taskId, "queued");
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, transferred: 0, speed: 0, error: undefined } : t,
      ),
    }));
  },

  clearCompleted() {
    set((s) => ({
      tasks: s.tasks.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "failed",
      ),
    }));
  },

  clearAll() {
    set({ tasks: [] });
  },

  pauseAll() {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === "transferring" || t.status === "queued" ? { ...t, status: "paused" as const } : t,
      ),
    }));
  },

  resumeAll() {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === "paused" ? { ...t, status: "queued" as const } : t,
      ),
    }));
  },

  getActiveCount() {
    return get().tasks.filter(
      (t) => t.status === "transferring" || t.status === "queued",
    ).length;
  },

  getQueuedTasks() {
    return get()
      .tasks.filter((t) => t.status === "queued")
      .sort((a, b) => a.id.localeCompare(b.id));
  },
}));

// Utility format function for use in components
export { formatBytes as formatTransferSize };
