import "types"

contract OnchainRenderer {
    author: "Acton User"
    version: "0.1.0"
    description: "Chunked on-chain 3D point and wireframe renderer"
    storage: Storage
    incomingMessages: AllowedMessage
}

type AllowedMessage =
    | UploadVertexChunk
    | UploadFaceChunk
    | CommitModel
    | SetCamera
    | ClearModel
    | SetLimits
    | Withdraw
    | UploadFaceUvChunk
    | UploadTextureChunk
    | CommitTexture
    | ClearTexture

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        UploadVertexChunk => {
            var storage = lazy Storage.load();
            var model = storage.model.load();
            assertOwner(in.senderAddress, storage.owner);
            assertChunkMeta(msg.index, msg.total);
            assert (
                msg.total <= ceilDiv(storage.maxVertices, VERTICES_PER_CHUNK)
            ) throw Errors.InvalidChunk;
            assertChunkPayload(msg.data, VERTEX_BITS, VERTICES_PER_CHUNK);

            var chunks = storage.vertexChunks;
            val isNew = !chunks.exists(msg.index);
            chunks.set(msg.index, msg.data);
            storage.vertexChunks = chunks;
            if (isNew) {
                model.vertexChunksUploaded = model.vertexChunksUploaded + 1;
            }
            model.vertexChunkTotal = msg.total;
            storage.model = model.toCell();
            storage.isCommitted = false;
            storage.save();
        }
        UploadFaceChunk => {
            var storage = lazy Storage.load();
            var model = storage.model.load();
            assertOwner(in.senderAddress, storage.owner);
            assertChunkMeta(msg.index, msg.total);
            assert (
                msg.total <= ceilDiv(storage.maxFaces, FACES_PER_CHUNK)
            ) throw Errors.InvalidChunk;
            assertChunkPayload(msg.data, FACE_BITS, FACES_PER_CHUNK);

            var chunks = storage.faceChunks;
            val isNew = !chunks.exists(msg.index);
            chunks.set(msg.index, msg.data);
            storage.faceChunks = chunks;
            if (isNew) {
                model.faceChunksUploaded = model.faceChunksUploaded + 1;
            }
            model.faceChunkTotal = msg.total;
            storage.model = model.toCell();
            storage.isCommitted = false;
            storage.save();
        }
        CommitModel => {
            var storage = lazy Storage.load();
            val assets = storage.assets.load();
            var model = storage.model.load();
            assertOwner(in.senderAddress, storage.owner);
            assert (msg.vertexCount > 0) throw Errors.InvalidCommit;
            assert (msg.vertexCount <= storage.maxVertices) throw Errors.InvalidCommit;
            assert (msg.faceCount <= storage.maxFaces) throw Errors.InvalidCommit;
            assertUploaded(
                model.vertexChunksUploaded,
                ceilDiv(msg.vertexCount, VERTICES_PER_CHUNK),
            );
            assertUploaded(model.faceChunksUploaded, ceilDiv(msg.faceCount, FACES_PER_CHUNK));
            assertOptionalUploaded(
                assets.faceUvChunksUploaded,
                ceilDiv(msg.faceCount, FACE_UVS_PER_CHUNK),
            );

            model.vertexCount = msg.vertexCount;
            model.faceCount = msg.faceCount;
            model.modelHash = msg.modelHash;
            model.meshHash = msg.meshHash;
            storage.model = model.toCell();
            storage.isCommitted = true;
            storage.save();
        }
        SetCamera => {
            var storage = lazy Storage.load();
            assertOwner(in.senderAddress, storage.owner);
            storage.camera = msg.camera;
            storage.save();
        }
        ClearModel => {
            var storage = lazy Storage.load();
            assertOwner(in.senderAddress, storage.owner);
            clearModel(mutate storage);
            storage.save();
        }
        SetLimits => {
            var storage = lazy Storage.load();
            assertOwner(in.senderAddress, storage.owner);
            assertLimits(msg.canvasWidth, msg.canvasHeight, msg.maxVertices, msg.maxFaces);
            storage.canvasWidth = msg.canvasWidth;
            storage.canvasHeight = msg.canvasHeight;
            storage.maxVertices = msg.maxVertices;
            storage.maxFaces = msg.maxFaces;
            clearModel(mutate storage);
            storage.save();
        }
        Withdraw => {
            val storage = lazy Storage.load();
            assertOwner(in.senderAddress, storage.owner);
            val out = createMessage({
                bounce: BounceMode.NoBounce,
                value: msg.amount,
                dest: msg.to,
            });
            out.send(SEND_MODE_REGULAR);
        }
        UploadFaceUvChunk => {
            var storage = lazy Storage.load();
            var assets = storage.assets.load();
            assertOwner(in.senderAddress, storage.owner);
            assertChunkMeta(msg.index, msg.total);
            assert (
                msg.total <= ceilDiv(storage.maxFaces, FACE_UVS_PER_CHUNK)
            ) throw Errors.InvalidChunk;
            assertChunkPayload(msg.data, FACE_UV_BITS, FACE_UVS_PER_CHUNK);

            var chunks = assets.faceUvChunks;
            val isNew = !chunks.exists(msg.index);
            chunks.set(msg.index, msg.data);
            assets.faceUvChunks = chunks;
            if (isNew) {
                assets.faceUvChunksUploaded = assets.faceUvChunksUploaded + 1;
            }
            assets.faceUvChunkTotal = msg.total;
            storage.assets = assets.toCell();
            storage.isCommitted = false;
            storage.save();
        }
        UploadTextureChunk => {
            var storage = lazy Storage.load();
            var assets = storage.assets.load();
            assertOwner(in.senderAddress, storage.owner);
            assertChunkMeta(msg.index, msg.total);
            assertChunkPayload(msg.data, 8, TEXTURE_BYTES_PER_CHUNK);

            var chunks = assets.textureChunks;
            val isNew = !chunks.exists(msg.index);
            chunks.set(msg.index, msg.data);
            assets.textureChunks = chunks;
            if (isNew) {
                assets.textureChunksUploaded = assets.textureChunksUploaded + 1;
            }
            assets.textureChunkTotal = msg.total;
            assets.isTextureCommitted = false;
            storage.assets = assets.toCell();
            storage.save();
        }
        CommitTexture => {
            var storage = lazy Storage.load();
            var assets = storage.assets.load();
            assertOwner(in.senderAddress, storage.owner);
            assertTextureLimits(msg.width, msg.height);
            val expectedChunks = ceilDiv(
                msg.width * msg.height * TEXTURE_BYTES_PER_TEXEL,
                TEXTURE_BYTES_PER_CHUNK,
            );
            assert (assets.textureChunkTotal == expectedChunks) throw Errors.InvalidCommit;
            assert (assets.textureChunksUploaded > 0) throw Errors.InvalidCommit;

            assets.textureWidth = msg.width;
            assets.textureHeight = msg.height;
            assets.textureHash = msg.textureHash;
            assets.isTextureCommitted = true;
            storage.assets = assets.toCell();
            storage.save();
        }
        ClearTexture => {
            var storage = lazy Storage.load();
            assertOwner(in.senderAddress, storage.owner);
            clearTexture(mutate storage);
            storage.save();
        }
        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun config(): (
    uint16,
    uint16,
    uint32,
    uint16,
    uint32,
    bool,
) {
    val storage = lazy Storage.load();
    return (
        storage.canvasWidth,
        storage.canvasHeight,
        storage.maxVertices,
        storage.maxFaces,
        storage.seed,
        storage.isCommitted,
    );
}

