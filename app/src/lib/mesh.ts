import { beginCell, type Cell } from '@ton/core';

export interface MeshVertex {
  x: number;
  y: number;
  z: number;
}

export interface MeshFace {
  a: number;
  b: number;
  c: number;
  color: number;
}

export interface MeshFaceUv {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  u2: number;
  v2: number;
}

export interface CompiledMesh {
  vertices: MeshVertex[];
  faces: MeshFace[];
  faceUvs: MeshFaceUv[];
  vertexChunks: Cell[];
  faceChunks: Cell[];
  faceUvChunks: Cell[];
  modelHash: bigint;
  meshHash: bigint;
  sourceName: string;
  truncatedFaces: number;
  surfaceSamples: number;
}

export interface CompiledTexture {
  width: number;
  height: number;
  chunks: Cell[];
  textureHash: bigint;
  sourceName: string;
}

export interface CompiledMeshShard {
  shardIndex: number;
  sourceFaceIndices: number[];
  vertices: MeshVertex[];
  faces: MeshFace[];
  faceUvs: MeshFaceUv[];
  vertexChunks: Cell[];
  faceChunks: Cell[];
  faceUvChunks: Cell[];
  modelHash: bigint;
  meshHash: bigint;
  sourceName: string;
}

export interface RenderBand {
  width: number;
  height: number;
  y0: number;
  rows: number;
  bpp: number;
  pixels: Uint8Array;
}

export interface RenderPoint {
  x: number;
  y: number;
  z: number;
  color: number;
}

export interface RenderPointBatch {
  width: number;
  height: number;
  start: number;
  count: number;
  stride: number;
  points: RenderPoint[];
}

export interface RenderPatch {
  canvasWidth: number;
  canvasHeight: number;
  x0: number;
  y0: number;
  width: number;
  height: number;
  bpp: number;
  pixels: Uint8Array;
}

const VERTICES_PER_CHUNK = 16;
const FACES_PER_CHUNK = 16;
const FACE_UVS_PER_CHUNK = 16;
const TEXTURE_BYTES_PER_CHUNK = 120;
const RENDER_MAGIC = 0x52334431;
const POINTS_MAGIC = 0x50334431;
const PATCH_MAGIC = 0x54334431;
const QUANTIZED_RADIUS = 4096;
const TEXTURE_SIZE = 64;
const MAX_FACE_INDEX = 65535;

const SAMPLE_OBJ = `# cube
v -1 -1 -1
v 1 -1 -1
v 1 1 -1
v -1 1 -1
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 2/2 3/3 4/4
f 5/1 8/2 7/3 6/4
f 1/1 5/2 6/3 2/4
f 2/1 6/2 7/3 3/4
f 3/1 7/2 8/3 4/4
f 5/1 1/2 4/3 8/4
`;

export function sampleObj(): string {
  return SAMPLE_OBJ;
}

