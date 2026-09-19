// Gallery persistence (plan §L), Redis+Blob port of server/src/gallery.ts for the serverless
// deployment. Entries live as one JSON array under a single Redis key (small, party-scale data
// — same shape as the local gallery.json file, just not on a local disk); artifact binaries go
// to Vercel Blob instead of server/data/artifacts/, and files.* store the resulting public URL
// directly rather than a local /artifacts/... path.
import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { redis } from './redis.ts';
import type { GalleryEntry } from '../../../shared/types.ts';

const ENTRIES_KEY = 'gallery:entries';

async function load(): Promise<GalleryEntry[]> {
  return (await redis.get<GalleryEntry[]>(ENTRIES_KEY)) ?? [];
}

async function save(entries: GalleryEntry[]) {
  await redis.set(ENTRIES_KEY, entries);
}

export async function listEntries(): Promise<GalleryEntry[]> {
  return (await load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEntry(id: string): Promise<GalleryEntry | undefined> {
  return (await load()).find((e) => e.id === id);
}

export async function createEntry(data: Omit<GalleryEntry, 'id' | 'createdAt' | 'files'>): Promise<GalleryEntry> {
  const entries = await load();
  const entry: GalleryEntry = { ...data, id: nanoid(8), createdAt: new Date().toISOString(), files: {} };
  entries.push(entry);
  await save(entries);
  return entry;
}

const CONTENT_TYPES: Record<string, string> = {
  'painting.png': 'image/png',
  'poster.png': 'image/png',
  'thumb.jpg': 'image/jpeg',
  'sculpture.glb': 'model/gltf-binary',
  'champion.png': 'image/png',
};

export async function uploadArtifact(id: string, name: string, base64: string): Promise<string | null> {
  const contentType = CONTENT_TYPES[name];
  if (!contentType) return null;

  const blob = await put(`gallery/${id}/${name}`, Buffer.from(base64, 'base64'), {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const stem = name.replace(/\.(png|jpg|glb)$/, '') as 'painting' | 'poster' | 'thumb' | 'sculpture' | 'champion';
  const fileKey = stem === 'sculpture' ? 'sculptureGlb' : stem;
  await updateEntryFiles(id, { [fileKey]: blob.url });
  return blob.url;
}

export async function updateEntryFiles(id: string, files: Partial<GalleryEntry['files']>): Promise<GalleryEntry | undefined> {
  const entries = await load();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return undefined;
  entry.files = { ...entry.files, ...files };
  await save(entries);
  return entry;
}

export async function listChampions(): Promise<GalleryEntry[]> {
  return (await listEntries()).filter((e) => !!e.championOf);
}

export async function setChampion(id: string, session: string): Promise<GalleryEntry | undefined> {
  const entries = await load();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return undefined;
  entry.championOf = session;
  await save(entries);
  return entry;
}
