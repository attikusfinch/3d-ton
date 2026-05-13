import {
  Address,
  beginCell,
  Dictionary,
  Sender,
  storeStateInit,
  toNano,
  type Cell,
  type SenderArguments,
  type StateInit,
} from '@ton/core';
import type { TonConnectUI } from '@tonconnect/ui-react';
import type { Feature, Wallet } from '@tonconnect/ui-react';

import {
  Camera,
  OnchainRenderer,
  RendererAssets,
  RendererModel,
  type Storage,
} from '@wrappers/OnchainRenderer.gen';
import {
  Camera as ShardCamera,
  OnchainRendererShard,
  RendererAssets as ShardRendererAssets,
  RendererModel as ShardRendererModel,
  type Storage as ShardStorage,
} from '@wrappers/OnchainRendererShard.gen';
import { getTonClient } from './ton';
import type { Network } from './router';
import { selectTextureChunksForShard } from './mesh';
import type {
  CompiledMesh,
  CompiledMeshShard,
  CompiledTexture,
  MeshVertex,
} from './mesh';

export const DEFAULT_MAX_VERTICES = 100000;
export const DEFAULT_MAX_FACES = 4096;
export const DEFAULT_SHARD_FACES = DEFAULT_MAX_FACES;
export const DEFAULT_RENDER_ROWS = 4;
export const DEFAULT_RENDER_POINTS = 512;
export const DEPLOY_MESSAGE_VALUE = toNano('0.05');
export const PAYLOAD_MESSAGE_VALUE = toNano('0.01');

export interface CameraView {
  id: string;
  label: string;
  yaw: number;
  pitch: number;
  roll: number;
}

export const CAMERA_VIEWS = [
  { id: 'front', label: 'Front', yaw: 0, pitch: 0, roll: 0 },
  { id: 'right-corner', label: 'Right Corner', yaw: 35, pitch: 18, roll: 0 },
  { id: 'left-corner', label: 'Left Corner', yaw: -35, pitch: 18, roll: 0 },
  { id: 'top-right', label: 'Top Right', yaw: 42, pitch: 32, roll: 0 },
  { id: 'top-left', label: 'Top Left', yaw: -42, pitch: 32, roll: 0 },
] satisfies CameraView[];

export const DEFAULT_CAMERA_VIEW = CAMERA_VIEWS[0]!;

export interface UploadProgress {
  done: number;
  total: number;
  label: string;
}

export function createRendererContract(
  owner: Address,
  canvasSize: number,
): OnchainRenderer {
  return OnchainRenderer.fromStorage(defaultStorage(owner, canvasSize));
}

export function createRendererShardContract(
  owner: Address,
  canvasSize: number,
  shardIndex: number,
): OnchainRendererShard {
  return OnchainRendererShard.fromStorage(
    defaultShardStorage(owner, canvasSize, shardIndex),
  );
}

export function openRenderer(network: Network, address: Address) {
  return getTonClient(network).open(OnchainRenderer.fromAddress(address));
}

export function openRendererShard(network: Network, address: Address) {
  return getTonClient(network).open(OnchainRendererShard.fromAddress(address));
}

export function createTonConnectSender(
  tonConnectUI: TonConnectUI,
  ownerAddress: string,
  network: Network,
): Sender {
  return {
    address: Address.parse(ownerAddress),
    send: async (args: SenderArguments) => {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: network === 'testnet' ? '-3' : '-239',
        messages: [senderArgsToMessage(args, network)],
      });
    },
  };
}

export async function sendRendererPayloads(
  tonConnectUI: TonConnectUI,
  network: Network,
  contractAddress: Address,
  payloads: Cell[],
  maxMessagesPerTransaction: number,
  onProgress: (progress: UploadProgress) => void,
): Promise<void> {
  const batchSize = clampMessageBatchSize(maxMessagesPerTransaction);
  const totalBatches = Math.ceil(payloads.length / batchSize);

  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    onProgress({
      done: batchNumber - 1,
      total: totalBatches,
      label: `Signing batch ${batchNumber}/${totalBatches} (${batch.length} messages)`,
    });

    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      network: network === 'testnet' ? '-3' : '-239',
      messages: batch.map((payload) => ({
        address: contractAddress.toString({
          bounceable: true,
          testOnly: network === 'testnet',
        }),
        amount: PAYLOAD_MESSAGE_VALUE.toString(),
        payload: payload.toBoc().toString('base64'),
      })),
    });

    onProgress({
      done: batchNumber,
      total: totalBatches,
      label: `Batch ${batchNumber}/${totalBatches} sent`,
    });
  }
}

