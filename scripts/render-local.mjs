import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Blockchain, createShardAccount } from '@ton/sandbox';
import { Dictionary, toNano } from '@ton/core';
import { PNG } from 'pngjs';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = path.join(root, 'artifacts');
const tmpDir = path.join(root, '.tmp', 'local-render');
const objPath =
  process.argv[2] ??
  path.join(root, 'test-model', 'd17ac3a2a5c2496d9e4b07193602a780.obj');
const maxVertices = Number(process.env.MAX_VERTICES ?? 100000);
const maxFaces = Number(process.env.MAX_FACES ?? 4096);
const canvasSize = Number(process.env.CANVAS_SIZE ?? 256);
const pointBatchSize = Number(process.env.POINT_BATCH ?? 512);
const renderMode = process.env.RENDER_MODE ?? 'points';
const renderRows = Number(process.env.RENDER_ROWS ?? 4);
const preloadStorage = process.env.PRELOAD_STORAGE !== '0';
const cameraView = {
  yaw: Number(process.env.CAMERA_YAW ?? 0),
  pitch: Number(process.env.CAMERA_PITCH ?? 0),
  roll: Number(process.env.CAMERA_ROLL ?? 0),
};
const pointRadius = Number(
  process.env.POINT_RADIUS ??
    (canvasSize >= 256 ? 2 : canvasSize >= 128 ? 1 : 0),
);

await fs.promises.mkdir(outDir, { recursive: true });
await fs.promises.mkdir(tmpDir, { recursive: true });

