// Gallery persistence (plan §L): JSON file with atomic writes (write .tmp, rename). No SQLite —
// party-scale is dozens of entries, and a native module is a build risk we don't need.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import type { GalleryEntry } from '../../shared/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');
const galleryPath = path.join(dataDir, 'gallery.json');
export const artifactsDir = path.join(dataDir, 'artifacts');

function ensureDirs() {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
}

function load(): GalleryEntry[] {
  ensureDirs();
  if (!existsSync(galleryPath)) return [];
  try {
    return JSON.parse(readFileSync(galleryPath, 'utf8'));
  } catch (err) {
    console.error('[gallery] failed to parse gallery.json, starting fresh', err);
    return [];
  }
}

function save(entries: GalleryEntry[]) {
  ensureDirs();
  const tmpPath = `${galleryPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2));
  renameSync(tmpPath, galleryPath);
}

export function listEntries(): GalleryEntry[] {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getEntry(id: string): GalleryEntry | undefined {
  return load().find((e) => e.id === id);
}

export function createEntry(data: Omit<GalleryEntry, 'id' | 'createdAt' | 'files'>): GalleryEntry {
  const entries = load();
  const entry: GalleryEntry = {
    ...data,
    id: nanoid(8),
    createdAt: new Date().toISOString(),
    files: {},
  };
  entries.push(entry);
  save(entries);
  ensureDirs();
  mkdirSync(path.join(artifactsDir, entry.id), { recursive: true });
  return entry;
}

export function updateEntryFiles(id: string, files: Partial<GalleryEntry['files']>): GalleryEntry | undefined {
  const entries = load();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return undefined;
  entry.files = { ...entry.files, ...files };
  save(entries);
  return entry;
}

export function listChampions(): GalleryEntry[] {
  return listEntries().filter((e) => !!e.championOf);
}

export function setChampion(id: string, session: string): GalleryEntry | undefined {
  const entries = load();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return undefined;
  entry.championOf = session;
  save(entries);
  return entry;
}