export function getWalletMessageBatchSize(wallet: Wallet | null): number {
  if (!wallet) return 4;
  const walletInfoFeatures = getOptionalFeatures(wallet);

  const maxMessages = [
    ...extractSendTransactionLimits(wallet.device.features),
    ...extractSendTransactionLimits(walletInfoFeatures),
  ];

  return clampMessageBatchSize(
    maxMessages.length ? Math.max(...maxMessages) : 4,
  );
}

export function buildUploadPayloads(
  mesh: CompiledMesh,
  canvasSize: number,
  texture: CompiledTexture | null,
  cameraView: CameraView = DEFAULT_CAMERA_VIEW,
): Cell[] {
  const payloads: Cell[] = [
    OnchainRenderer.createCellOfSetLimits({
      canvasWidth: BigInt(canvasSize),
      canvasHeight: BigInt(canvasSize),
      maxVertices: BigInt(DEFAULT_MAX_VERTICES),
      maxFaces: BigInt(DEFAULT_MAX_FACES),
    }),
    OnchainRenderer.createCellOfSetCamera({
      camera: fitCamera(mesh.vertices, canvasSize, cameraView),
    }),
  ];

  if (texture) {
    texture.chunks.forEach((data, index) => {
      payloads.push(
        OnchainRenderer.createCellOfUploadTextureChunk({
          index: BigInt(index),
          total: BigInt(texture.chunks.length),
          data,
        }),
      );
    });

    payloads.push(
      OnchainRenderer.createCellOfCommitTexture({
        width: BigInt(texture.width),
        height: BigInt(texture.height),
        textureHash: texture.textureHash,
      }),
    );
  } else {
    payloads.push(OnchainRenderer.createCellOfClearTexture({}));
  }

  mesh.vertexChunks.forEach((data, index) => {
    payloads.push(
      OnchainRenderer.createCellOfUploadVertexChunk({
        index: BigInt(index),
        total: BigInt(mesh.vertexChunks.length),
        data,
      }),
    );
  });

  mesh.faceChunks.forEach((data, index) => {
    payloads.push(
      OnchainRenderer.createCellOfUploadFaceChunk({
        index: BigInt(index),
        total: BigInt(mesh.faceChunks.length),
        data,
      }),
    );
  });

  mesh.faceUvChunks.forEach((data, index) => {
    payloads.push(
      OnchainRenderer.createCellOfUploadFaceUvChunk({
        index: BigInt(index),
        total: BigInt(mesh.faceUvChunks.length),
        data,
      }),
    );
  });

  payloads.push(
    OnchainRenderer.createCellOfCommitModel({
      vertexCount: BigInt(mesh.vertices.length),
      faceCount: BigInt(mesh.faces.length),
      modelHash: mesh.modelHash,
      meshHash: mesh.meshHash,
    }),
  );

  return payloads;
}

export function buildSetCameraPayload(
  mesh: CompiledMesh,
  canvasSize: number,
  cameraView: CameraView,
): Cell {
  return OnchainRenderer.createCellOfSetCamera({
    camera: fitCamera(mesh.vertices, canvasSize, cameraView),
  });
}

export function buildShardUploadPayloads(
  shard: CompiledMeshShard,
  canvasSize: number,
  texture: CompiledTexture | null,
  cameraView: CameraView = DEFAULT_CAMERA_VIEW,
): Cell[] {
  const payloads: Cell[] = [
    OnchainRendererShard.createCellOfSetLimits({
      canvasWidth: BigInt(canvasSize),
      canvasHeight: BigInt(canvasSize),
      maxVertices: BigInt(DEFAULT_MAX_VERTICES),
      maxFaces: BigInt(DEFAULT_MAX_FACES),
    }),
    OnchainRendererShard.createCellOfSetCamera({
      camera: fitShardCamera(shard.vertices, canvasSize, cameraView),
    }),
  ];

  const selectedTexture = texture
    ? selectTextureChunksForShard(texture, shard)
    : null;

  if (selectedTexture) {
    selectedTexture.chunks.forEach(({ index, data }) => {
      payloads.push(
        OnchainRendererShard.createCellOfUploadTextureChunk({
          index: BigInt(index),
          total: BigInt(selectedTexture.totalChunks),
          data,
        }),
      );
    });

    payloads.push(
      OnchainRendererShard.createCellOfCommitTexture({
        width: BigInt(selectedTexture.width),
        height: BigInt(selectedTexture.height),
        textureHash: selectedTexture.textureHash,
      }),
    );
  } else {
    payloads.push(OnchainRendererShard.createCellOfClearTexture({}));
  }

  shard.vertexChunks.forEach((data, index) => {
    payloads.push(
      OnchainRendererShard.createCellOfUploadVertexChunk({
        index: BigInt(index),
        total: BigInt(shard.vertexChunks.length),
        data,
      }),
    );
  });

  shard.faceChunks.forEach((data, index) => {
    payloads.push(
      OnchainRendererShard.createCellOfUploadFaceChunk({
        index: BigInt(index),
        total: BigInt(shard.faceChunks.length),
        data,
      }),
    );
  });

  shard.faceUvChunks.forEach((data, index) => {
    payloads.push(
      OnchainRendererShard.createCellOfUploadFaceUvChunk({
        index: BigInt(index),
        total: BigInt(shard.faceUvChunks.length),
        data,
      }),
    );
  });

  payloads.push(
    OnchainRendererShard.createCellOfCommitModel({
      vertexCount: BigInt(shard.vertices.length),
      faceCount: BigInt(shard.faces.length),
      modelHash: shard.modelHash,
      meshHash: shard.meshHash,
    }),
  );

  return payloads;
}