get fun modelInfo(): (uint32, uint16, uint256, uint256, bool) {
    val storage = lazy Storage.load();
    val model = storage.model.load();
    return (
        model.vertexCount,
        model.faceCount,
        model.modelHash,
        model.meshHash,
        storage.isCommitted,
    );
}

get fun textureInfo(): (uint16, uint16, uint256, bool) {
    val storage = lazy Storage.load();
    val assets = storage.assets.load();
    return (
        assets.textureWidth,
        assets.textureHeight,
        assets.textureHash,
        assets.isTextureCommitted,
    );
}

get fun camera(): Camera {
    val storage = lazy Storage.load();
    return storage.camera;
}

get fun renderPreview(): cell {
    val storage = lazy Storage.load();
    val rows = min(storage.canvasHeight, DEFAULT_CANVAS_HEIGHT);
    return renderRowsFromStorage(storage, 0, rows);
}

get fun renderRows(y0: uint16, rows: uint16): cell {
    val storage = lazy Storage.load();
    return renderRowsFromStorage(storage, y0, rows);
}

get fun renderPoints(start: uint32, count: uint16): cell {
    val storage = lazy Storage.load();
    return renderPointsFromStorage(storage, start, count);
}

fun assertOwner(sender: address, owner: address) {
    assert (sender == owner) throw Errors.NotOwner;
}

