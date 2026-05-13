enum Errors {
    NotOwner = 100
    InvalidMessage = 0xFFFF
    InvalidChunk = 101
    InvalidCommit = 102
    NotCommitted = 103
    InvalidLimits = 104
}

const DEFAULT_SEED = 1
const DEFAULT_CANVAS_WIDTH = 32
const DEFAULT_CANVAS_HEIGHT = 32
const DEFAULT_MAX_VERTICES = 100000
const DEFAULT_MAX_FACES = 4096
const DEFAULT_ZOOM = 256
const DEFAULT_TEXTURE_WIDTH = 0
const DEFAULT_TEXTURE_HEIGHT = 0

const VERTEX_BITS = 48
const FACE_BITS = 56
const FACE_UV_BITS = 48
const VERTICES_PER_CHUNK = 16
const FACES_PER_CHUNK = 16
const FACE_UVS_PER_CHUNK = 16
const PIXELS_PER_CELL = 120
const POINTS_PER_CELL = 18
const TEXTURE_BYTES_PER_CHUNK = 120
const TEXTURE_BYTES_PER_TEXEL = 2
const PATCH_PIXELS_PER_CELL = 60
const RENDER_MAGIC = 0x52334431
const POINTS_MAGIC = 0x50334431
const PATCH_MAGIC = 0x54334431
const MAX_RENDER_POINTS = 512
const MAX_TEXTURE_PIXELS = 16384
const MAX_PATCH_PIXELS = 4096

struct Camera {
    yaw: int16
    pitch: int16
    roll: int16
    zoom: int16
    tx: int16
    ty: int16
    tz: int16
}

struct Vertex {
    x: int16
    y: int16
    z: int16
}

struct Face {
    a: uint16
    b: uint16
    c: uint16
    color: uint8
}

struct FaceUv {
    u0: uint8
    v0: uint8
    u1: uint8
    v1: uint8
    u2: uint8
    v2: uint8
}

struct Point2 {
    x: int
    y: int
}

struct Storage {
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
}

struct RendererModel {
    vertexCount: uint32
    faceCount: uint16
    modelHash: uint256
    meshHash: uint256
    vertexChunkTotal: uint16
    vertexChunksUploaded: uint16
    faceChunkTotal: uint16
    faceChunksUploaded: uint16
}

struct RendererAssets {
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
}

fun Camera.default(): Camera {
    return Camera {
        yaw: 0,
        pitch: 0,
        roll: 0,
        zoom: DEFAULT_ZOOM,
        tx: 0,
        ty: 0,
        tz: 0,
    };
}

fun Storage.default(owner: address): Storage {
    return Storage {
        owner,
        seed: DEFAULT_SEED,
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        maxVertices: DEFAULT_MAX_VERTICES,
        maxFaces: DEFAULT_MAX_FACES,
        camera: Camera.default(),
        vertexChunks: map<uint16, cell> [],
        faceChunks: map<uint16, cell> [],
        model: RendererModel.default().toCell(),
        assets: RendererAssets.default().toCell(),
        isCommitted: false,
    };
}

fun RendererModel.default(): RendererModel {
    return RendererModel {
        vertexCount: 0,
        faceCount: 0,
        modelHash: 0,
        meshHash: 0,
        vertexChunkTotal: 0,
        vertexChunksUploaded: 0,
        faceChunkTotal: 0,
        faceChunksUploaded: 0,
    };
}

fun RendererAssets.default(): RendererAssets {
    return RendererAssets {
        textureWidth: DEFAULT_TEXTURE_WIDTH,
        textureHeight: DEFAULT_TEXTURE_HEIGHT,
        textureHash: 0,
        faceUvChunkTotal: 0,
        faceUvChunksUploaded: 0,
        textureChunkTotal: 0,
        textureChunksUploaded: 0,
        faceUvChunks: map<uint16, cell> [],
        textureChunks: map<uint16, cell> [],
        isTextureCommitted: false,
    };
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}

struct (0x76544301) UploadVertexChunk {
    index: uint16
    total: uint16
    data: cell
}

struct (0x76544302) UploadFaceChunk {
    index: uint16
    total: uint16
    data: cell
}

struct (0x76544303) CommitModel {
    vertexCount: uint32
    faceCount: uint16
    modelHash: uint256
    meshHash: uint256
}

struct (0x76544304) SetCamera {
    camera: Camera
}

struct (0x76544305) ClearModel {}

struct (0x76544306) SetLimits {
    canvasWidth: uint16
    canvasHeight: uint16
    maxVertices: uint32
    maxFaces: uint16
}

struct (0x76544307) Withdraw {
    to: address
    amount: coins
}

struct (0x76544308) UploadFaceUvChunk {
    index: uint16
    total: uint16
    data: cell
}

struct (0x76544309) UploadTextureChunk {
    index: uint16
    total: uint16
    data: cell
}

struct (0x7654430a) CommitTexture {
    width: uint16
    height: uint16
    textureHash: uint256
}

struct (0x7654430b) ClearTexture {}
