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
const models = {
  lite: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  full: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
  heavy: '64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b',
};
for (const [variant, expectedHash] of Object.entries(models)) {
  const name = `pose_landmarker_${variant}.task`;
  const target = new URL(`public/models/${name}`, root);
  try {
    await access(target);
  } catch {
    const response = await fetch(
      `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/1/${name}`,
      { signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== expectedHash)
      throw new Error(`${variant} model checksum mismatch.`);
    await writeFile(target, bytes);
  }
  if (
    createHash('sha256')
      .update(await readFile(target))
      .digest('hex') !== expectedHash
  )
    throw new Error(`Existing ${variant} model checksum mismatch.`);
}
await writeFile(
  new URL('public/models/checksum.txt', root),
  JSON.stringify(models, null, 2) + '\n',
);
console.log('Pose model and WASM assets are ready.');
