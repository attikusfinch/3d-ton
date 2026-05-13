import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Blockchain, createShardAccount } from '@ton/sandbox';
import { Dictionary, toNano } from '@ton/core';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = path.join(root, 'artifacts');
const tmpDir = path.join(root, '.tmp', 'local-render-shards');
const objPath =
  process.argv[2] ??
  path.join(root, 'test-model', 'd17ac3a2a5c2496d9e4b07193602a780.obj');
const texturePath =
  process.env.TEXTURE_PATH ?? path.join(root, 'test-model', 'merc.jpeg');
const canvasSize = Number(process.env.CANVAS_SIZE ?? 512);
const maxVertices = Number(process.env.MAX_VERTICES ?? 100000);
const maxFaces = Number(process.env.MAX_FACES ?? 4096);
const shardFaces = Number(process.env.SHARD_FACES ?? 16);
const renderFaces = Number(process.env.RENDER_FACES ?? maxFaces);
const maxPatchPixels = Number(process.env.MAX_PATCH_PIXELS ?? 4096);
const useTexture = process.env.USE_TEXTURE !== '0';

await fs.promises.mkdir(outDir, { recursive: true });
await fs.promises.mkdir(tmpDir, { recursive: true });

const [meshModuleUrl, wrapperModuleUrl] = await Promise.all([
  bundleTs('app/src/lib/mesh.ts', 'mesh.mjs'),
  bundleTs(
    'wrappers-ts/OnchainRendererShard.gen.ts',
    'renderer-shard-wrapper.mjs',
  ),
]);

const meshModule = await import(meshModuleUrl);
const wrapper = await import(wrapperModuleUrl);
const source = await fs.promises.readFile(objPath, 'utf8');
const mesh = await meshModule.compileObjToMesh(
  source,
  path.basename(objPath),
  maxVertices,
  maxFaces,
);
const shards = await meshModule.splitMeshIntoFaceShards(mesh, shardFaces);
const texture = useTexture ? await loadTexture(meshModule, texturePath) : null;
const camera = fitCamera(mesh.vertices, canvasSize);

const blockchain = await Blockchain.create();
const deployer = await blockchain.treasury('deployer');
const frame = createFrame(canvasSize, canvasSize);
let renderedFaces = 0;
let renderCalls = 0;
let skippedOffscreen = 0;
let skippedTooLarge = 0;

for (const shard of shards) {
  if (renderedFaces >= renderFaces) break;

  const initialContract = wrapper.OnchainRendererShard.fromStorage(
    defaultShardStorage(wrapper, deployer.address, shard, texture, camera),
  );
  const smartContract = await blockchain.getContract(initialContract.address);
  smartContract.account = createShardAccount({
    address: initialContract.address,
    code: initialContract.init.code,
    data: initialContract.init.data,
    balance: toNano('1000'),
  });
  const worker = blockchain.openContract(
    wrapper.OnchainRendererShard.fromAddress(initialContract.address),
  );

  for (let faceIndex = 0; faceIndex < shard.faces.length; faceIndex += 1) {
    if (renderedFaces >= renderFaces) break;

    const bounds = faceBounds(shard, faceIndex, camera, canvasSize);
    if (!bounds) {
      skippedOffscreen += 1;
      renderedFaces += 1;
      continue;
    }

    for (const patch of splitBounds(bounds, maxPatchPixels)) {
      if (patch.width * patch.height > maxPatchPixels) {
        skippedTooLarge += 1;
        continue;
      }

      const cell = await worker.getRenderFacePatch(
        BigInt(faceIndex),
        BigInt(patch.x0),
        BigInt(patch.y0),
        BigInt(patch.width),
        BigInt(patch.height),
      );
      writePatch(frame, meshModule.decodeRenderPatchCell(cell));
      renderCalls += 1;
    }

    renderedFaces += 1;
  }
}

const pngPath = path.join(
  outDir,
  texture
    ? 'onchain-render-sharded-textured-test-model.png'
    : 'onchain-render-sharded-test-model.png',
);
await writePng(pngPath, frame, canvasSize, canvasSize, 1);