export async function compileObjToMesh(
  source: string,
  sourceName: string,
  maxVertices = 100000,
  maxFaces = 4096,
): Promise<CompiledMesh> {
  const rawVertices: MeshVertex[] = [];
  const rawUvs: Array<{ u: number; v: number }> = [];
  const triangles: Array<{
    vertices: [number, number, number];
    uvs: [number | null, number | null, number | null];
  }> = [];

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [kind, ...parts] = trimmed.split(/\s+/);
    if (kind === 'v' && parts.length >= 3) {
      rawVertices.push({
        x: Number.parseFloat(parts[0] ?? '0'),
        y: Number.parseFloat(parts[1] ?? '0'),
        z: Number.parseFloat(parts[2] ?? '0'),
      });
      continue;
    }

    if (kind === 'vt' && parts.length >= 2) {
      rawUvs.push({
        u: Number.parseFloat(parts[0] ?? '0'),
        v: Number.parseFloat(parts[1] ?? '0'),
      });
      continue;
    }

    if (kind === 'f' && parts.length >= 3) {
      const face = parts
        .map((part) =>
          parseObjFaceToken(part, rawVertices.length, rawUvs.length),
        )
        .filter((part): part is ObjFaceToken => part !== null);

      for (let i = 1; i + 1 < face.length; i += 1) {
        triangles.push({
          vertices: [face[0]!.vertex, face[i]!.vertex, face[i + 1]!.vertex],
          uvs: [face[0]!.uv, face[i]!.uv, face[i + 1]!.uv],
        });
      }
    }
  }

  if (!rawVertices.length) {
    throw new Error('OBJ must contain at least one vertex.');
  }

  const normalized = normalizeVertices(rawVertices);
  const originalVertices = normalized.slice(0, maxVertices);
  const vertices = addSurfaceSamples(
    originalVertices,
    normalized,
    triangles,
    maxVertices,
  );
  const faces: MeshFace[] = [];
  const faceUvs: MeshFaceUv[] = [];
  let skippedFaces = 0;

  for (const triangle of triangles) {
    if (faces.length >= maxFaces) {
      skippedFaces += 1;
      continue;
    }

    const [a, b, c] = triangle.vertices;
    if (
      a >= vertices.length ||
      b >= vertices.length ||
      c >= vertices.length ||
      a >= originalVertices.length ||
      b >= originalVertices.length ||
      c >= originalVertices.length ||
      a > MAX_FACE_INDEX ||
      b > MAX_FACE_INDEX ||
      c > MAX_FACE_INDEX
    ) {
      skippedFaces += 1;
      continue;
    }
    if (a === b || b === c || a === c) {
      skippedFaces += 1;
      continue;
    }

    faces.push({
      a,
      b,
      c,
      color: 96 + ((faces.length * 37) % 144),
    });
    faceUvs.push(makeFaceUv(triangle, rawUvs, rawVertices));
  }

  const vertexChunks = packVertices(vertices);
  const faceChunks = packFaces(faces);
  const faceUvChunks = packFaceUvs(faceUvs);
  const meshBytes = encodeMeshBytes(vertices, faces, faceUvs);

  return {
    vertices,
    faces,
    faceUvs,
    vertexChunks,
    faceChunks,
    faceUvChunks,
    modelHash: await sha256BigInt(new TextEncoder().encode(source)),
    meshHash: await sha256BigInt(meshBytes),
    sourceName,
    truncatedFaces: skippedFaces,
    surfaceSamples: vertices.length - originalVertices.length,
  };
}

export async function splitMeshIntoFaceShards(
  mesh: CompiledMesh,
  maxFacesPerShard = 32,
): Promise<CompiledMeshShard[]> {
  const safeFacesPerShard = Math.max(1, Math.min(4096, maxFacesPerShard));
  const orderedFaces = mesh.faces
    .map((face, index) => ({
      face,
      uv: mesh.faceUvs[index] ?? defaultFaceUv(),
      sourceIndex: index,
      averageZ:
        ((mesh.vertices[face.a]?.z ?? 0) +
          (mesh.vertices[face.b]?.z ?? 0) +
          (mesh.vertices[face.c]?.z ?? 0)) /
        3,
    }))
    .sort((a, b) => a.averageZ - b.averageZ);

  const shards: CompiledMeshShard[] = [];
  for (
    let offset = 0;
    offset < orderedFaces.length;
    offset += safeFacesPerShard
  ) {
    const entries = orderedFaces.slice(offset, offset + safeFacesPerShard);
    const localVertices: MeshVertex[] = [];
    const localFaces: MeshFace[] = [];
    const localUvs: MeshFaceUv[] = [];
    const sourceFaceIndices: number[] = [];
    const vertexMap = new Map<number, number>();

    const remapVertex = (sourceIndex: number) => {
      const existing = vertexMap.get(sourceIndex);
      if (existing !== undefined) return existing;
      const vertex = mesh.vertices[sourceIndex];
      if (!vertex) return null;
      const localIndex = localVertices.length;
      vertexMap.set(sourceIndex, localIndex);
      localVertices.push(vertex);
      return localIndex;
    };

    for (const entry of entries) {
      const a = remapVertex(entry.face.a);
      const b = remapVertex(entry.face.b);
      const c = remapVertex(entry.face.c);
      if (a === null || b === null || c === null) continue;

      localFaces.push({
        a,
        b,
        c,
        color: entry.face.color,
      });
      localUvs.push(entry.uv);
      sourceFaceIndices.push(entry.sourceIndex);
    }

    if (!localFaces.length) continue;

    const vertexChunks = packVertices(localVertices);
    const faceChunks = packFaces(localFaces);
    const faceUvChunks = packFaceUvs(localUvs);
    const meshBytes = encodeMeshBytes(localVertices, localFaces, localUvs);

    shards.push({
      shardIndex: shards.length,
      sourceFaceIndices,
      vertices: localVertices,
      faces: localFaces,
      faceUvs: localUvs,
      vertexChunks,
      faceChunks,
      faceUvChunks,
      modelHash: mesh.modelHash,
      meshHash: await sha256BigInt(meshBytes),
      sourceName: `${mesh.sourceName}#shard-${shards.length}`,
    });
  }

  return shards;
}