function fitCamera(
  vertices: MeshVertex[],
  canvasSize: number,
  cameraView: CameraView = DEFAULT_CAMERA_VIEW,
): Camera {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const vertex of vertices) {
    const projected = rotateVertex(vertex, cameraView);
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const margin = Math.max(3, Math.round(canvasSize * 0.08));
  const usable = Math.max(1, canvasSize - margin * 2);
  const zoom = clampInt16(
    Math.floor(Math.min((usable * 512) / spanX, (usable * 512) / spanY)),
  );

  return Camera.create({
    yaw: BigInt(clampInt16(Math.round(cameraView.yaw))),
    pitch: BigInt(clampInt16(Math.round(cameraView.pitch))),
    roll: BigInt(clampInt16(Math.round(cameraView.roll))),
    zoom: BigInt(Math.max(1, zoom)),
    tx: BigInt(clampInt16(-Math.round((minX + maxX) / 2))),
    ty: BigInt(clampInt16(-Math.round((minY + maxY) / 2))),
    tz: 0n,
  });
}

function fitShardCamera(
  vertices: MeshVertex[],
  canvasSize: number,
  cameraView: CameraView = DEFAULT_CAMERA_VIEW,
): ShardCamera {
  const camera = fitCamera(vertices, canvasSize, cameraView);
  return ShardCamera.create({
    yaw: camera.yaw,
    pitch: camera.pitch,
    roll: camera.roll,
    zoom: camera.zoom,
    tx: camera.tx,
    ty: camera.ty,
    tz: camera.tz,
  });
}

function rotateVertex(vertex: MeshVertex, cameraView: CameraView): MeshVertex {
  const yawSin = sinDeg512(cameraView.yaw);
  const yawCos = cosDeg512(cameraView.yaw);
  const pitchSin = sinDeg512(cameraView.pitch);
  const pitchCos = cosDeg512(cameraView.pitch);
  const rollSin = sinDeg512(cameraView.roll);
  const rollCos = cosDeg512(cameraView.roll);

  const x1 = Math.trunc((vertex.x * yawCos + vertex.z * yawSin) / 512);
  const z1 = Math.trunc((vertex.z * yawCos - vertex.x * yawSin) / 512);
  const y2 = Math.trunc((vertex.y * pitchCos - z1 * pitchSin) / 512);
  const x3 = Math.trunc((x1 * rollCos - y2 * rollSin) / 512);
  const y3 = Math.trunc((x1 * rollSin + y2 * rollCos) / 512);

  return { x: x3, y: y3, z: z1 };
}

function sinDeg512(angle: number): number {
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

function cosDeg512(angle: number): number {
  return sinDeg512(angle + 90);
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, value));
}