console.log(
  JSON.stringify(
    {
      obj: objPath,
      texture: texture?.sourceName ?? null,
      output: pngPath,
      canvas: `${canvasSize}x${canvasSize}`,
      vertices: mesh.vertices.length,
      facesCompiled: mesh.faces.length,
      facesRendered: renderedFaces,
      shardsTotal: shards.length,
      shardFaces,
      renderCalls,
      skippedOffscreen,
      skippedTooLarge,
      textureChunks: texture?.chunks.length ?? 0,
      camera,
    },
    null,
    2,
  ),
);

async function bundleTs(entry, outfile) {
  const outPath = path.join(tmpDir, outfile);
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile: outPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['@ton/core'],
    logLevel: 'silent',
  });
  return `${pathToFileURL(outPath).href}?v=${Date.now()}`;
}

async function loadTexture(meshModule, filePath) {
  if (!(await exists(filePath))) return null;
  const bytes = await fs.promises.readFile(filePath);
  const image = jpeg.decode(bytes, { useTArray: true });
  return meshModule.compileTextureFromRgba(
    image.width,
    image.height,
    image.data,
    path.basename(filePath),
  );
}

async function exists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultShardStorage(wrapper, owner, shard, texture, camera) {
  const vertexChunks = Dictionary.empty(
    Dictionary.Keys.BigUint(16),
    Dictionary.Values.Cell(),
  );
  const faceChunks = Dictionary.empty(
    Dictionary.Keys.BigUint(16),
    Dictionary.Values.Cell(),
  );
  const faceUvChunks = Dictionary.empty(
    Dictionary.Keys.BigUint(16),
    Dictionary.Values.Cell(),
  );
  const textureChunks = Dictionary.empty(
    Dictionary.Keys.BigUint(16),
    Dictionary.Values.Cell(),
  );

  shard.vertexChunks.forEach((chunk, index) => {
    vertexChunks.set(BigInt(index), chunk);
  });
  shard.faceChunks.forEach((chunk, index) => {
    faceChunks.set(BigInt(index), chunk);
  });
  shard.faceUvChunks.forEach((chunk, index) => {
    faceUvChunks.set(BigInt(index), chunk);
  });
  texture?.chunks.forEach((chunk, index) => {
    textureChunks.set(BigInt(index), chunk);
  });

  return {
    $: 'Storage',
    owner,
    seed: BigInt(shard.shardIndex + 1),
    canvasWidth: BigInt(canvasSize),
    canvasHeight: BigInt(canvasSize),
    maxVertices: BigInt(maxVertices),
    maxFaces: BigInt(Math.max(1, shard.faces.length)),
    camera: wrapper.Camera.create({
      yaw: 0n,
      pitch: 0n,
      roll: 0n,
      zoom: BigInt(camera.zoom),
      tx: BigInt(camera.tx),
      ty: BigInt(camera.ty),
      tz: 0n,
    }),
    vertexChunks,
    faceChunks,
    model: {
      ref: wrapper.RendererModel.create({
        vertexCount: BigInt(shard.vertices.length),
        faceCount: BigInt(shard.faces.length),
        modelHash: shard.modelHash,
        meshHash: shard.meshHash,
        vertexChunkTotal: BigInt(shard.vertexChunks.length),
        vertexChunksUploaded: BigInt(shard.vertexChunks.length),
        faceChunkTotal: BigInt(shard.faceChunks.length),
        faceChunksUploaded: BigInt(shard.faceChunks.length),
      }),
    },
    assets: {
      ref: wrapper.RendererAssets.create({
        textureWidth: BigInt(texture?.width ?? 0),
        textureHeight: BigInt(texture?.height ?? 0),
        textureHash: texture?.textureHash ?? 0n,
        faceUvChunkTotal: BigInt(shard.faceUvChunks.length),
        faceUvChunksUploaded: BigInt(shard.faceUvChunks.length),
        textureChunkTotal: BigInt(texture?.chunks.length ?? 0),
        textureChunksUploaded: BigInt(texture?.chunks.length ?? 0),
        faceUvChunks,
        textureChunks,
        isTextureCommitted: texture !== null,
      }),
    },
    isCommitted: true,
  };
}

