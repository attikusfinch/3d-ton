# TON Onchain Renderer Spec

This document describes the current architecture of the TON Onchain Renderer
project: how the contracts store a model, how rendering is executed in TVM, and
what the frontend is allowed to do before and after the on-chain calls.

## Goal

TON Onchain Renderer is an experiment in running the actual 3D render step in a
TON smart contract.

The frontend does not render triangles by itself. Its job is to:

- load OBJ and texture files;
- compile them into compact fixed-point cells;
- optimize the mesh for the selected camera;
- upload chunks to the contract;
- call get-methods;
- decode returned pixels and draw them to a canvas.

The contract owns the canonical scene data after upload. Projection,
triangle coverage, texture sampling, and pixel generation happen inside TVM
get-methods.

## Project Layout

- `contracts/src/types.tolk` defines shared storage, messages, structs, limits,
  and packed data constants.
- `contracts/src/OnchainRenderer.tolk` is the main renderer contract.
- `contracts/src/OnchainRendererShard.tolk` is a child/worker contract for
  smaller face sets and tiled triangle rendering.
- `contracts/tests/contract.test.tolk` covers deploy, upload, commit, render,
  texture, limits, and rejection paths.
- `app/src/lib/mesh.ts` parses OBJ, quantizes geometry, packs cells, compiles
  textures, decodes render outputs, and can split meshes into shards.
- `app/src/lib/onchainRenderer.ts` creates contracts, generated-wrapper
  payloads, camera fitting, TonConnect uploads, and PRO seed wallet uploads.
- `app/src/App.tsx` is the UI and render orchestration layer.
- `scripts/render-local.mjs` and `scripts/render-shards-local.mjs` render
  models in local sandbox-style flows and write PNG artifacts.

## Contracts

### `OnchainRenderer`

`OnchainRenderer` is the root renderer contract. It can store a chunked model,
optional UVs and texture chunks, camera, limits, and a deploy seed.

The deployed address is derived from code plus storage. The frontend stores a
`seed:uint32` in initial storage so the same wallet can deploy a fresh contract
address by changing the seed.

Current storage shape:

```text
owner: address
seed: uint32
canvasWidth: uint16
canvasHeight: uint16
maxVertices: uint32
maxFaces: uint16
camera: Camera
vertexChunks: map<uint16, cell>
faceChunks: map<uint16, cell>
model: Cell<RendererModel>
assets: Cell<RendererAssets>
isCommitted: bool
```

`RendererModel` stores the committed mesh metadata and upload counters:

```text
vertexCount: uint32
faceCount: uint16
modelHash: uint256
meshHash: uint256
vertexChunkTotal: uint16
vertexChunksUploaded: uint16
faceChunkTotal: uint16
faceChunksUploaded: uint16
```

`RendererAssets` stores optional texture/UV state:

```text
textureWidth: uint16
textureHeight: uint16
textureHash: uint256
faceUvChunkTotal: uint16
faceUvChunksUploaded: uint16
textureChunkTotal: uint16
textureChunksUploaded: uint16
faceUvChunks: map<uint16, cell>
textureChunks: map<uint16, cell>
isTextureCommitted: bool
```

### `OnchainRendererShard`

`OnchainRendererShard` uses the same shared storage/messages, but is intended as
a smaller worker contract. A worker stores only a local subset of vertices,
faces, UVs, and texture chunks needed for that subset.

The implemented get-method on the shard is `renderFacePatch`. The local script
`scripts/render-shards-local.mjs` demonstrates the worker model:

1. split a mesh into face shards;
2. locally reindex vertices per shard;
3. upload only the shard faces/vertices/UVs;
4. upload only texture chunks touched by that shard;
5. call `renderFacePatch` on each shard;
6. composite non-zero returned pixels in painter order on the frontend side.

The current web UI primarily uses the root `OnchainRenderer` patch path. The
shard contract exists for pushing capacity further when the root contract
becomes too expensive or too slow.

## Data Formats

All on-chain geometry uses integer/fixed-point data. The contract does not use
floating point.

### Camera

```text
Camera {
  yaw: int16
  pitch: int16
  roll: int16
  zoom: int16
  tx: int16
  ty: int16
  tz: int16
}
```

Angles are stored in degrees. The contract approximates sine/cosine with
integer math scaled by 512.

### Vertex

```text
x:int16, y:int16, z:int16
```

Each vertex is 48 bits. A vertex chunk stores up to 16 vertices.

### Face

```text
a:uint16, b:uint16, c:uint16, color:uint8
```

Each face is 56 bits. A face chunk stores up to 16 faces.

Face indices are `uint16`, so one triangle mesh cannot reference more than
65,535 indexed vertices unless it is split into shard/worker contracts with
local reindexing.

### Face UV

```text
u0:uint8, v0:uint8, u1:uint8, v1:uint8, u2:uint8, v2:uint8
```

Each face UV record is 48 bits. A face UV chunk stores up to 16 records.

### Texture

Textures are compiled by the frontend to a fixed `128x128` RGB565 atlas:

```text
width: 128
height: 128
format: rgb565
bytes per texel: 2
bytes per chunk: 120
max pixels: 16384
```

Root upload currently sends the texture atlas chunks used by the root payload
builder. Shard upload can send only the sparse texture chunks touched by that
shard's UV bounding boxes.

## Messages

Only `owner` can mutate the contract. Any non-owner upload/control message
throws `Errors.NotOwner = 100`.

Supported messages:

```text
UploadVertexChunk(index, total, data)
UploadFaceChunk(index, total, data)
CommitModel(vertexCount, faceCount, modelHash, meshHash)
SetCamera(camera)
ClearModel()
SetLimits(canvasWidth, canvasHeight, maxVertices, maxFaces)
Withdraw(to, amount)
UploadFaceUvChunk(index, total, data)
UploadTextureChunk(index, total, data)
CommitTexture(width, height, textureHash)
ClearTexture()
```

Important validation:

- chunk `total` must be positive;
- chunk `index` must be `< total`;
- chunk cells must have no refs;
- packed bit length must match the item size;
- per-chunk item count must not exceed 16 for vertices/faces/UVs;
- texture chunks store up to 120 bytes;
- `CommitModel` requires all required vertex and face chunks;
- `CommitModel` allows optional UVs, but if UV upload started, all required UV
  chunks must be present;
- `CommitTexture` requires valid texture dimensions and at least one uploaded
  texture chunk;
- `SetLimits` clears the current model because old chunks may no longer fit.

Common exit codes:

```text
100 - NotOwner
101 - InvalidChunk
102 - InvalidCommit
103 - NotCommitted
104 - InvalidLimits
0xffff - InvalidMessage
```

## Get Methods

### `config()`

Returns:

```text
canvasWidth, canvasHeight, maxVertices, maxFaces, seed, isCommitted
```

### `modelInfo()`

Returns:

```text
vertexCount, faceCount, modelHash, meshHash, isCommitted
```

### `textureInfo()`

Returns:

```text
textureWidth, textureHeight, textureHash, isTextureCommitted
```

### `camera()`

Returns the current fixed-point camera.

### `renderPreview()`

Calls `renderRows` for the first default-height rows. This is kept mostly as an
MVP compatibility method.

### `renderRows(y0, rows)`

Renders a row band in the root contract and returns 8-bit indexed pixels:

```text
magic: "R3D1"
width:uint16
height:uint16
y0:uint16
rows:uint16
bpp:uint8 = 8
packedPixels: ref chain, 120 pixels per cell
```

This path checks every relevant vertex/face for every requested pixel. It is
useful for 32x32-style MVP renders and compatibility, but large 512x512
triangle scenes often exceed TVM get-method gas.

### `renderPoints(start, count)`

Projects vertex batches and returns point records:

```text
magic: "P3D1"
width:uint16
height:uint16
start:uint32
count:uint16
stride:uint8 = 7
points: ref chain of x:int16, y:int16, z:int16, color:uint8
```

`count` is capped at 512. This is the current path that can handle up to 100k
vertices as an on-chain point renderer.

### `renderFacePatch(faceIndex, x0, y0, width, height)`

Renders one triangle into one rectangular patch:

```text
magic: "T3D1"
canvasWidth:uint16
canvasHeight:uint16
x0:uint16
y0:uint16
width:uint16
height:uint16
bpp:uint8 = 16
packedPixels: ref chain, 60 RGB565 pixels per cell
```

The contract:

1. loads the requested face;
2. loads its three vertices;
3. projects vertices using the stored camera;
4. loads UVs or a default UV triangle;
5. checks each patch pixel with integer edge functions;
6. samples RGB565 texture with barycentric integer interpolation when texture
   is committed;
7. otherwise converts the face's RGB332 color to RGB565;
8. returns zero for transparent/background pixels.

The frontend computes each face's projected bounding box and only requests
patches that cover that box. If a patch get-method returns TVM out-of-gas
(`exit_code: -14`), the frontend recursively splits the patch into smaller
rectangles and retries.

## Frontend Pipeline

### 1. Load OBJ

`compileObjToMesh` parses:

- `v` vertex records;
- `vt` UV records;
- `f` faces.

Polygons are fan-triangulated. Vertices are normalized to a centered fixed-point
cube with radius `4096`, then clamped to `int16`.

The compiler stores:

- raw source hash as `modelHash`;
- packed mesh hash as `meshHash`;
- vertex chunks;
- face chunks;
- face UV chunks;
- skipped/truncated face count;
- generated surface point samples for point-renderer density.

### 2. Load Texture

`compileTextureFile` draws the image into a browser canvas, resizes it to
`128x128`, converts RGBA to RGB565, and packs it into 120-byte cells.

### 3. Choose Camera

The UI exposes camera presets:

```text
Front: yaw 0, pitch 0
Right Corner: yaw 35, pitch 18
Left Corner: yaw -35, pitch 18
Top Right: yaw 42, pitch 32
Top Left: yaw -42, pitch 32
```

