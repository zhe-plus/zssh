import { useState, useEffect, useCallback } from "react";
import type { UUID } from "../types";
import { api } from "../api";
import { t, tf } from "../lib/i18n";
import {
  X,
  RefreshCw,
  Loader2,
  Cpu,
  HardDrive,
  Wifi,
  Activity,
  Pause,
  Play,
} from "lucide-react";

interface MonitorPanelProps {
  ptyId: UUID | null;
  sessionId: UUID | null;
  open: boolean;
  onClose: () => void;
  lang?: string;
}

interface CpuData {
  user: number;
  system: number;
  idle: number;
  iowait: number;
  total: number;
}

interface MemoryData {
  total: number; // KB
  used: number;
  free: number;
  available: number;
  percent: number;
}

interface DiskPartition {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percent: number;
  mountedOn: string;
}

interface PingData {
  avgMs: number;
  lossPercent: number;
  lastPing: string;
}

interface MonitorState {
  cpu: CpuData | null;
  memory: MemoryData | null;
  disks: DiskPartition[];
  ping: PingData | null;
  loading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: number; // seconds
}

const MAX_HISTORY = 60;

export function MonitorPanel({ ptyId, sessionId, open, onClose, lang }: MonitorPanelProps) {
  const lang_ = lang ?? "zh-CN";
  const [state, setState] = useState<MonitorState>({
    cpu: null,
    memory: null,
    disks: [],
    ping: null,
    loading: false,
    error: null,
    autoRefresh: true,
    refreshInterval: 2,
  });

  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  const formatBytes = (kb: number): string => {
    if (kb < 1024) return `${kb}KB`;
    if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)}MB`;
    return `${(kb / (1024 * 1024)).toFixed(1)}GB`;
  };

  // Parse CPU from /proc/stat or top output
  const parseCpuOutput = useCallback((output: string): CpuData | null => {
    try {
      // Try parsing `top -bn1` or similar
      const lines = output.split("\n");
      for (const line of lines) {
        const m = line.match(/%Cpu\(s\):\s+([\d.]+)\s+us,\s+([\d.]+)\s+sy,\s+([\d.]+)\s+ni/);
        if (m) {
          const total = parseFloat(m[1]) + parseFloat(m[2]);
          return { user: parseFloat(m[1]), system: parseFloat(m[2]), idle: 100 - total, iowait: 0, total };
        }
      }
      // Fallback - try /proc/stat format
      for (const line of lines) {
        if (!line.startsWith("cpu ")) continue;
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length < 8) continue;
        const idle = parts[3];
        const total = parts.reduce((a, b) => a + b, 0);
        const usage = Math.round(((total - idle) / total) * 100);
        return { user: Math.round(usage * 0.6), system: Math.round(usage * 0.4), idle: 100 - usage, iowait: 0, total: usage };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const parseMemoryOutput = useCallback((output: string): MemoryData | null => {
    try {
      const lines = output.split("\n");
      let memTotal = 0, memFree = 0, memAvailable = 0;
      for (const line of lines) {
        const m = line.match(/Mem:\s+(\d+)k\s+total,\s+(\d+)k\s+used,\s+(\d+)k\s+free.*?(\d+)k\s+avail/);
        if (m) {
          memTotal = parseInt(m[1]) || 0;
          const used = parseInt(m[2]) || 0;
          memAvailable = parseInt(m[4]) || 0;
          return {
            total: memTotal,
            used,
            free: parseInt(m[3]) || 0,
            available: memAvailable,
            percent: memTotal > 0 ? Math.round(used / memTotal * 100) : 0,
          };
        }
      }
      // Fallback - free -m format
      for (const line of lines) {
        if (!line.startsWith("Mem:")) continue;
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 7) {
          memTotal = (parseFloat(parts[1]) || 0) * 1024;
          const used = (parseFloat(parts[2]) || 0) * 1024;
          memAvailable = (parseFloat(parts[6]) || 0) * 1024;
          return {
            total: memTotal,
            used,
            free: (parseFloat(parts[3]) || 0) * 1024,
            available: memAvailable,
            percent: memTotal > 0 ? Math.round(used / memTotal * 100) : 0,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const parseDiskOutput = useCallback((output: string): DiskPartition[] => {
    try {
      const result: DiskPartition[] = [];
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes("Filesystem") || !line.trim()) continue;
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 6) {
          const sizeStr = parts[1];
          const sizeKb = sizeStr.endsWith("G") ? parseFloat(sizeStr) * 1024 * 1024
            : sizeStr.endsWith("M") ? parseFloat(sizeStr) * 1024
              : parseFloat(sizeStr) || 0;
          const usedKb = (parseFloat(parts[2]) || 0) * (sizeStr?.endsWith("G") ? 1024 * 1024 : sizeStr?.endsWith("M") ? 1024 : 1);
          result.push({
            filesystem: parts[0],
            size: sizeKb,
            used: usedKb,
            available: (parseFloat(parts[3]) || 0) * (sizeStr?.endsWith("G") ? 1024 * 1024 : sizeStr?.endsWith("M") ? 1024 : 1),
            percent: parseInt(parts[4]?.replace("%", "") ?? "0") || 0,
            mountedOn: parts.slice(5).join(" "),
          });
        }
      }
      return result;
    } catch {
      return [];
    }
  }, []);

  const doRefresh = useCallback(async () => {
    if (!sessionId) {
      console.warn("[Monitor] No sessionId available, skipping refresh");
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Execute monitoring commands silently via separate SSH connection
      // This doesn't affect the main terminal session
      
      // Execute all commands in parallel for better performance
      const [cpuOutput, memOutput, diskOutput, pingOutput] = await Promise.all([
        api.monitorExec(sessionId, "cat /proc/stat | head -1").catch((e) => {
          console.error("[Monitor] CPU command failed:", e);
          return `ERROR: ${e}`;
        }),
        api.monitorExec(sessionId, "free -k 2>/dev/null || free 2>/dev/null").catch((e) => {
          console.error("[Monitor] Memory command failed:", e);
          return `ERROR: ${e}`;
        }),
        api.monitorExec(sessionId, "df -h 2>/dev/null | head -20").catch((e) => {
          console.error("[Monitor] Disk command failed:", e);
          return `ERROR: ${e}`;
        }),
        api.monitorExec(sessionId, "ping -c 1 -W 2 8.8.8.8 2>/dev/null | grep 'time=' | sed 's/.*time=\\([^ ]*\\).*/\\1/' || echo 'timeout'").catch((e) => {
          console.error("[Monitor] Ping command failed:", e);
          return `ERROR: ${e}`;
        }),
      ]).catch((e) => {
        // If all commands fail, show error
        throw new Error(`监控命令执行失败: ${e}`);
      });

      // Log raw outputs for debugging
      console.debug("[Monitor] Raw outputs:", { cpuOutput, memOutput, diskOutput, pingOutput });

      // Parse CPU from /proc/stat
      const cpuData = cpuOutput.startsWith("ERROR") ? null : parseCpuOutput(cpuOutput);
      
      // Parse Memory
      const memData = memOutput.startsWith("ERROR") ? null : parseMemoryOutput(memOutput);
      
      // Parse Disk
      const disks = diskOutput.startsWith("ERROR") ? [] : parseDiskOutput(diskOutput);
      
      // Parse Ping
      let ping: PingData | null = null;
      if (!pingOutput.startsWith("ERROR")) {
        const pingMatch = pingOutput.trim().match(/^[\d.]+$/);
        if (pingMatch) {
          ping = {
            avgMs: parseFloat(pingMatch[0]),
            lossPercent: 0,
            lastPing: new Date().toLocaleTimeString(),
          };
        } else if (pingOutput.includes("timeout") || !pingOutput.trim()) {
          ping = {
            avgMs: 0,
            lossPercent: 100,
            lastPing: new Date().toLocaleTimeString(),
          };
        }
      }

      // Build error message if no data was collected
      const errors: string[] = [];
      if (!cpuData) errors.push("CPU: no data");
      if (!memData) errors.push("Memory: no data");
      if (disks.length === 0) errors.push("Disk: no data");
      
      const errorMsg = errors.length > 0 ? `No monitoring data: ${errors.join(", ")}. Check if target is Linux/Unix system.` : null;

      setState({
        cpu: cpuData,
        memory: memData,
        disks,
        ping,
        loading: false,
        error: errorMsg,
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
      });

      if (cpuData) {
        setCpuHistory((prev) => [...prev.slice(-MAX_HISTORY + 1), cpuData.total]);
      }
      if (memData) {
        setMemHistory((prev) => [...prev.slice(-MAX_HISTORY + 1), memData.percent]);
      }
    } catch (e) {
      console.error("[Monitor] Refresh failed:", e);
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, [sessionId]);

  // Auto-refresh loop
  useEffect(() => {
    if (!open || !state.autoRefresh) return;
    doRefresh();
    const timer = setInterval(doRefresh, state.refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [open, state.autoRefresh, state.refreshInterval, doRefresh]);

  if (!open) return null;

  const getColorByValue = (value: number): string => {
    if (value > 90) return "bg-red-500";
    if (value > 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getTextColorByValue = (value: number): string => {
    if (value > 90) return "text-red-400";
    if (value > 75) return "text-yellow-400";
    return "text-green-400";
  };

  // Mini sparkline using SVG
  function SparkLine({ data, color }: { data: number[], color: string }) {
    if (data.length < 2) return null;
    const w = 120;
    const h = 32;
    const maxVal = Math.max(...data, 100);
    const minVal = Math.min(...data, 0);
    const range = maxVal - minVal || 1;
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - minVal) / range) * h;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg width={w} height={h} className="overflow-visible">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60">
      <div className="w-[720px] max-h-[85vh] flex flex-col rounded-lg bg-[var(--color-gray-900)] border border-[var(--color-gray-700)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-gray-800)] rounded-t-lg">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-blue-400" />
            <h3 className="text-sm font-medium text-white">{t(lang_, "monitorTitle")}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setState((p) => ({ ...p, autoRefresh: !p.autoRefresh }))}
              title={state.autoRefresh ? t(lang_, "monitorPause") : t(lang_, "monitorResume")}
              className="text-[var(--color-gray-400)] hover:text-white"
            >
              {state.autoRefresh ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button onClick={doRefresh} disabled={state.loading} className="text-[var(--color-gray-400)] hover:text-white disabled:opacity-50">
              {state.loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
            <button onClick={onClose} className="text-[var(--color-gray-400)] hover:text-white">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {state.error && (
            <div className="px-3 py-2 rounded bg-red-900/30 text-red-300 text-xs">{state.error}</div>
          )}
          
          {/* Info for password auth users */}
          {(state.loading && !state.error) && (
            <div className="px-3 py-2 rounded bg-blue-900/20 text-blue-300 text-xs">
              {state.autoRefresh ? "正在获取监控数据..." : "正在刷新..."}
              {navigator.platform.includes("Win") && (
                <>
                  <br />
                  <span className="text-yellow-400">Windows 用户: 监控功能需要使用 SSH 密钥认证。请在会话设置中配置密钥。</span>
                </>
              )}
              {!navigator.platform.includes("Win") && (
                <>
                  <br />
                  <span className="text-blue-400/70">提示: 密码认证需要安装 sshpass (如 `brew install sshpass` 或 `sudo apt install sshpass`)</span>
                </>
              )}
            </div>
          )}

          {/* Grid layout: 2x2 */}
          <div className="grid grid-cols-2 gap-4">
            {/* CPU Card */}
            <div className="rounded border border-[var(--color-gray-800)] bg-[var(--color-gray-950)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="size-4 text-green-400" />
                <span className="text-xs font-medium text-[var(--color-gray-200)]">CPU</span>
                {state.cpu ? (
                  <span className={`ml-auto text-sm font-bold tabular-nums ${getTextColorByValue(state.cpu.total)}`}>
                    {state.cpu.total}%
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-[var(--color-gray-500)]">--</span>
                )}
              </div>
              {cpuHistory.length > 1 ? (
                <SparkLine data={cpuHistory} color="#22c55e" />
              ) : (
                <div className="h-8 flex items-center justify-center text-xs text-[var(--color-gray-600)]">{t(lang_, "monitorNoData")}</div>
              )}
              {state.cpu ? (
                <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-[var(--color-gray-500)]">
                  <span>us:{state.cpu.user}%</span>
                  <span>sy:{state.cpu.system}%</span>
                  <span>id:{state.cpu.idle}%</span>
                  <span>wai:{state.cpu.iowait}%</span>
                </div>
              ) : null}
            </div>

            {/* Memory Card */}
            <div className="rounded border border-[var(--color-gray-800)] bg-[var(--color-gray-950)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="size-4 text-blue-400" />
                <span className="text-xs font-medium text-[var(--color-gray-200)]">{t(lang_, "monitorMemory")}</span>
                {state.memory ? (
                  <span className={`ml-auto text-sm font-bold tabular-nums ${getTextColorByValue(state.memory.percent)}`}>
                    {state.memory.percent}%
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-[var(--color-gray-500)]">--</span>
                )}
              </div>
              {memHistory.length > 1 ? (
                <SparkLine data={memHistory} color="#3b82f6" />
              ) : (
                <div className="h-8 flex items-center justify-center text-xs text-[var(--color-gray-600)]">{t(lang_, "monitorNoData")}</div>
              )}
              {state.memory ? (
                <div className="mt-2 text-[10px] text-[var(--color-gray-500)] tabular-nums">
                  {formatBytes(state.memory.used)} / {formatBytes(state.memory.total)}
                </div>
              ) : null}
            </div>
          </div>

          {/* Disk Usage */}
          <div className="rounded border border-[var(--color-gray-800)] bg-[var(--color-gray-950)] p-3">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="size-4 text-yellow-400" />
              <span className="text-xs font-medium text-[var(--color-gray-200)]">{t(lang_, "monitorDisk")}</span>
            </div>
            {state.disks.length === 0 && !state.loading ? (
              <div className="text-xs text-[var(--color-gray-600)] py-4 text-center">{t(lang_, "monitorNoData")}</div>
            ) : (
              <div className="space-y-2">
                {state.disks.map((disk, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-[var(--color-gray-300)] truncate max-w-[180px]" title={`${disk.filesystem} ${disk.mountedOn}`}>
                        {disk.mountedOn}
                      </span>
                      <span className={`text-[11px] font-medium tabular-nums ${getTextColorByValue(disk.percent)}`}>
                        {disk.percent}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--color-gray-800)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getColorByValue(disk.percent)}`}
                        style={{ width: `${Math.min(disk.percent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5 text-[10px] text-[var(--color-gray-600)] tabular-nums">
                      <span>{formatBytes(disk.used)}</span>
                      <span>{formatBytes(disk.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Network/Ping */}
          <div className="rounded border border-[var(--color-gray-800)] bg-[var(--color-gray-950)] p-3">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="size-4 text-purple-400" />
              <span className="text-xs font-medium text-[var(--color-gray-200)]">{t(lang_, "monitorNetwork")}</span>
            </div>
            {state.ping ? (
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px] text-[var(--color-gray-500)] mb-1">{t(lang_, "monitorLatency")}</div>
                  <div className="text-lg font-bold tabular-nums text-purple-400">{state.ping.avgMs}<span className="text-xs ml-0.5">ms</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-gray-500)] mb-1">{t(lang_, "monitorPacketLoss")}</div>
                  <div className={`text-lg font-bold tabular-nums ${state.ping.lossPercent > 0 ? "text-red-400" : "text-green-400"}`}>{state.ping.lossPercent}<span className="text-xs ml-0.5">%</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-gray-500)] mb-1">{t(lang_, "monitorLastUpdate")}</div>
                  <div className="text-xs text-[var(--color-gray-400)] tabular-nums">{state.ping.lastPing}</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--color-gray-600)] py-4 text-center">{t(lang_, "monitorNoData")}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--color-gray-800)] flex items-center justify-between text-[10px] text-[var(--color-gray-600)] rounded-b-lg">
          <span>{state.loading ? t(lang_, "monitorRefreshing") : ""}</span>
          <span>{tf(lang_, "monitorInterval", { sec: state.refreshInterval })}</span>
        </div>
      </div>
    </div>
  );
}
