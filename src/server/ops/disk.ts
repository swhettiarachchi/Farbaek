import { statfs } from "node:fs/promises";

/**
 * Free disk space, for /api/ready. Inside the app container "/" reports the
 * server's own disk, which the database shares. Below either limit the
 * readiness check fails, so uptime monitors alert well before Postgres runs
 * out of space (on 2026-10-24 build cache had quietly filled 81% of it).
 */
export const DISK_LOW = { minFreeRatio: 0.1, minFreeBytes: 5 * 1024 ** 3 } as const;

export type DiskState = "ok" | "low" | "unknown";

export function diskState(freeBytes: number, totalBytes: number): DiskState {
  if (!Number.isFinite(freeBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return "unknown";
  return freeBytes < DISK_LOW.minFreeBytes || freeBytes / totalBytes < DISK_LOW.minFreeRatio ? "low" : "ok";
}

export async function readDisk(path = "/"): Promise<DiskState> {
  try {
    const s = await statfs(path);
    return diskState(s.bavail * s.bsize, s.blocks * s.bsize);
  } catch {
    return "unknown";
  }
}
