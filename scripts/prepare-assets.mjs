import { mkdir, copyFile, access, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/wasm/', root), { recursive: true });
await mkdir(new URL('public/models/', root), { recursive: true });
await mkdir(new URL('public/vision/', root), { recursive: true });
await copyFile(
  new URL('node_modules/@mediapipe/tasks-vision/vision_bundle.cjs', root),
  new URL('public/vision/vision_bundle.js', root),
);
for (const name of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  await copyFile(
    new URL(`node_modules/@mediapipe/tasks-vision/wasm/${name}`, root),
    new URL(`public/wasm/${name}`, root),
  );
}
const target = new URL('public/models/pose_landmarker_lite.task', root);
const expectedHash = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
try {
  await access(target);
} catch {
  const response = await fetch(
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash)
    throw new Error('Model checksum mismatch.');
  await writeFile(target, bytes);
  await writeFile(
    new URL('public/models/checksum.txt', root),
    createHash('sha256').update(bytes).digest('hex') + '\n',
  );
}
if (
  createHash('sha256')
    .update(await readFile(target))
    .digest('hex') !== expectedHash
)
  throw new Error('Existing model checksum mismatch.');
console.log('Pose model and WASM assets are ready.');