export async function compileTextureFile(file: File): Promise<CompiledTexture> {
  const bitmap = await createImageBitmap(file);
  const size = TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();

  const rgba = ctx.getImageData(0, 0, size, size).data;
  return compileTextureFromRgba(size, size, rgba, file.name);
}

export async function compileTextureFromRgba(
  sourceWidth: number,
  sourceHeight: number,
  rgba: Uint8Array | Uint8ClampedArray,
  sourceName: string,
): Promise<CompiledTexture> {
  const size = TEXTURE_SIZE;
  const gray = new Uint8Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor(((y + 0.5) * sourceHeight) / size),
    );
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(
        sourceWidth - 1,
        Math.floor(((x + 0.5) * sourceWidth) / size),
      );
      const src = (sourceY * sourceWidth + sourceX) * 4;
      gray[y * size + x] = Math.round(
        (rgba[src] ?? 0) * 0.299 +
          (rgba[src + 1] ?? 0) * 0.587 +
          (rgba[src + 2] ?? 0) * 0.114,
      );
    }
  }

  return {
    width: size,
    height: size,
    chunks: packTexture(gray),
    textureHash: await sha256BigInt(gray),
    sourceName,
  };
}

export function decodeRenderCell(cell: Cell): RenderBand {
  const s = cell.beginParse();
  const magic = s.loadUint(32);
  if (magic !== RENDER_MAGIC) {
    throw new Error(`Unexpected render magic: 0x${magic.toString(16)}`);
  }

  const width = s.loadUint(16);
  const height = s.loadUint(16);
  const y0 = s.loadUint(16);
  const rows = s.loadUint(16);
  const bpp = s.loadUint(8);
  if (bpp !== 8) throw new Error(`Unsupported bpp: ${bpp}`);

  const pixels = new Uint8Array(width * rows);
  readByteChain(s.loadRef(), pixels);

  return { width, height, y0, rows, bpp, pixels };
}

export function decodeRenderPointsCell(cell: Cell): RenderPointBatch {
  const s = cell.beginParse();
  const magic = s.loadUint(32);
  if (magic !== POINTS_MAGIC) {
    throw new Error(`Unexpected point magic: 0x${magic.toString(16)}`);
  }

  const width = s.loadUint(16);
  const height = s.loadUint(16);
  const start = s.loadUint(32);
  const count = s.loadUint(16);
  const stride = s.loadUint(8);
  if (stride !== 7) throw new Error(`Unsupported point stride: ${stride}`);

  const points: RenderPoint[] = [];
  let next: Cell | null = s.loadRef();

  while (next && points.length < count) {
    const chunk = next.beginParse();
    while (chunk.remainingBits >= 56 && points.length < count) {
      points.push({
        x: Number(chunk.loadIntBig(16)),
        y: Number(chunk.loadIntBig(16)),
        z: Number(chunk.loadIntBig(16)),
        color: chunk.loadUint(8),
      });
    }
    next = chunk.remainingRefs > 0 ? chunk.loadRef() : null;
  }

  return { width, height, start, count, stride, points };
}

export function decodeRenderPatchCell(cell: Cell): RenderPatch {
  const s = cell.beginParse();
  const magic = s.loadUint(32);
  if (magic !== PATCH_MAGIC) {
    throw new Error(`Unexpected patch magic: 0x${magic.toString(16)}`);
  }

  const canvasWidth = s.loadUint(16);
  const canvasHeight = s.loadUint(16);
  const x0 = s.loadUint(16);
  const y0 = s.loadUint(16);
  const width = s.loadUint(16);
  const height = s.loadUint(16);
  const bpp = s.loadUint(8);
  if (bpp !== 8) throw new Error(`Unsupported patch bpp: ${bpp}`);

  const pixels = new Uint8Array(width * height);
  readByteChain(s.loadRef(), pixels);

  return { canvasWidth, canvasHeight, x0, y0, width, height, bpp, pixels };
}

