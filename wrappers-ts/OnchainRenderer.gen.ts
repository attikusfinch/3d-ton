// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a OnchainRenderer contract in Tolk.
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
//    class OnchainRenderer
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

export class OnchainRenderer implements c.Contract {
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
        return new OnchainRenderer(address);
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
            code: deployedOptions?.overrideContractCode ?? OnchainRenderer.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OnchainRenderer(address, initialState);
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

    async getRenderPreview(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('renderPreview', []));
        return r.readCell();
    }

    async getRenderRows(provider: ContractProvider, y0: uint16, rows: uint16): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('renderRows', [
            { type: 'int', value: y0 },
            { type: 'int', value: rows },
        ]));
        return r.readCell();
    }

    async getRenderPoints(provider: ContractProvider, start: uint32, count: uint16): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('renderPoints', [
            { type: 'int', value: start },
            { type: 'int', value: count },
        ]));
        return r.readCell();
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