fun assertChunkMeta(index: uint16, total: uint16) {
    assert (total > 0) throw Errors.InvalidChunk;
    assert (index < total) throw Errors.InvalidChunk;
}

fun assertChunkPayload(data: cell, itemBits: int, maxItems: int) {
    val s = data.beginParse();
    val bits = s.remainingBitsCount();
    assert (s.remainingRefsCount() == 0) throw Errors.InvalidChunk;
    assert (bits > 0) throw Errors.InvalidChunk;
    assert (bits % itemBits == 0) throw Errors.InvalidChunk;
    assert (bits / itemBits <= maxItems) throw Errors.InvalidChunk;
}

fun assertUploaded(uploaded: uint16, total: int) {
    assert (uploaded >= total) throw Errors.InvalidCommit;
}

fun assertOptionalUploaded(uploaded: uint16, total: int) {
    if (uploaded == 0) {
        return;
    }
    assertUploaded(uploaded, total);
}

fun assertLimits(canvasWidth: uint16, canvasHeight: uint16, maxVertices: uint32, maxFaces: uint16) {
    assert (canvasWidth > 0) throw Errors.InvalidLimits;
    assert (canvasHeight > 0) throw Errors.InvalidLimits;
    assert (canvasWidth <= 512) throw Errors.InvalidLimits;
    assert (canvasHeight <= 512) throw Errors.InvalidLimits;
    assert (maxVertices > 0) throw Errors.InvalidLimits;
    assert (maxVertices <= DEFAULT_MAX_VERTICES) throw Errors.InvalidLimits;
    assert (maxFaces <= 4096) throw Errors.InvalidLimits;
}

fun assertTextureLimits(width: uint16, height: uint16) {
    assert (width > 0) throw Errors.InvalidLimits;
    assert (height > 0) throw Errors.InvalidLimits;
    assert (width * height <= MAX_TEXTURE_PIXELS) throw Errors.InvalidLimits;
}

fun clearModel(mutate storage: Storage) {
    storage.model = RendererModel.default().toCell();
    storage.vertexChunks = map<uint16, cell> [];
    storage.faceChunks = map<uint16, cell> [];
    var assets = storage.assets.load();
    assets.faceUvChunks = map<uint16, cell> [];
    assets.faceUvChunkTotal = 0;
    assets.faceUvChunksUploaded = 0;
    storage.assets = assets.toCell();
    storage.isCommitted = false;
}

fun clearTexture(mutate storage: Storage) {
    var assets = storage.assets.load();
    assets.textureWidth = 0;
    assets.textureHeight = 0;
    assets.textureHash = 0;
    assets.textureChunks = map<uint16, cell> [];
    assets.textureChunkTotal = 0;
    assets.textureChunksUploaded = 0;
    assets.isTextureCommitted = false;
    storage.assets = assets.toCell();
}