type ObjFaceToken = {
  vertex: number;
  uv: number | null;
};

function parseObjFaceToken(
  token: string,
  vertexCount: number,
  uvCount: number,
): ObjFaceToken | null {
  const [vertexRaw, uvRaw] = token.split('/');
  const vertex = parseObjIndex(vertexRaw ?? '', vertexCount);
  if (vertex === null) return null;

  return {
    vertex,
    uv: uvRaw ? parseObjIndex(uvRaw, uvCount) : null,
  };
}

function parseObjIndex(token: string, itemCount: number): number | null {
  const raw = Number.parseInt(token, 10);
  if (!Number.isFinite(raw) || raw === 0) return null;
  const index = raw > 0 ? raw - 1 : itemCount + raw;
  return index >= 0 && index < itemCount ? index : null;
}

function normalizeVertices(vertices: MeshVertex[]): MeshVertex[] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const scale = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);

  return vertices.map((vertex) => ({
    x: clampInt16(Math.round(((vertex.x - cx) / scale) * QUANTIZED_RADIUS)),
    y: clampInt16(Math.round(((vertex.y - cy) / scale) * QUANTIZED_RADIUS)),
    z: clampInt16(Math.round(((vertex.z - cz) / scale) * QUANTIZED_RADIUS)),
  }));
}

function addSurfaceSamples(
  baseVertices: MeshVertex[],
  normalizedVertices: MeshVertex[],
  triangles: Array<{
    vertices: [number, number, number];
    uvs: [number | null, number | null, number | null];
  }>,
  maxVertices: number,
): MeshVertex[] {
  if (baseVertices.length >= maxVertices || triangles.length === 0) {
    return baseVertices;
  }

  const vertices = [...baseVertices];
  const sampleWeights: Array<[number, number, number]> = [
    [1, 1, 1],
    [2, 1, 1],
    [1, 2, 1],
    [1, 1, 2],
    [2, 2, 1],
    [1, 2, 2],
    [2, 1, 2],
  ];

  for (const weights of sampleWeights) {
    for (const triangle of triangles) {
      if (vertices.length >= maxVertices) return vertices;

      const [aIndex, bIndex, cIndex] = triangle.vertices;
      const a = normalizedVertices[aIndex];
      const b = normalizedVertices[bIndex];
      const c = normalizedVertices[cIndex];
      if (!a || !b || !c) continue;
      if (aIndex === bIndex || bIndex === cIndex || aIndex === cIndex) continue;

      vertices.push(interpolateVertex(a, b, c, weights));
    }
  }

  return vertices;
}

function interpolateVertex(
  a: MeshVertex,
  b: MeshVertex,
  c: MeshVertex,
  weights: [number, number, number],
): MeshVertex {
  const total = weights[0] + weights[1] + weights[2];
  return {
    x: clampInt16(
      Math.round(
        (a.x * weights[0] + b.x * weights[1] + c.x * weights[2]) / total,
      ),
    ),
    y: clampInt16(
      Math.round(
        (a.y * weights[0] + b.y * weights[1] + c.y * weights[2]) / total,
      ),
    ),
    z: clampInt16(
      Math.round(
        (a.z * weights[0] + b.z * weights[1] + c.z * weights[2]) / total,
      ),
    ),
  };
}

function makeFaceUv(
  triangle: {
    vertices: [number, number, number];
    uvs: [number | null, number | null, number | null];
  },
  rawUvs: Array<{ u: number; v: number }>,
  rawVertices: MeshVertex[],
): MeshFaceUv {
  const values = triangle.uvs.map((uvIndex, i) => {
    if (uvIndex !== null && rawUvs[uvIndex]) {
      return rawUvs[uvIndex]!;
    }
    const vertex = rawVertices[triangle.vertices[i]!] ?? { x: 0, y: 0 };
    return { u: (vertex.x + 1) / 2, v: 1 - (vertex.y + 1) / 2 };
  });

  return {
    u0: clampByte(Math.round(values[0]!.u * 255)),
    v0: clampByte(Math.round((1 - values[0]!.v) * 255)),
    u1: clampByte(Math.round(values[1]!.u * 255)),
    v1: clampByte(Math.round((1 - values[1]!.v) * 255)),
    u2: clampByte(Math.round(values[2]!.u * 255)),
    v2: clampByte(Math.round((1 - values[2]!.v) * 255)),
  };
}

