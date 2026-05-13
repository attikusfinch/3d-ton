// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a OnchainRendererShard contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

function makeCellFrom<T>(self: T, storeFn_T: StoreCallback<T>): c.Cell {
    let b = beginCell();
    storeFn_T(self, b);
    return b.endCell();
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
    let prefix = s.loadUint(32);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`);
    }
}

function lookupPrefix(s: c.Slice, expected: number, prefixLen: number): boolean {
    return s.remainingBits >= prefixLen && s.preloadUint(prefixLen) === expected;
}

function throwNonePrefixMatch(fieldPath: string): never {
    throw new Error(`Incorrect prefix for '${fieldPath}': none of variants matched`);
}

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
}

// ————————————————————————————————————————————
//   parse get methods result from a TVM stack
//

class StackReader {
    constructor(private tuple: c.TupleItem[]) {
    }

    static fromGetMethod(expectedN: number, getMethodResult: { stack: c.TupleReader }): StackReader {
        let tuple = [] as c.TupleItem[];
        while (getMethodResult.stack.remaining) {
            tuple.push(getMethodResult.stack.pop());
        }
        if (tuple.length !== expectedN) {
            throw new Error(`expected ${expectedN} stack width, got ${tuple.length}`);
        }
        return new StackReader(tuple);
    }

    private popExpecting<ItemT>(itemType: string): ItemT {
        const item = this.tuple.shift();
        if (item?.type === itemType) {
            return item as ItemT;
        }
        throw new Error(`not '${itemType}' on a stack`);
    }

    private popCellLike(): c.Cell {
        const item = this.tuple.shift();
        if (item && (item.type === 'cell' || item.type === 'slice' || item.type === 'builder')) {
            return item.cell;
        }
        throw new Error(`not cell/slice on a stack`);
    }

    readBigInt(): bigint {
        return this.popExpecting<c.TupleItemInt>('int').value;
    }

    readBoolean(): boolean {
        return this.popExpecting<c.TupleItemInt>('int').value !== 0n;
    }

    readCell(): c.Cell {
        return this.popCellLike();
    }

    readSlice(): c.Slice {
        return this.popCellLike().beginParse();
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type int16 = bigint

type uint16 = bigint
type uint32 = bigint
type uint256 = bigint

/**
 > struct Camera {
 >     yaw: int16
 >     pitch: int16
 >     roll: int16
 >     zoom: int16
 >     tx: int16
 >     ty: int16
 >     tz: int16
 > }
 */
export interface Camera {
    readonly $: 'Camera'
    yaw: int16
    pitch: int16
    roll: int16
    zoom: int16
    tx: int16
    ty: int16
    tz: int16
}

export const Camera = {
    create(args: {
        yaw: int16
        pitch: int16
        roll: int16
        zoom: int16
        tx: int16
        ty: int16
        tz: int16
    }): Camera {
        return {
            $: 'Camera',
            ...args
        }
    },
    fromSlice(s: c.Slice): Camera {
        return {
            $: 'Camera',
            yaw: s.loadIntBig(16),
            pitch: s.loadIntBig(16),
            roll: s.loadIntBig(16),
            zoom: s.loadIntBig(16),
            tx: s.loadIntBig(16),
            ty: s.loadIntBig(16),
            tz: s.loadIntBig(16),
        }
    },
    store(self: Camera, b: c.Builder): void {
        b.storeInt(self.yaw, 16);
        b.storeInt(self.pitch, 16);
        b.storeInt(self.roll, 16);
        b.storeInt(self.zoom, 16);
        b.storeInt(self.tx, 16);
        b.storeInt(self.ty, 16);
        b.storeInt(self.tz, 16);
    },
    toCell(self: Camera): c.Cell {
        return makeCellFrom<Camera>(self, Camera.store);
    }
}

/**
 > struct Storage {
 >     owner: address
 >     seed: uint32
 >     canvasWidth: uint16
 >     canvasHeight: uint16
 >     maxVertices: uint32
 >     maxFaces: uint16
 >     camera: Camera
 >     vertexChunks: map<uint16, cell>
 >     faceChunks: map<uint16, cell>
 >     model: Cell<RendererModel>
 >     assets: Cell<RendererAssets>
 >     isCommitted: bool
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    owner: c.Address
    seed: uint32
    canvasWidth: uint16
    canvasHeight: uint16
    maxVertices: uint32
    maxFaces: uint16
    camera: Camera
    vertexChunks: c.Dictionary<uint16, c.Cell>
    faceChunks: c.Dictionary<uint16, c.Cell>
    model: CellRef<RendererModel>
    assets: CellRef<RendererAssets>
    isCommitted: boolean
}

export const Storage = {
    create(args: {
        owner: c.Address
        seed: uint32
        canvasWidth: uint16
        canvasHeight: uint16
        maxVertices: uint32
        maxFaces: uint16
        camera: Camera
        vertexChunks: c.Dictionary<uint16, c.Cell>
        faceChunks: c.Dictionary<uint16, c.Cell>
        model: CellRef<RendererModel>
        assets: CellRef<RendererAssets>
        isCommitted: boolean
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            owner: s.loadAddress(),
            seed: s.loadUintBig(32),
            canvasWidth: s.loadUintBig(16),
            canvasHeight: s.loadUintBig(16),
            maxVertices: s.loadUintBig(32),
            maxFaces: s.loadUintBig(16),
            camera: Camera.fromSlice(s),
            vertexChunks: c.Dictionary.load<uint16, c.Cell>(c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell(), s),
            faceChunks: c.Dictionary.load<uint16, c.Cell>(c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell(), s),
            model: loadCellRef<RendererModel>(s, RendererModel.fromSlice),
            assets: loadCellRef<RendererAssets>(s, RendererAssets.fromSlice),
            isCommitted: s.loadBoolean(),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeUint(self.seed, 32);
        b.storeUint(self.canvasWidth, 16);
        b.storeUint(self.canvasHeight, 16);
        b.storeUint(self.maxVertices, 32);
        b.storeUint(self.maxFaces, 16);
        Camera.store(self.camera, b);
        b.storeDict<uint16, c.Cell>(self.vertexChunks, c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell());
        b.storeDict<uint16, c.Cell>(self.faceChunks, c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell());
        storeCellRef<RendererModel>(self.model, b, RendererModel.store);
        storeCellRef<RendererAssets>(self.assets, b, RendererAssets.store);
        b.storeBit(self.isCommitted);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct RendererModel {
 >     vertexCount: uint32
 >     faceCount: uint16
 >     modelHash: uint256
 >     meshHash: uint256
 >     vertexChunkTotal: uint16
 >     vertexChunksUploaded: uint16
 >     faceChunkTotal: uint16
 >     faceChunksUploaded: uint16
 > }
 */
export interface RendererModel {
    readonly $: 'RendererModel'
    vertexCount: uint32
    faceCount: uint16
    modelHash: uint256
    meshHash: uint256
    vertexChunkTotal: uint16
    vertexChunksUploaded: uint16
    faceChunkTotal: uint16
    faceChunksUploaded: uint16
}

export const RendererModel = {
    create(args: {
        vertexCount: uint32
        faceCount: uint16
        modelHash: uint256
        meshHash: uint256
        vertexChunkTotal: uint16
        vertexChunksUploaded: uint16
        faceChunkTotal: uint16
        faceChunksUploaded: uint16
    }): RendererModel {
        return {
            $: 'RendererModel',
            ...args
        }
    },
    fromSlice(s: c.Slice): RendererModel {
        return {
            $: 'RendererModel',
            vertexCount: s.loadUintBig(32),
            faceCount: s.loadUintBig(16),
            modelHash: s.loadUintBig(256),
            meshHash: s.loadUintBig(256),
            vertexChunkTotal: s.loadUintBig(16),
            vertexChunksUploaded: s.loadUintBig(16),
            faceChunkTotal: s.loadUintBig(16),
            faceChunksUploaded: s.loadUintBig(16),
        }
    },
    store(self: RendererModel, b: c.Builder): void {
        b.storeUint(self.vertexCount, 32);
        b.storeUint(self.faceCount, 16);
        b.storeUint(self.modelHash, 256);
        b.storeUint(self.meshHash, 256);
        b.storeUint(self.vertexChunkTotal, 16);
        b.storeUint(self.vertexChunksUploaded, 16);
        b.storeUint(self.faceChunkTotal, 16);
        b.storeUint(self.faceChunksUploaded, 16);
    },
    toCell(self: RendererModel): c.Cell {
        return makeCellFrom<RendererModel>(self, RendererModel.store);
    }
}

/**
 > struct RendererAssets {
 >     textureWidth: uint16
 >     textureHeight: uint16
 >     textureHash: uint256
 >     faceUvChunkTotal: uint16
 >     faceUvChunksUploaded: uint16
 >     textureChunkTotal: uint16
 >     textureChunksUploaded: uint16
 >     faceUvChunks: map<uint16, cell>
 >     textureChunks: map<uint16, cell>
 >     isTextureCommitted: bool
 > }
 */
export interface RendererAssets {
    readonly $: 'RendererAssets'
    textureWidth: uint16
    textureHeight: uint16
    textureHash: uint256
    faceUvChunkTotal: uint16
    faceUvChunksUploaded: uint16
    textureChunkTotal: uint16
    textureChunksUploaded: uint16
    faceUvChunks: c.Dictionary<uint16, c.Cell>
    textureChunks: c.Dictionary<uint16, c.Cell>
    isTextureCommitted: boolean
}

export const RendererAssets = {
    create(args: {
        textureWidth: uint16
        textureHeight: uint16
        textureHash: uint256
        faceUvChunkTotal: uint16
        faceUvChunksUploaded: uint16
        textureChunkTotal: uint16
        textureChunksUploaded: uint16
        faceUvChunks: c.Dictionary<uint16, c.Cell>
        textureChunks: c.Dictionary<uint16, c.Cell>
        isTextureCommitted: boolean
    }): RendererAssets {
        return {
            $: 'RendererAssets',
            ...args
        }
    },
    fromSlice(s: c.Slice): RendererAssets {
        return {
            $: 'RendererAssets',
            textureWidth: s.loadUintBig(16),
            textureHeight: s.loadUintBig(16),
            textureHash: s.loadUintBig(256),
            faceUvChunkTotal: s.loadUintBig(16),
            faceUvChunksUploaded: s.loadUintBig(16),
            textureChunkTotal: s.loadUintBig(16),
            textureChunksUploaded: s.loadUintBig(16),
            faceUvChunks: c.Dictionary.load<uint16, c.Cell>(c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell(), s),
            textureChunks: c.Dictionary.load<uint16, c.Cell>(c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell(), s),
            isTextureCommitted: s.loadBoolean(),
        }
    },
    store(self: RendererAssets, b: c.Builder): void {
        b.storeUint(self.textureWidth, 16);
        b.storeUint(self.textureHeight, 16);
        b.storeUint(self.textureHash, 256);
        b.storeUint(self.faceUvChunkTotal, 16);
        b.storeUint(self.faceUvChunksUploaded, 16);
        b.storeUint(self.textureChunkTotal, 16);
        b.storeUint(self.textureChunksUploaded, 16);
        b.storeDict<uint16, c.Cell>(self.faceUvChunks, c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell());
        b.storeDict<uint16, c.Cell>(self.textureChunks, c.Dictionary.Keys.BigUint(16), c.Dictionary.Values.Cell());
        b.storeBit(self.isTextureCommitted);
    },
    toCell(self: RendererAssets): c.Cell {
        return makeCellFrom<RendererAssets>(self, RendererAssets.store);
    }
}

/**
 > struct (0x76544301) UploadVertexChunk {
 >     index: uint16
 >     total: uint16
 >     data: cell
 > }
 */
export interface UploadVertexChunk {
    readonly $: 'UploadVertexChunk'
    index: uint16
    total: uint16
    data: c.Cell
}

export const UploadVertexChunk = {
    PREFIX: 0x76544301,

    create(args: {
        index: uint16
        total: uint16
        data: c.Cell
    }): UploadVertexChunk {
        return {
            $: 'UploadVertexChunk',
            ...args
        }
    },
    fromSlice(s: c.Slice): UploadVertexChunk {
        loadAndCheckPrefix32(s, 0x76544301, 'UploadVertexChunk');
        return {
            $: 'UploadVertexChunk',
            index: s.loadUintBig(16),
            total: s.loadUintBig(16),
            data: s.loadRef(),
        }
    },
    store(self: UploadVertexChunk, b: c.Builder): void {
        b.storeUint(0x76544301, 32);
        b.storeUint(self.index, 16);
        b.storeUint(self.total, 16);
        b.storeRef(self.data);
    },
    toCell(self: UploadVertexChunk): c.Cell {
        return makeCellFrom<UploadVertexChunk>(self, UploadVertexChunk.store);
    }
}

/**
 > struct (0x76544302) UploadFaceChunk {
 >     index: uint16
 >     total: uint16
 >     data: cell
 > }
 */
export interface UploadFaceChunk {
    readonly $: 'UploadFaceChunk'
    index: uint16
    total: uint16
    data: c.Cell
}

export const UploadFaceChunk = {
    PREFIX: 0x76544302,

    create(args: {
        index: uint16
        total: uint16
        data: c.Cell
    }): UploadFaceChunk {
        return {
            $: 'UploadFaceChunk',
            ...args
        }
    },
    fromSlice(s: c.Slice): UploadFaceChunk {
        loadAndCheckPrefix32(s, 0x76544302, 'UploadFaceChunk');
        return {
            $: 'UploadFaceChunk',
            index: s.loadUintBig(16),
            total: s.loadUintBig(16),
            data: s.loadRef(),
        }
    },
    store(self: UploadFaceChunk, b: c.Builder): void {
        b.storeUint(0x76544302, 32);
        b.storeUint(self.index, 16);
        b.storeUint(self.total, 16);
        b.storeRef(self.data);
    },
    toCell(self: UploadFaceChunk): c.Cell {
        return makeCellFrom<UploadFaceChunk>(self, UploadFaceChunk.store);
    }
}

/**
 > struct (0x76544303) CommitModel {
 >     vertexCount: uint32
 >     faceCount: uint16
 >     modelHash: uint256
 >     meshHash: uint256
 > }
 */
export interface CommitModel {
    readonly $: 'CommitModel'
    vertexCount: uint32
    faceCount: uint16
    modelHash: uint256
    meshHash: uint256
}

export const CommitModel = {
    PREFIX: 0x76544303,

    create(args: {
        vertexCount: uint32
        faceCount: uint16
        modelHash: uint256
        meshHash: uint256
    }): CommitModel {
        return {
            $: 'CommitModel',
            ...args
        }
    },
    fromSlice(s: c.Slice): CommitModel {
        loadAndCheckPrefix32(s, 0x76544303, 'CommitModel');
        return {
            $: 'CommitModel',
            vertexCount: s.loadUintBig(32),
            faceCount: s.loadUintBig(16),
            modelHash: s.loadUintBig(256),
            meshHash: s.loadUintBig(256),
        }
    },
    store(self: CommitModel, b: c.Builder): void {
        b.storeUint(0x76544303, 32);
        b.storeUint(self.vertexCount, 32);
        b.storeUint(self.faceCount, 16);
        b.storeUint(self.modelHash, 256);
        b.storeUint(self.meshHash, 256);
    },
    toCell(self: CommitModel): c.Cell {
        return makeCellFrom<CommitModel>(self, CommitModel.store);
    }
}

/**
 > struct (0x76544304) SetCamera {
 >     camera: Camera
 > }
 */
export interface SetCamera {
    readonly $: 'SetCamera'
    camera: Camera
}

export const SetCamera = {
    PREFIX: 0x76544304,

    create(args: {
        camera: Camera
    }): SetCamera {
        return {
            $: 'SetCamera',
            ...args
        }
    },
    fromSlice(s: c.Slice): SetCamera {
        loadAndCheckPrefix32(s, 0x76544304, 'SetCamera');
        return {
            $: 'SetCamera',
            camera: Camera.fromSlice(s),
        }
    },
    store(self: SetCamera, b: c.Builder): void {
        b.storeUint(0x76544304, 32);
        Camera.store(self.camera, b);
    },
    toCell(self: SetCamera): c.Cell {
        return makeCellFrom<SetCamera>(self, SetCamera.store);
    }
}

/**
 > struct (0x76544305) ClearModel {
 > }
 */
export interface ClearModel {
    readonly $: 'ClearModel'
}

export const ClearModel = {
    PREFIX: 0x76544305,

    create(): ClearModel {
        return {
            $: 'ClearModel',
        }
    },
    fromSlice(s: c.Slice): ClearModel {
        loadAndCheckPrefix32(s, 0x76544305, 'ClearModel');
        return {
            $: 'ClearModel',
        }
    },
    store(self: ClearModel, b: c.Builder): void {
        b.storeUint(0x76544305, 32);
    },
    toCell(self: ClearModel): c.Cell {
        return makeCellFrom<ClearModel>(self, ClearModel.store);
    }
}

/**
 > struct (0x76544306) SetLimits {
 >     canvasWidth: uint16
 >     canvasHeight: uint16
 >     maxVertices: uint32
 >     maxFaces: uint16
 > }
 */
export interface SetLimits {
    readonly $: 'SetLimits'
    canvasWidth: uint16
    canvasHeight: uint16
    maxVertices: uint32
    maxFaces: uint16
}

export const SetLimits = {
    PREFIX: 0x76544306,

    create(args: {
        canvasWidth: uint16
        canvasHeight: uint16
        maxVertices: uint32
        maxFaces: uint16
    }): SetLimits {
        return {
            $: 'SetLimits',
            ...args
        }
    },
    fromSlice(s: c.Slice): SetLimits {
        loadAndCheckPrefix32(s, 0x76544306, 'SetLimits');
        return {
            $: 'SetLimits',
            canvasWidth: s.loadUintBig(16),
            canvasHeight: s.loadUintBig(16),
            maxVertices: s.loadUintBig(32),
            maxFaces: s.loadUintBig(16),
        }
    },
    store(self: SetLimits, b: c.Builder): void {
        b.storeUint(0x76544306, 32);
        b.storeUint(self.canvasWidth, 16);
        b.storeUint(self.canvasHeight, 16);
        b.storeUint(self.maxVertices, 32);
        b.storeUint(self.maxFaces, 16);
    },
    toCell(self: SetLimits): c.Cell {
        return makeCellFrom<SetLimits>(self, SetLimits.store);
    }
}

/**
 > struct (0x76544307) Withdraw {
 >     to: address
 >     amount: coins
 > }
 */
export interface Withdraw {
    readonly $: 'Withdraw'
    to: c.Address
    amount: coins
}

export const Withdraw = {
    PREFIX: 0x76544307,

    create(args: {
        to: c.Address
        amount: coins
    }): Withdraw {
        return {
            $: 'Withdraw',
            ...args
        }
    },
    fromSlice(s: c.Slice): Withdraw {
        loadAndCheckPrefix32(s, 0x76544307, 'Withdraw');
        return {
            $: 'Withdraw',
            to: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: Withdraw, b: c.Builder): void {
        b.storeUint(0x76544307, 32);
        b.storeAddress(self.to);
        b.storeCoins(self.amount);
    },
    toCell(self: Withdraw): c.Cell {
        return makeCellFrom<Withdraw>(self, Withdraw.store);
    }
}

/**
 > struct (0x76544308) UploadFaceUvChunk {
 >     index: uint16
 >     total: uint16
 >     data: cell
 > }
 */
export interface UploadFaceUvChunk {
    readonly $: 'UploadFaceUvChunk'
    index: uint16
    total: uint16
    data: c.Cell
}

export const UploadFaceUvChunk = {
    PREFIX: 0x76544308,

    create(args: {
        index: uint16
        total: uint16
        data: c.Cell
    }): UploadFaceUvChunk {
        return {
            $: 'UploadFaceUvChunk',
            ...args
        }
    },
    fromSlice(s: c.Slice): UploadFaceUvChunk {
        loadAndCheckPrefix32(s, 0x76544308, 'UploadFaceUvChunk');
        return {
            $: 'UploadFaceUvChunk',
            index: s.loadUintBig(16),
            total: s.loadUintBig(16),
            data: s.loadRef(),
        }
    },
    store(self: UploadFaceUvChunk, b: c.Builder): void {
        b.storeUint(0x76544308, 32);
        b.storeUint(self.index, 16);
        b.storeUint(self.total, 16);
        b.storeRef(self.data);
    },
    toCell(self: UploadFaceUvChunk): c.Cell {
        return makeCellFrom<UploadFaceUvChunk>(self, UploadFaceUvChunk.store);
    }
}

/**
 > struct (0x76544309) UploadTextureChunk {
 >     index: uint16
 >     total: uint16
 >     data: cell
 > }
 */
export interface UploadTextureChunk {
    readonly $: 'UploadTextureChunk'
    index: uint16
    total: uint16
    data: c.Cell
}

export const UploadTextureChunk = {
    PREFIX: 0x76544309,

    create(args: {
        index: uint16
        total: uint16
        data: c.Cell
    }): UploadTextureChunk {
        return {
            $: 'UploadTextureChunk',
            ...args
        }
    },
    fromSlice(s: c.Slice): UploadTextureChunk {
        loadAndCheckPrefix32(s, 0x76544309, 'UploadTextureChunk');
        return {
            $: 'UploadTextureChunk',
            index: s.loadUintBig(16),
            total: s.loadUintBig(16),
            data: s.loadRef(),
        }
    },
    store(self: UploadTextureChunk, b: c.Builder): void {
        b.storeUint(0x76544309, 32);
        b.storeUint(self.index, 16);
        b.storeUint(self.total, 16);
        b.storeRef(self.data);
    },
    toCell(self: UploadTextureChunk): c.Cell {
        return makeCellFrom<UploadTextureChunk>(self, UploadTextureChunk.store);
    }
}

/**
 > struct (0x7654430a) CommitTexture {
 >     width: uint16
 >     height: uint16
 >     textureHash: uint256
 > }
 */
export interface CommitTexture {
    readonly $: 'CommitTexture'
    width: uint16
    height: uint16
    textureHash: uint256
}

export const CommitTexture = {
    PREFIX: 0x7654430a,

    create(args: {
        width: uint16
        height: uint16
        textureHash: uint256
    }): CommitTexture {
        return {
            $: 'CommitTexture',
            ...args
        }
    },
    fromSlice(s: c.Slice): CommitTexture {
        loadAndCheckPrefix32(s, 0x7654430a, 'CommitTexture');
        return {
            $: 'CommitTexture',
            width: s.loadUintBig(16),
            height: s.loadUintBig(16),
            textureHash: s.loadUintBig(256),
        }
    },
    store(self: CommitTexture, b: c.Builder): void {
        b.storeUint(0x7654430a, 32);
        b.storeUint(self.width, 16);
        b.storeUint(self.height, 16);
        b.storeUint(self.textureHash, 256);
    },
    toCell(self: CommitTexture): c.Cell {
        return makeCellFrom<CommitTexture>(self, CommitTexture.store);
    }
}

/**
 > struct (0x7654430b) ClearTexture {
 > }
 */
export interface ClearTexture {
    readonly $: 'ClearTexture'
}

export const ClearTexture = {
    PREFIX: 0x7654430b,

    create(): ClearTexture {
        return {
            $: 'ClearTexture',
        }
    },
    fromSlice(s: c.Slice): ClearTexture {
        loadAndCheckPrefix32(s, 0x7654430b, 'ClearTexture');
        return {
            $: 'ClearTexture',
        }
    },
    store(self: ClearTexture, b: c.Builder): void {
        b.storeUint(0x7654430b, 32);
    },
    toCell(self: ClearTexture): c.Cell {
        return makeCellFrom<ClearTexture>(self, ClearTexture.store);
    }
}

// ————————————————————————————————————————————
//    class OnchainRendererShard
//

interface ExtraSendOptions {
    bounce?: boolean                    // default: false
    sendMode?: SendMode                 // default: SendMode.PAY_GAS_SEPARATELY
    extraCurrencies?: c.ExtraCurrency   // default: empty dict
}

interface DeployedAddrOptions {
    workchain?: number                  // default: 0 (basechain)
    toShard?: { fixedPrefixLength: number; closeTo: c.Address }
    overrideContractCode?: c.Cell
}

function calculateDeployedAddress(code: c.Cell, data: c.Cell, options: DeployedAddrOptions): c.Address {
    const stateInitCell = beginCell().store(c.storeStateInit({
        code,
        data,
        splitDepth: options.toShard?.fixedPrefixLength,
        special: null,
        libraries: null,
    })).endCell();

    let addrHash = stateInitCell.hash();
    if (options.toShard) {
        const shardDepth = options.toShard.fixedPrefixLength;
        addrHash = beginCell()
            .storeBits(new c.BitString(options.toShard.closeTo.hash, 0, shardDepth))
            .storeBits(new c.BitString(stateInitCell.hash(), shardDepth, 256 - shardDepth))
            .endCell()
            .beginParse().loadBuffer(32);
    }

    return new c.Address(options.workchain ?? 0, addrHash);
}

export class OnchainRendererShard implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Errors.NotOwner': 100,
        'Errors.InvalidChunk': 101,
        'Errors.InvalidCommit': 102,
        'Errors.NotCommitted': 103,
        'Errors.InvalidLimits': 104,
        'Errors.InvalidMessage': 65535,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new OnchainRendererShard(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        seed: uint32
        canvasWidth: uint16
        canvasHeight: uint16
        maxVertices: uint32
        maxFaces: uint16
        camera: Camera
        vertexChunks: c.Dictionary<uint16, c.Cell>
        faceChunks: c.Dictionary<uint16, c.Cell>
        model: CellRef<RendererModel>
        assets: CellRef<RendererAssets>
        isCommitted: boolean
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? OnchainRendererShard.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OnchainRendererShard(address, initialState);
    }

    static createCellOfUploadVertexChunk(body: {
        index: uint16
        total: uint16
        data: c.Cell
    }) {
        return UploadVertexChunk.toCell(UploadVertexChunk.create(body));
    }

    static createCellOfUploadFaceChunk(body: {
        index: uint16
        total: uint16
        data: c.Cell
    }) {
        return UploadFaceChunk.toCell(UploadFaceChunk.create(body));
    }

    static createCellOfCommitModel(body: {
        vertexCount: uint32
        faceCount: uint16
        modelHash: uint256
        meshHash: uint256
    }) {
        return CommitModel.toCell(CommitModel.create(body));
    }

    static createCellOfSetCamera(body: {
        camera: Camera
    }) {
        return SetCamera.toCell(SetCamera.create(body));
    }

    static createCellOfClearModel(body: {
    }) {
        return ClearModel.toCell(ClearModel.create());
    }

    static createCellOfSetLimits(body: {
        canvasWidth: uint16
        canvasHeight: uint16
        maxVertices: uint32
        maxFaces: uint16
    }) {
        return SetLimits.toCell(SetLimits.create(body));
    }

    static createCellOfWithdraw(body: {
        to: c.Address
        amount: coins
    }) {
        return Withdraw.toCell(Withdraw.create(body));
    }

    static createCellOfUploadFaceUvChunk(body: {
        index: uint16
        total: uint16
        data: c.Cell
    }) {
        return UploadFaceUvChunk.toCell(UploadFaceUvChunk.create(body));
    }

    static createCellOfUploadTextureChunk(body: {
        index: uint16
        total: uint16
        data: c.Cell
    }) {
        return UploadTextureChunk.toCell(UploadTextureChunk.create(body));
    }

    static createCellOfCommitTexture(body: {
        width: uint16
        height: uint16
        textureHash: uint256
    }) {
        return CommitTexture.toCell(CommitTexture.create(body));
    }

    static createCellOfClearTexture(body: {
    }) {
        return ClearTexture.toCell(ClearTexture.create());
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendUploadVertexChunk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        index: uint16
        total: uint16
        data: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UploadVertexChunk.toCell(UploadVertexChunk.create(body)),
            ...extraOptions
        });
    }

    async sendUploadFaceChunk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        index: uint16
        total: uint16
        data: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UploadFaceChunk.toCell(UploadFaceChunk.create(body)),
            ...extraOptions
        });
    }

    async sendCommitModel(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        vertexCount: uint32
        faceCount: uint16
        modelHash: uint256
        meshHash: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CommitModel.toCell(CommitModel.create(body)),
            ...extraOptions
        });
    }

    async sendSetCamera(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        camera: Camera
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: SetCamera.toCell(SetCamera.create(body)),
            ...extraOptions
        });
    }

    async sendClearModel(provider: ContractProvider, via: Sender, msgValue: coins, body: {
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ClearModel.toCell(ClearModel.create()),
            ...extraOptions
        });
    }

    async sendSetLimits(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        canvasWidth: uint16
        canvasHeight: uint16
        maxVertices: uint32
        maxFaces: uint16
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: SetLimits.toCell(SetLimits.create(body)),
            ...extraOptions
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        to: c.Address
        amount: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Withdraw.toCell(Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendUploadFaceUvChunk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        index: uint16
        total: uint16
        data: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UploadFaceUvChunk.toCell(UploadFaceUvChunk.create(body)),
            ...extraOptions
        });
    }

    async sendUploadTextureChunk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        index: uint16
        total: uint16
        data: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UploadTextureChunk.toCell(UploadTextureChunk.create(body)),
            ...extraOptions
        });
    }

    async sendCommitTexture(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        width: uint16
        height: uint16
        textureHash: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CommitTexture.toCell(CommitTexture.create(body)),
            ...extraOptions
        });
    }

    async sendClearTexture(provider: ContractProvider, via: Sender, msgValue: coins, body: {
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ClearTexture.toCell(ClearTexture.create()),
            ...extraOptions
        });
    }

    async getConfig(provider: ContractProvider): Promise<[
        uint16,
        uint16,
        uint32,
        uint16,
        uint32,
        boolean,
    ]> {
        const r = StackReader.fromGetMethod(6, await provider.get('config', []));
        return [
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBoolean(),
        ];
    }

    async getModelInfo(provider: ContractProvider): Promise<[
        uint32,
        uint16,
        uint256,
        uint256,
        boolean,
    ]> {
        const r = StackReader.fromGetMethod(5, await provider.get('modelInfo', []));
        return [
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBoolean(),
        ];
    }

    async getTextureInfo(provider: ContractProvider): Promise<[
        uint16,
        uint16,
        uint256,
        boolean,
    ]> {
        const r = StackReader.fromGetMethod(4, await provider.get('textureInfo', []));
        return [
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBoolean(),
        ];
    }

    async getCamera(provider: ContractProvider): Promise<Camera> {
        const r = StackReader.fromGetMethod(7, await provider.get('camera', []));
        return ({
            $: 'Camera',
            yaw: r.readBigInt(),
            pitch: r.readBigInt(),
            roll: r.readBigInt(),
            zoom: r.readBigInt(),
            tx: r.readBigInt(),
            ty: r.readBigInt(),
            tz: r.readBigInt(),
        });
    }

    async getRenderFacePatch(provider: ContractProvider, faceIndex: uint16, x0: uint16, y0: uint16, width: uint16, height: uint16): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('renderFacePatch', [
            { type: 'int', value: faceIndex },
            { type: 'int', value: x0 },
            { type: 'int', value: y0 },
            { type: 'int', value: width },
            { type: 'int', value: height },
        ]));
        return r.readCell();
    }
}