fun ceilDiv(value: int, divisor: int): int {
    if (value == 0) {
        return 0;
    }
    return (value + divisor - 1) / divisor;
}

fun renderRowsFromStorage(storage: Storage, y0: uint16, rows: uint16): cell {
    assert (storage.isCommitted) throw Errors.NotCommitted;
    assert (rows > 0) throw Errors.InvalidLimits;
    assert (y0 < storage.canvasHeight) throw Errors.InvalidLimits;
    assert (y0 + rows <= storage.canvasHeight) throw Errors.InvalidLimits;

    val pixels = buildPixelChain(storage, y0, rows);
    return beginCell()
        .storeUint(RENDER_MAGIC, 32)
        .storeUint(storage.canvasWidth, 16)
        .storeUint(storage.canvasHeight, 16)
        .storeUint(y0, 16)
        .storeUint(rows, 16)
        .storeUint(8, 8)
        .storeRef(pixels)
        .endCell();
}

fun renderPointsFromStorage(storage: Storage, start: uint32, count: uint16): cell {
    val model = storage.model.load();
    assert (storage.isCommitted) throw Errors.NotCommitted;
    assert (count > 0) throw Errors.InvalidLimits;
    assert (count <= MAX_RENDER_POINTS) throw Errors.InvalidLimits;
    assert (start < model.vertexCount) throw Errors.InvalidLimits;
    assert (start + (count as uint32) <= model.vertexCount) throw Errors.InvalidLimits;

    val points = buildPointChain(storage, start, count);
    return beginCell()
        .storeUint(POINTS_MAGIC, 32)
        .storeUint(storage.canvasWidth, 16)
        .storeUint(storage.canvasHeight, 16)
        .storeUint(start, 32)
        .storeUint(count, 16)
        .storeUint(7, 8)
        .storeRef(points)
        .endCell();
}

fun buildPointChain(storage: Storage, start: uint32, count: uint16): cell {
    val assets = storage.assets.load();
    var chunkCount = ceilDiv(count, POINTS_PER_CELL);
    var tail: cell? = null;

    while (chunkCount > 0) {
        chunkCount = chunkCount - 1;
        val localStart = chunkCount * POINTS_PER_CELL;
        val localEnd = min(count, localStart + POINTS_PER_CELL);
        var b = beginCell();
        var i = localStart;
        while (i < localEnd) {
            val vertexIndex = (start as int) + i;
            val vertex = loadVertex(storage, vertexIndex);
            val p = project(storage, vertex);
            b.storeInt(p.x, 16);
            b.storeInt(p.y, 16);
            b.storeInt(vertex.z, 16);
            b.storeUint(pointColor(storage, assets, vertex, vertexIndex), 8);
            i = i + 1;
        }
        if (tail != null) {
            b.storeRef(tail!);
        }
        tail = b.endCell();
    }

    if (tail == null) {
        return createEmptyCell();
    }
    return tail!;
}

fun buildPixelChain(storage: Storage, y0: uint16, rows: uint16): cell {
    val model = storage.model.load();
    val total = storage.canvasWidth * rows;
    var chunkCount = ceilDiv(total, PIXELS_PER_CELL);
    var tail: cell? = null;

    while (chunkCount > 0) {
        chunkCount = chunkCount - 1;
        val start = chunkCount * PIXELS_PER_CELL;
        val end = min(total, start + PIXELS_PER_CELL);
        var b = beginCell();
        var i = start;
        while (i < end) {
            val x = i % storage.canvasWidth;
            val y = y0 + (i / storage.canvasWidth);
            b.storeUint(pixelAt(storage, model, x, y), 8);
            i = i + 1;
        }
        if (tail != null) {
            b.storeRef(tail!);
        }
        tail = b.endCell();
    }

    if (tail == null) {
        return createEmptyCell();
    }
    return tail!;
}