function defaultFaceUv(): MeshFaceUv {
  return {
    u0: 0,
    v0: 255,
    u1: 255,
    v1: 255,
    u2: 128,
    v2: 0,
  };
}

function packVertices(vertices: MeshVertex[]): Cell[] {
  const chunks: Cell[] = [];
  for (let i = 0; i < vertices.length; i += VERTICES_PER_CHUNK) {
    const builder = beginCell();
    for (const vertex of vertices.slice(i, i + VERTICES_PER_CHUNK)) {
      builder.storeInt(vertex.x, 16);
      builder.storeInt(vertex.y, 16);
      builder.storeInt(vertex.z, 16);
    }
    chunks.push(builder.endCell());
  }
  return chunks;
}

function packFaces(faces: MeshFace[]): Cell[] {
  const chunks: Cell[] = [];
  for (let i = 0; i < faces.length; i += FACES_PER_CHUNK) {
    const builder = beginCell();
    for (const face of faces.slice(i, i + FACES_PER_CHUNK)) {
      builder.storeUint(face.a, 16);
      builder.storeUint(face.b, 16);
      builder.storeUint(face.c, 16);
      builder.storeUint(face.color, 8);
    }
    chunks.push(builder.endCell());
  }
  return chunks;
}

function packFaceUvs(faceUvs: MeshFaceUv[]): Cell[] {
  const chunks: Cell[] = [];
  for (let i = 0; i < faceUvs.length; i += FACE_UVS_PER_CHUNK) {
    const builder = beginCell();
    for (const uv of faceUvs.slice(i, i + FACE_UVS_PER_CHUNK)) {
      builder.storeUint(uv.u0, 8);
      builder.storeUint(uv.v0, 8);
      builder.storeUint(uv.u1, 8);
      builder.storeUint(uv.v1, 8);
      builder.storeUint(uv.u2, 8);
      builder.storeUint(uv.v2, 8);
    }
    chunks.push(builder.endCell());
  }
  return chunks;
}

function packTexture(bytes: Uint8Array): Cell[] {
  const chunks: Cell[] = [];
  for (let i = 0; i < bytes.length; i += TEXTURE_BYTES_PER_CHUNK) {
    const builder = beginCell();
    for (const value of bytes.slice(i, i + TEXTURE_BYTES_PER_CHUNK)) {
      builder.storeUint(value, 8);
    }
    chunks.push(builder.endCell());
  }
  return chunks;
}

function readByteChain(root: Cell, out: Uint8Array) {
  let offset = 0;
  let next: Cell | null = root;

  while (next && offset < out.length) {
    const chunk = next.beginParse();
    while (chunk.remainingBits >= 8 && offset < out.length) {
      out[offset] = chunk.loadUint(8);
      offset += 1;
    }
    next = chunk.remainingRefs > 0 ? chunk.loadRef() : null;
  }
}

function encodeMeshBytes(
  vertices: MeshVertex[],
  faces: MeshFace[],
  faceUvs: MeshFaceUv[],
): Uint8Array {
  const bytes = new Uint8Array(
    vertices.length * 6 + faces.length * 7 + faceUvs.length * 6,
  );
  const view = new DataView(bytes.buffer);
  let offset = 0;

  for (const vertex of vertices) {
    view.setInt16(offset, vertex.x);
    view.setInt16(offset + 2, vertex.y);
    view.setInt16(offset + 4, vertex.z);
    offset += 6;
  }

  for (const face of faces) {
    view.setUint16(offset, face.a);
    view.setUint16(offset + 2, face.b);
    view.setUint16(offset + 4, face.c);
    view.setUint8(offset + 6, face.color);
    offset += 7;
  }

  for (const uv of faceUvs) {
    view.setUint8(offset, uv.u0);
    view.setUint8(offset + 1, uv.v0);
    view.setUint8(offset + 2, uv.u1);
    view.setUint8(offset + 3, uv.v1);
    view.setUint8(offset + 4, uv.u2);
    view.setUint8(offset + 5, uv.v2);
    offset += 6;
  }

  return bytes;
}

async function sha256BigInt(bytes: Uint8Array): Promise<bigint> {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  const hex = [...hash]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return BigInt(`0x${hex}`);
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
