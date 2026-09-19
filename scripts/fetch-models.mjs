// Self-hosts MediaPipe pose landmarker assets so the client never depends on a CDN at runtime.
// Copies the wasm bundle from the installed @mediapipe/tasks-vision package and downloads the
// lite pose model into client/public/mediapipe/.
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const publicDir = path.join(root, 'client', 'public', 'mediapipe');
const wasmDest = path.join(publicDir, 'wasm');
const modelDest = path.join(publicDir, 'pose_landmarker_lite.task');
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

async function main() {
  if (!existsSync(wasmSrc)) {
    console.error(
      `[fetch-models] wasm source not found at ${wasmSrc}. Run "npm install" first (needs @mediapipe/tasks-vision in client/node_modules or hoisted root node_modules).`,
    );
    process.exit(1);
  }

  await mkdir(publicDir, { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log(`[fetch-models] copied wasm -> ${wasmDest}`);

  if (existsSync(modelDest)) {
    console.log(`[fetch-models] model already present at ${modelDest}, skipping download`);
    return;
  }

  console.log(`[fetch-models] downloading pose_landmarker_lite.task ...`);
  const res = await fetch(modelUrl);
  if (!res.ok) {
    console.error(`[fetch-models] download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await (await import('node:fs/promises')).writeFile(modelDest, buf);
  console.log(`[fetch-models] saved model -> ${modelDest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('[fetch-models] failed:', err);
  process.exit(1);
});