fun pixelAt(storage: Storage, model: RendererModel, x: int, y: int): int {
    val assets = storage.assets.load();
    var color = 0;
    if (model.faceCount == 0) {
        var vertexIndex = 0;
        while (vertexIndex < model.vertexCount) {
            val p = project(storage, loadVertex(storage, vertexIndex));
            if (p.x == x && p.y == y) {
                color = 255;
            }
            vertexIndex = vertexIndex + 1;
        }
    }

    var faceIndex = 0;
    while (faceIndex < model.faceCount) {
        val face = loadFace(storage, faceIndex);
        val a = project(storage, loadVertex(storage, face.a));
        val b = project(storage, loadVertex(storage, face.b));
        val c = project(storage, loadVertex(storage, face.c));
        val uv = loadFaceUvOrDefault(assets, faceIndex);
        if (pointInTriangle(x, y, a, b, c)) {
            color = sampleFaceColor(
                assets,
                face,
                uv,
                x,
                y,
                a,
                b,
                c,
            );
        }
        if (
            pointOnSegment(
                x,
                y,
                a.x,
                a.y,
                b.x,
                b.y,
            ) ||
            pointOnSegment(
                x,
                y,
                b.x,
                b.y,
                c.x,
                c.y,
            ) ||
            pointOnSegment(
                x,
                y,
                c.x,
                c.y,
                a.x,
                a.y,
            )
        ) {
            color = max(1, face.color);
        }
        faceIndex = faceIndex + 1;
    }
    return color;
}

fun project(storage: Storage, vertex: Vertex): Point2 {
    val zoom = max(1, storage.camera.zoom);
    val sx = (storage.canvasWidth / 2) + (((vertex.x as int) + storage.camera.tx) * zoom) / 512;
    val sy = (storage.canvasHeight / 2) - (((vertex.y as int) + storage.camera.ty) * zoom) / 512;
    return Point2 {
        x: sx,
        y: sy,
    };
}

fun loadVertex(storage: Storage, index: int): Vertex {
    val chunkIndex = (index / VERTICES_PER_CHUNK) as uint16;
    val offset = index % VERTICES_PER_CHUNK;
    var s = storage.vertexChunks.mustGet(chunkIndex, Errors.InvalidCommit).beginParse();
    s.skipBits(offset * VERTEX_BITS);
    return Vertex {
        x: s.loadInt(16) as int16,
        y: s.loadInt(16) as int16,
        z: s.loadInt(16) as int16,
    };
}

fun loadFace(storage: Storage, index: int): Face {
    val chunkIndex = (index / FACES_PER_CHUNK) as uint16;
    val offset = index % FACES_PER_CHUNK;
    var s = storage.faceChunks.mustGet(chunkIndex, Errors.InvalidCommit).beginParse();
    s.skipBits(offset * FACE_BITS);
    return Face {
        a: s.loadUint(16) as uint16,
        b: s.loadUint(16) as uint16,
        c: s.loadUint(16) as uint16,
        color: s.loadUint(8) as uint8,
    };
}

fun loadFaceUvOrDefault(assets: RendererAssets, index: int): FaceUv {
    val chunkIndex = (index / FACE_UVS_PER_CHUNK) as uint16;
    if (!assets.faceUvChunks.exists(chunkIndex)) {
        return FaceUv {
            u0: 0,
            v0: 255,
            u1: 255,
            v1: 255,
            u2: 128,
            v2: 0,
        };
    }

    val offset = index % FACE_UVS_PER_CHUNK;
    var s = assets.faceUvChunks.mustGet(chunkIndex, Errors.InvalidCommit).beginParse();
    s.skipBits(offset * FACE_UV_BITS);
    return FaceUv {
        u0: s.loadUint(8) as uint8,
        v0: s.loadUint(8) as uint8,
        u1: s.loadUint(8) as uint8,
        v1: s.loadUint(8) as uint8,
        u2: s.loadUint(8) as uint8,
        v2: s.loadUint(8) as uint8,
    };
}

