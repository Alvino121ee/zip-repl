import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const ACTIVITY_FILE = join(DATA_DIR, "activity-log.json");

export type ActivitySource = "auto" | "demo" | "scalp" | "brain" | "system";
export type ActivityLevel = "info" | "success" | "warning" | "error" | "signal" | "scan";

export interface ActivityEntry {
  id: string;
  timestamp: number;
  source: ActivitySource;
  level: ActivityLevel;
  message: string;
  symbol?: string;
  confidence?: number;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 600;
const entries: ActivityEntry[] = [];
let dirty = false;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadActivity() {
  try {
    ensureDataDir();
    if (!existsSync(ACTIVITY_FILE)) return;
    const raw = readFileSync(ACTIVITY_FILE, "utf-8");
    const saved = JSON.parse(raw) as ActivityEntry[];
    entries.push(...saved.slice(0, MAX_ENTRIES));
    logger.info({ count: entries.length }, "Activity log loaded from disk");
  } catch (err) {
    logger.warn({ err }, "Failed to load activity log");
  }
}

function saveActivity() {
  if (!dirty) return;
  try {
    ensureDataDir();
    writeFileSync(ACTIVITY_FILE, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2), "utf-8");
    dirty = false;
  } catch (err) {
    logger.warn({ err }, "Failed to save activity log");
  }
}

loadActivity();
setInterval(saveActivity, 30_000);

export function logActivity(entry: Omit<ActivityEntry, "id" | "timestamp">): ActivityEntry {
  const full: ActivityEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...entry,
  };
  entries.unshift(full);
  if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
  dirty = true;
  return full;
}

export function getActivity(opts: {
  source?: ActivitySource | ActivitySource[];
  limit?: number;
  since?: number;
}): ActivityEntry[] {
  let result = entries;

  if (opts.source) {
    const sources = Array.isArray(opts.source) ? opts.source : [opts.source];
    result = result.filter((e) => sources.includes(e.source));
  }
  if (opts.since) {
    result = result.filter((e) => e.timestamp > opts.since!);
  }

  return result.slice(0, opts.limit ?? 50);
}

export function clearActivity(source?: ActivitySource) {
  if (!source) {
    entries.splice(0);
  } else {
    const toRemove = entries.filter((e) => e.source === source).map((e) => e.id);
    for (const id of toRemove) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx >= 0) entries.splice(idx, 1);
    }
  }
  dirty = true;
}

export function getLatestStatus(source?: ActivitySource): ActivityEntry | null {
  const filtered = source ? entries.filter((e) => e.source === source) : entries;
  return filtered[0] ?? null;
}