const [meshModuleUrl, wrapperModuleUrl] = await Promise.all([
  bundleTs('app/src/lib/mesh.ts', 'mesh.mjs'),
  bundleTs('wrappers-ts/OnchainRenderer.gen.ts', 'renderer-wrapper.mjs'),
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
const camera = fitCamera(mesh.vertices, canvasSize, cameraView);

const blockchain = await Blockchain.create();
const deployer = await blockchain.treasury('deployer');
const initialContract = wrapper.OnchainRenderer.fromStorage(
  defaultStorage(wrapper, deployer.address, mesh),
);
let renderer;

if (preloadStorage) {
  const smartContract = await blockchain.getContract(initialContract.address);
  smartContract.account = createShardAccount({
    address: initialContract.address,
    code: initialContract.init.code,
    data: initialContract.init.data,
    balance: toNano('1000'),
  });
  renderer = blockchain.openContract(
    wrapper.OnchainRenderer.fromAddress(initialContract.address),
  );
} else {
  renderer = blockchain.openContract(initialContract);
  await renderer.sendDeploy(deployer.getSender(), toNano('0.05'));
}

if (!preloadStorage) {
  for (let i = 0; i < mesh.vertexChunks.length; i += 1) {
    await renderer.sendUploadVertexChunk(deployer.getSender(), toNano('0.05'), {
      index: BigInt(i),
      total: BigInt(mesh.vertexChunks.length),
      data: mesh.vertexChunks[i],
    });
  }

  if (renderMode === 'rows') {
    for (let i = 0; i < mesh.faceChunks.length; i += 1) {
      await renderer.sendUploadFaceChunk(deployer.getSender(), toNano('0.05'), {
        index: BigInt(i),
        total: BigInt(mesh.faceChunks.length),
        data: mesh.faceChunks[i],
      });
    }

    for (let i = 0; i < mesh.faceUvChunks.length; i += 1) {
      await renderer.sendUploadFaceUvChunk(
        deployer.getSender(),
        toNano('0.05'),
        {
          index: BigInt(i),
          total: BigInt(mesh.faceUvChunks.length),
          data: mesh.faceUvChunks[i],
        },
      );
    }
  }

  await renderer.sendCommitModel(deployer.getSender(), toNano('0.05'), {
    vertexCount: BigInt(mesh.vertices.length),
    faceCount: renderMode === 'rows' ? BigInt(mesh.faces.length) : 0n,
    modelHash: mesh.modelHash,
    meshHash: mesh.meshHash,
  });
}

const [vertexCount, faceCount, , , isCommitted] = await renderer.getModelInfo();
const totalVertices = Number(vertexCount);
const frame = createFrame(canvasSize, canvasSize);

if (renderMode === 'rows') {
  for (let y0 = 0; y0 < canvasSize; y0 += renderRows) {
    const rows = Math.min(renderRows, canvasSize - y0);
    let cell;
    try {
      cell = await renderer.getRenderRows(BigInt(y0), BigInt(rows));
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            error: 'renderRows failed',
            y0,
            rows,
            exitCode: error.exitCode,
            gasUsed: error.gasUsed?.toString(),
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    const band = meshModule.decodeRenderCell(cell);
    writeBand(frame, band);
  }
} else {
  for (let start = 0; start < totalVertices; start += pointBatchSize) {
    const count = Math.min(pointBatchSize, totalVertices - start);
    const cell = await renderer.getRenderPoints(BigInt(start), BigInt(count));
    const batch = meshModule.decodeRenderPointsCell(cell);
    writePointBatch(frame, batch);
  }
}

const pngPath = path.join(outDir, 'onchain-render-test-model.png');
await writePng(
  pngPath,
  frame,
  canvasSize,
  canvasSize,
  Math.max(1, Math.floor(512 / canvasSize)),
);

const summary = {
  obj: objPath,
  output: pngPath,
  canvas: `${canvasSize}x${canvasSize}`,
  vertices: mesh.vertices.length,
  surfaceSamples: mesh.surfaceSamples,
  committedVertices: totalVertices,
  committedFaces: Number(faceCount),
  committed: isCommitted,
  vertexChunks: mesh.vertexChunks.length,
  faceChunks: renderMode === 'rows' ? mesh.faceChunks.length : 0,
  faceUvChunks: renderMode === 'rows' ? mesh.faceUvChunks.length : 0,
  skippedFaces: mesh.truncatedFaces,
  renderMode,
  preloadStorage,
  pointBatches:
    renderMode === 'rows' ? 0 : Math.ceil(totalVertices / pointBatchSize),
  rowBatches: renderMode === 'rows' ? Math.ceil(canvasSize / renderRows) : 0,
  pointRadius,
  camera,
};

console.log(JSON.stringify(summary, null, 2));

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

function defaultStorage(wrapper, owner, mesh) {
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
  if (preloadStorage) {
    mesh.vertexChunks.forEach((chunk, index) => {
      vertexChunks.set(BigInt(index), chunk);
    });
    if (renderMode === 'rows') {
      mesh.faceChunks.forEach((chunk, index) => {
        faceChunks.set(BigInt(index), chunk);
      });
      mesh.faceUvChunks.forEach((chunk, index) => {
        faceUvChunks.set(BigInt(index), chunk);
      });
    }
  }

  return {
    $: 'Storage',
    owner,
    seed: 1n,
    canvasWidth: BigInt(canvasSize),
    canvasHeight: BigInt(canvasSize),
    maxVertices: BigInt(maxVertices),
    maxFaces: BigInt(maxFaces),
    camera: wrapper.Camera.create({
      yaw: BigInt(camera.yaw),
      pitch: BigInt(camera.pitch),
      roll: BigInt(camera.roll),
      zoom: BigInt(camera.zoom),
      tx: BigInt(camera.tx),
      ty: BigInt(camera.ty),
      tz: 0n,
    }),
    vertexChunks,
    faceChunks,
    model: {
      ref: wrapper.RendererModel.create({
        vertexCount: preloadStorage ? BigInt(mesh.vertices.length) : 0n,
        faceCount:
          preloadStorage && renderMode === 'rows'
            ? BigInt(mesh.faces.length)
            : 0n,
        modelHash: preloadStorage ? mesh.modelHash : 0n,
        meshHash: preloadStorage ? mesh.meshHash : 0n,
        vertexChunkTotal: preloadStorage
          ? BigInt(mesh.vertexChunks.length)
          : 0n,
        vertexChunksUploaded: preloadStorage
          ? BigInt(mesh.vertexChunks.length)
          : 0n,
        faceChunkTotal:
          preloadStorage && renderMode === 'rows'
            ? BigInt(mesh.faceChunks.length)
            : 0n,
        faceChunksUploaded:
          preloadStorage && renderMode === 'rows'
            ? BigInt(mesh.faceChunks.length)
            : 0n,
      }),
    },
    assets: {
      ref: wrapper.RendererAssets.create({
        textureWidth: 0n,
        textureHeight: 0n,
        textureHash: 0n,
        faceUvChunkTotal:
          preloadStorage && renderMode === 'rows'
            ? BigInt(mesh.faceUvChunks.length)
            : 0n,
        faceUvChunksUploaded:
          preloadStorage && renderMode === 'rows'
            ? BigInt(mesh.faceUvChunks.length)
            : 0n,
        textureChunkTotal: 0n,
        textureChunksUploaded: 0n,
        faceUvChunks,
        textureChunks,
        isTextureCommitted: false,
      }),
    },
    isCommitted: preloadStorage,
  };
}

function fitCamera(vertices, size, view) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const vertex of vertices) {
    const projected = rotateVertex(vertex, view);
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const margin = Math.max(3, Math.round(size * 0.08));
  const usable = Math.max(1, size - margin * 2);
  const zoom = clampInt16(
    Math.floor(Math.min((usable * 512) / spanX, (usable * 512) / spanY)),
  );

  return {
    yaw: clampInt16(Math.round(view.yaw)),
    pitch: clampInt16(Math.round(view.pitch)),
    roll: clampInt16(Math.round(view.roll)),
    zoom: Math.max(1, zoom),
    tx: clampInt16(-Math.round((minX + maxX) / 2)),
    ty: clampInt16(-Math.round((minY + maxY) / 2)),
  };
}

function rotateVertex(vertex, camera) {
  const yawSin = sinDeg512(camera.yaw);
  const yawCos = cosDeg512(camera.yaw);
  const pitchSin = sinDeg512(camera.pitch);
  const pitchCos = cosDeg512(camera.pitch);
  const rollSin = sinDeg512(camera.roll);
  const rollCos = cosDeg512(camera.roll);
  const z = vertex.z + (camera.tz ?? 0);

  const x1 = Math.trunc((vertex.x * yawCos + z * yawSin) / 512);
  const z1 = Math.trunc((z * yawCos - vertex.x * yawSin) / 512);
  const y2 = Math.trunc((vertex.y * pitchCos - z1 * pitchSin) / 512);
  const x3 = Math.trunc((x1 * rollCos - y2 * rollSin) / 512);
  const y3 = Math.trunc((x1 * rollSin + y2 * rollCos) / 512);

  return { x: x3, y: y3, z: z1 };
}

function sinDeg512(angle) {
  let normalized = Math.round(angle) % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;

  const sign = normalized < 0 ? -1 : 1;
  const positive = Math.abs(normalized);
  const folded = positive > 90 ? 180 - positive : positive;
  const numerator = 4 * folded * (180 - folded) * 512;
  const denominator = 40500 - folded * (180 - folded);
  return sign * Math.trunc(numerator / denominator);
}

function cosDeg512(angle) {
  return sinDeg512(angle + 90);
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

function writePointBatch(frame, batch) {
  for (const point of batch.points) {
    if (
      point.x < 0 ||
      point.x >= batch.width ||
      point.y < 0 ||
      point.y >= batch.height
    ) {
      continue;
    }

    const [r, g, b] = colorFromPixel(point.color);
    for (let dy = -pointRadius; dy <= pointRadius; dy += 1) {
      for (let dx = -pointRadius; dx <= pointRadius; dx += 1) {
        const x = point.x + dx;
        const y = point.y + dy;
        if (x < 0 || x >= batch.width || y < 0 || y >= batch.height) {
          continue;
        }

        const dst = (y * batch.width + x) * 4;
        frame[dst] = r;
        frame[dst + 1] = g;
        frame[dst + 2] = b;
        frame[dst + 3] = 255;
      }
    }
  }
}

function writeBand(frame, band) {
  for (let row = 0; row < band.rows; row += 1) {
    for (let x = 0; x < band.width; x += 1) {
      const value = band.pixels[row * band.width + x] ?? 0;
      const dst = ((band.y0 + row) * band.width + x) * 4;
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