function fitCamera(vertices, size) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const margin = Math.max(3, Math.round(size * 0.08));
  const usable = Math.max(1, size - margin * 2);
  const zoom = clampInt16(
    Math.floor(Math.min((usable * 512) / spanX, (usable * 512) / spanY)),
  );

  return {
    zoom: Math.max(1, zoom),
    tx: clampInt16(-Math.round((minX + maxX) / 2)),
    ty: clampInt16(-Math.round((minY + maxY) / 2)),
  };
}

function faceBounds(shard, faceIndex, camera, size) {
  const face = shard.faces[faceIndex];
  const points = [face.a, face.b, face.c].map((index) =>
    project(shard.vertices[index], camera, size),
  );
  const minX = Math.max(0, Math.min(...points.map((p) => p.x)) - 1);
  const minY = Math.max(0, Math.min(...points.map((p) => p.y)) - 1);
  const maxX = Math.min(size - 1, Math.max(...points.map((p) => p.x)) + 1);
  const maxY = Math.min(size - 1, Math.max(...points.map((p) => p.y)) + 1);
  if (maxX < 0 || maxY < 0 || minX >= size || minY >= size) return null;
  if (maxX < minX || maxY < minY) return null;
  return {
    x0: minX,
    y0: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function splitBounds(bounds, maxPixels) {
  const side = Math.max(1, Math.floor(Math.sqrt(maxPixels)));
  const patches = [];
  for (let y = bounds.y0; y < bounds.y0 + bounds.height; y += side) {
    for (let x = bounds.x0; x < bounds.x0 + bounds.width; x += side) {
      patches.push({
        x0: x,
        y0: y,
        width: Math.min(side, bounds.x0 + bounds.width - x),
        height: Math.min(side, bounds.y0 + bounds.height - y),
      });
    }
  }
  return patches;
}

function project(vertex, camera, size) {
  const sx =
    Math.trunc(size / 2) +
    Math.trunc(((vertex.x + camera.tx) * camera.zoom) / 512);
  const sy =
    Math.trunc(size / 2) -
    Math.trunc(((vertex.y + camera.ty) * camera.zoom) / 512);
  return { x: sx, y: sy };
}

function clampInt16(value) {
  return Math.max(-32768, Math.min(32767, value));
}

function createFrame(width, height) {
  const frame = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    frame[offset] = 9;
    frame[offset + 1] = 14;
    frame[offset + 2] = 20;
    frame[offset + 3] = 255;
  }
  return frame;
}

function writePatch(frame, patch) {
  for (let row = 0; row < patch.height; row += 1) {
    for (let x = 0; x < patch.width; x += 1) {
      const value = patch.pixels[row * patch.width + x] ?? 0;
      if (value === 0) continue;
      const dst = ((patch.y0 + row) * patch.canvasWidth + patch.x0 + x) * 4;
      const [r, g, b] = colorFromPixel(value);
      frame[dst] = r;
      frame[dst + 1] = g;
      frame[dst + 2] = b;
      frame[dst + 3] = 255;
    }
  }
}

function colorFromPixel(value) {
  if (value === 0) return [9, 14, 20];
  return rgb332ToRgb(value);
}

function rgb332ToRgb(value) {
  const r = (value >> 5) & 0x07;
  const g = (value >> 2) & 0x07;
  const b = value & 0x03;
  return [
    Math.round((r * 255) / 7),
    Math.round((g * 255) / 7),
    Math.round((b * 255) / 3),
  ];
}

async function writePng(filePath, frame, width, height, scale) {
  const png = new PNG({ width: width * scale, height: height * scale });
  for (let y = 0; y < height * scale; y += 1) {
    for (let x = 0; x < width * scale; x += 1) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const src = (srcY * width + srcX) * 4;
      const dst = (y * width * scale + x) * 4;
      png.data[dst] = frame[src];
      png.data[dst + 1] = frame[src + 1];
      png.data[dst + 2] = frame[src + 2];
      png.data[dst + 3] = frame[src + 3];
    }
  }

  await new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(fs.createWriteStream(filePath))
      .on('finish', resolve)
      .on('error', reject);
  });
}