function defaultStorage(owner: Address, canvasSize: number): Storage {
  return {
    $: 'Storage',
    owner,
    seed: 1n,
    canvasWidth: BigInt(canvasSize),
    canvasHeight: BigInt(canvasSize),
    maxVertices: BigInt(DEFAULT_MAX_VERTICES),
    maxFaces: BigInt(DEFAULT_MAX_FACES),
    camera: Camera.create({
      yaw: 0n,
      pitch: 0n,
      roll: 0n,
      zoom: 256n,
      tx: 0n,
      ty: 0n,
      tz: 0n,
    }),
    vertexChunks: Dictionary.empty(
      Dictionary.Keys.BigUint(16),
      Dictionary.Values.Cell(),
    ),
    faceChunks: Dictionary.empty(
      Dictionary.Keys.BigUint(16),
      Dictionary.Values.Cell(),
    ),
    model: {
      ref: RendererModel.create({
        vertexCount: 0n,
        faceCount: 0n,
        modelHash: 0n,
        meshHash: 0n,
        vertexChunkTotal: 0n,
        vertexChunksUploaded: 0n,
        faceChunkTotal: 0n,
        faceChunksUploaded: 0n,
      }),
    },
    assets: {
      ref: RendererAssets.create({
        textureWidth: 0n,
        textureHeight: 0n,
        textureHash: 0n,
        faceUvChunkTotal: 0n,
        faceUvChunksUploaded: 0n,
        textureChunkTotal: 0n,
        textureChunksUploaded: 0n,
        faceUvChunks: Dictionary.empty(
          Dictionary.Keys.BigUint(16),
          Dictionary.Values.Cell(),
        ),
        textureChunks: Dictionary.empty(
          Dictionary.Keys.BigUint(16),
          Dictionary.Values.Cell(),
        ),
        isTextureCommitted: false,
      }),
    },
    isCommitted: false,
  };
}

function defaultShardStorage(
  owner: Address,
  canvasSize: number,
  shardIndex: number,
): ShardStorage {
  return {
    $: 'Storage',
    owner,
    seed: BigInt(shardIndex + 1),
    canvasWidth: BigInt(canvasSize),
    canvasHeight: BigInt(canvasSize),
    maxVertices: BigInt(DEFAULT_MAX_VERTICES),
    maxFaces: BigInt(DEFAULT_MAX_FACES),
    camera: ShardCamera.create({
      yaw: 0n,
      pitch: 0n,
      roll: 0n,
      zoom: 256n,
      tx: 0n,
      ty: 0n,
      tz: 0n,
    }),
    vertexChunks: Dictionary.empty(
      Dictionary.Keys.BigUint(16),
      Dictionary.Values.Cell(),
    ),
    faceChunks: Dictionary.empty(
      Dictionary.Keys.BigUint(16),
      Dictionary.Values.Cell(),
    ),
    model: {
      ref: ShardRendererModel.create({
        vertexCount: 0n,
        faceCount: 0n,
        modelHash: 0n,
        meshHash: 0n,
        vertexChunkTotal: 0n,
        vertexChunksUploaded: 0n,
        faceChunkTotal: 0n,
        faceChunksUploaded: 0n,
      }),
    },
    assets: {
      ref: ShardRendererAssets.create({
        textureWidth: 0n,
        textureHeight: 0n,
        textureHash: 0n,
        faceUvChunkTotal: 0n,
        faceUvChunksUploaded: 0n,
        textureChunkTotal: 0n,
        textureChunksUploaded: 0n,
        faceUvChunks: Dictionary.empty(
          Dictionary.Keys.BigUint(16),
          Dictionary.Values.Cell(),
        ),
        textureChunks: Dictionary.empty(
          Dictionary.Keys.BigUint(16),
          Dictionary.Values.Cell(),
        ),
        isTextureCommitted: false,
      }),
    },
    isCommitted: false,
  };
}

function extractSendTransactionLimits(
  features: Feature[] | undefined,
): number[] {
  if (!features) return [];

  return features
    .map((feature) => {
      if (feature === 'SendTransaction') return 4;
      if (feature.name === 'SendTransaction') return feature.maxMessages;
      return null;
    })
    .filter((value): value is number => value !== null);
}

function getOptionalFeatures(wallet: Wallet): Feature[] | undefined {
  const value = (wallet as { features?: unknown }).features;
  return Array.isArray(value) ? (value as Feature[]) : undefined;
}

function clampMessageBatchSize(value: number): number {
  return Math.max(1, Math.min(255, Math.floor(value)));
}

function senderArgsToMessage(args: SenderArguments, network: Network) {
  const message: {
    address: string;
    amount: string;
    payload?: string;
    stateInit?: string;
  } = {
    address: args.to.toString({
      bounceable: args.bounce ?? true,
      testOnly: network === 'testnet',
    }),
    amount: args.value.toString(),
  };

  if (args.body) {
    message.payload = args.body.toBoc().toString('base64');
  }

  if (args.init) {
    message.stateInit = stateInitToBoc(args.init).toString('base64');
  }

  return message;
}

function stateInitToBoc(init: StateInit): Buffer {
  return beginCell().store(storeStateInit(init)).endCell().toBoc();
}
