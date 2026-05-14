# TON Onchain Renderer

Acton + React MVP for a TON on-chain 3D renderer. The frontend compiles OBJ files
to a compact fixed-point mesh, uploads that mesh in chunks, and calls
`renderRows()` / `renderPoints()` get-methods. Pixel generation and point
projection run in the `OnchainRenderer` contract.

See [`SPEC.md`](SPEC.md) for the full system and contract spec.

## Contract

- `contracts/src/OnchainRenderer.tolk` stores owner, limits, camera, model
  metadata, vertex chunks, face chunks, UV chunks, and texture chunks.
- Vertices are packed as `x:int16, y:int16, z:int16`.
- Faces are packed as `a:uint16, b:uint16, c:uint16, color:uint8`.
- Face UVs are packed as six `uint8` values. Textures are committed as 64x64
  grayscale byte chunks for the MVP.
- `renderRows(y0, rows)` returns `R3D1` header data plus an 8-bit pixel snake
  cell chain.
- `renderPoints(start, count)` returns `P3D1` projected point batches for large
  models. The default cap is 100k vertices and 512 points per get-method.
- MVP rendering covers points, wireframe triangle edges, small flat/textured
  triangles, and integer-only math.

## Frontend

- `app/src/lib/mesh.ts` parses OBJ, triangulates polygons, normalizes and
  quantizes vertices, packs mesh/UV/texture chunks, and decodes render cells.
- `app/src/lib/onchainRenderer.ts` uses generated Acton TypeScript wrappers for
  deploy, payload creation, upload batches, and get-method calls.
- `app/src/App.tsx` provides deploy, sample/OBJ/texture compile, chunk upload,
  row rendering, point rendering, and canvas controls through TonConnect.

## Capacity Notes

- 100k vertices are supported as an on-chain point renderer path.
- Triangle faces still use `uint16` vertex indices, so high-poly triangle meshes
  above 65,535 indexed vertices need shard/worker contracts with local reindexing.
- W5 wallets can batch up to 255 internal messages when the wallet advertises
  that TonConnect limit; the app reads that feature and sizes upload batches.

## Setup

Acton should be installed in WSL/Linux. Node.js 22+ is required for the frontend.

```bash
source $HOME/.acton/bin/env
npm ci
```

## Commands

```bash
acton build
acton test
acton check
acton wrapper --all
acton wrapper --all --ts

npm run typecheck
npm run lint
npm run build
npm run dev
```