fun pointColor(_storage: Storage, assets: RendererAssets, vertex: Vertex, index: int): int {
    if (assets.isTextureCommitted) {
        val u = clampToByte((((vertex.x as int) + 64) * 255) / 128);
        val v = clampToByte((64 - (vertex.y as int)) * 255 / 128);
        return sampleTexture(assets, u, v);
    }
    return 96 + ((index * 37) % 160);
}

fun sampleFaceColor(
    assets: RendererAssets,
    face: Face,
    uv: FaceUv,
    x: int,
    y: int,
    a: Point2,
    b: Point2,
    c: Point2,
): int {
    if (!assets.isTextureCommitted) {
        return max(1, face.color);
    }

    val denom = abs(
        edgeFunction(
            a.x,
            a.y,
            b.x,
            b.y,
            c.x,
            c.y,
        ),
    );
    if (denom == 0) {
        return max(1, face.color);
    }

    val w0 = abs(
        edgeFunction(
            b.x,
            b.y,
            c.x,
            c.y,
            x,
            y,
        ),
    );
    val w1 = abs(
        edgeFunction(
            c.x,
            c.y,
            a.x,
            a.y,
            x,
            y,
        ),
    );
    val w2 = abs(
        edgeFunction(
            a.x,
            a.y,
            b.x,
            b.y,
            x,
            y,
        ),
    );
    val u = ((uv.u0 * w0) + (uv.u1 * w1) + (uv.u2 * w2)) / denom;
    val v = ((uv.v0 * w0) + (uv.v1 * w1) + (uv.v2 * w2)) / denom;
    return sampleTexture(assets, clampToByte(u), clampToByte(v));
}

fun sampleTexture(assets: RendererAssets, u: int, v: int): int {
    val x = min(assets.textureWidth - 1, (u * assets.textureWidth) / 256);
    val y = min(assets.textureHeight - 1, (v * assets.textureHeight) / 256);
    val offset = (y * assets.textureWidth + x) * TEXTURE_BYTES_PER_TEXEL;
    val chunkIndex = (offset / TEXTURE_BYTES_PER_CHUNK) as uint16;
    val byteOffset = offset % TEXTURE_BYTES_PER_CHUNK;
    var s = assets.textureChunks.mustGet(chunkIndex, Errors.InvalidCommit).beginParse();
    s.skipBits(byteOffset * 8);
    return max(1, rgb565ToRgb332(s.loadUint(16)));
}

fun rgb565ToRgb332(value: int): int {
    return value / 257;
}

fun pointInTriangle(x: int, y: int, a: Point2, b: Point2, c: Point2): bool {
    val d0 = edgeFunction(
        a.x,
        a.y,
        b.x,
        b.y,
        x,
        y,
    );
    val d1 = edgeFunction(
        b.x,
        b.y,
        c.x,
        c.y,
        x,
        y,
    );
    val d2 = edgeFunction(
        c.x,
        c.y,
        a.x,
        a.y,
        x,
        y,
    );
    val hasNeg = d0 < 0 || d1 < 0 || d2 < 0;
    val hasPos = d0 > 0 || d1 > 0 || d2 > 0;
    return !(hasNeg && hasPos);
}

fun edgeFunction(
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    x: int,
    y: int,
): int {
    return (x - x0) * (y1 - y0) - (y - y0) * (x1 - x0);
}

fun clampToByte(value: int): int {
    return max(0, min(255, value));
}

fun pointOnSegment(
    x: int,
    y: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
): bool {
    if (x < min(x0, x1) || x > max(x0, x1) || y < min(y0, y1) || y > max(y0, y1)) {
        return false;
    }

    val dx = x1 - x0;
    val dy = y1 - y0;
    val cross = abs((y - y0) * dx - (x - x0) * dy);
    val threshold = max(abs(dx), abs(dy)) / 2 + 1;
    return cross <= threshold;
}