`fitCameraForView` projects all vertices with the preset, computes the 2D bounds,
adds an 8 percent margin, and derives `zoom`, `tx`, and `ty` so the model fits
the selected canvas resolution.

### 4. Optimize Mesh For Camera

Before upload, `App.tsx` optimizes the source mesh for the current camera and
resolution:

- projects each face using the same integer camera math as the contract;
- drops degenerate faces;
- drops faces fully outside the viewport;
- estimates winding direction;
- if winding is clear, keeps the dominant visible side;
- if winding is ambiguous, keeps both directions to avoid deleting real model
  parts;
- sorts kept faces by average camera-space z in ascending order for painter
  compositing;
- compacts/reindexes vertices so unused vertices are not uploaded.

The dashboard shows source counts, uploaded counts, culled faces, offscreen
faces, backface faces, degenerate faces, estimated messages, and estimated TON.

Changing camera or resolution invalidates the uploaded mesh. The user must
upload again so the on-chain mesh matches the selected view.

### 5. Upload

The upload payload order is:

1. `SetLimits`
2. `SetCamera`
3. texture chunks or `ClearTexture`
4. `CommitTexture` when texture exists
5. vertex chunks
6. face chunks
7. face UV chunks
8. `CommitModel`

Payload cells are generated with Acton TypeScript wrappers, not manually built
byte strings where wrappers exist.

### 6. Render

If `faceCount == 0`, the frontend calls `renderPoints` in batches and draws
points.

If `faceCount > 0`, the frontend calls `renderFacePatch` per face and per
projected patch, then composites all non-zero RGB565 pixels onto a canvas. The
frontend does not compute triangle coverage or texture sampling; it only places
the patch returned by TVM.

## Wallet Modes

### TonConnect Mode

Normal deploy/upload uses the connected wallet through TonConnect. The app reads
the wallet's advertised `SendTransaction` limit and caps batches for bridge
stability.

The app also keeps sequential control messages such as `SetLimits`,
`CommitTexture`, and `CommitModel` in separate batches so commits are not sent
before their chunks.

### PRO Seed Mode

PRO mode is for development with a burner wallet seed phrase.

`createProWalletContext` derives a W5R1 wallet from the mnemonic and sends
internal messages directly from the browser. It batches up to 255 internal
messages per wallet transfer and waits for seqno confirmation between batches.

Security rule: PRO mode must use a burner wallet only. The seed is typed into
the browser and should never be a main wallet seed.

Important ownership rule: if upload is done with PRO mode, the contract must
also be deployed with PRO mode, because the contract checks that every upload
message sender equals `owner`.

## Capacity Notes

Current hard limits:

```text
canvasWidth <= 512
canvasHeight <= 512
maxVertices <= 100000
maxFaces <= 4096
texture pixels <= 16384
renderPoints count <= 512
renderFacePatch pixels <= 4096 by contract
frontend initial render patch <= 1024 pixels
frontend retry patch minimum = 64 pixels
```

Practical interpretation:

- 100k vertices are realistic only for point rendering.
- Full triangle rendering is constrained by face count, patch count, RPC rate,
  and TVM get-method gas.
- 512x512 renders must use `renderFacePatch`, not full `renderRows`.
- Large visual quality improvements come from better face optimization,
  sharding, painter ordering, sparse texture upload, and fewer but larger
  meaningful triangles.
- Huge models should be simplified on the frontend before upload.

## Costs

Rendering get-methods are off-chain RPC calls and do not write storage, so they
do not cost TON directly.

TON cost comes from:

- deploy message;
- chunk upload messages;
- commit/control messages;
- storage rent for contract state;
- extra shard/worker contracts when used.

The UI estimates upload cost from message count and configured per-message
values. It is an estimate, not a chain quote. Real cost depends on action fees,
storage growth, bounced messages, wallet fees, and network conditions.

Reducing cost means reducing uploaded cells:

- cull offscreen/hidden faces before upload;
- compact vertices after culling;
- send only required texture chunks where possible;
- lower texture size;
- reduce face count;
- split to worker contracts only when the root path cannot handle the model.

## Known Tradeoffs

- Painter ordering is approximate. There is no full z-buffer in the contract.
- Texture mapping uses integer barycentric interpolation and nearest-like
  sampling.
- Root `renderRows` is intentionally kept but is not the preferred high-res
  triangle path.
- Shards improve per-contract work but add deployment/upload/storage overhead.
- The frontend must keep the same local optimized mesh that was uploaded, or
  patch bounds may not match the committed on-chain model.

## Local Verification

Build and test contracts from WSL/Linux:

```bash
source $HOME/.acton/bin/env
acton build
acton test
```

Build the frontend:

```bash
npm run typecheck
npm run lint
npm run build
```

Render a local sharded PNG:

```bash
CAMERA_YAW=-35 CAMERA_PITCH=18 CANVAS_SIZE=512 npm run render:shards -- "test-model/redo/tripo_convert_4fcbea6d-7521-48b9-8227-04bd5847a56d.obj"
```

Set `TEXTURE_PATH` when the model texture is not the default local test texture.
