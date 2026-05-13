import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/OnchainRenderer.gen"
import "@wrappers/OnchainRendererShard.gen"

get fun `test deploy exposes default renderer config`() {
    val (contract, deployer, _) = setupTest();
    val (
        width,
        height,
        maxVertices,
        maxFaces,
        seed,
        isCommitted,
    ) = contract.config();

    expect(width).toEqual(DEFAULT_CANVAS_WIDTH);
    expect(height).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(maxVertices).toEqual(DEFAULT_MAX_VERTICES);
    expect(maxFaces).toEqual(DEFAULT_MAX_FACES);
    expect(seed).toEqual(DEFAULT_SEED);
    expect(isCommitted).toEqual(false);
    expect(contract.camera().zoom).toEqual(DEFAULT_ZOOM);
    val (textureWidth, textureHeight, textureHash, textureCommitted) = contract.textureInfo();
    expect(textureWidth).toEqual(0);
    expect(textureHeight).toEqual(0);
    expect(textureHash).toEqual(0);
    expect(textureCommitted).toEqual(false);
    expect(deployer.address).toEqual(Storage.default(deployer.address).owner);
}

get fun `test owner uploads chunks and commits model`() {
    val (contract, deployer, _) = setupTest();

    uploadTriangle(contract, deployer);
    val res = contract.sendCommitModel(
        deployer.address,
        3,
        1,
        0x01,
        0x02,
        { value: ton("0.05") },
    );
    expect(res).toHaveSuccessfulTx<CommitModel>({
        from: deployer.address,
        to: contract.address,
    });

    val (vertexCount, faceCount, modelHash, meshHash, isCommitted) = contract.modelInfo();
    expect(vertexCount).toEqual(3);
    expect(faceCount).toEqual(1);
    expect(modelHash).toEqual(0x01);
    expect(meshHash).toEqual(0x02);
    expect(isCommitted).toEqual(true);
}

get fun `test render rows returns non-empty pixels`() {
    val (contract, _, _) = setupCommittedTriangle();

    val rendered = contract.renderRows(0, DEFAULT_CANVAS_HEIGHT);
    var s = rendered.beginParse();
    expect(s.loadUint(32)).toEqual(RENDER_MAGIC);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_WIDTH);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(s.loadUint(16)).toEqual(0);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(s.loadUint(8)).toEqual(8);
    expect(hasNonZeroPixels(s.loadRef())).toEqual(true);
}

get fun `test render points returns projected vertex range`() {
    val (contract, _, _) = setupCommittedTriangle();

    val rendered = contract.renderPoints(0, 3);
    var s = rendered.beginParse();
    expect(s.loadUint(32)).toEqual(POINTS_MAGIC);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_WIDTH);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(s.loadUint(32)).toEqual(0);
    expect(s.loadUint(16)).toEqual(3);
    expect(s.loadUint(8)).toEqual(7);

    var points = s.loadRef().beginParse();
    expect(points.remainingBitsCount()).toBeGreaterOrEqual(21);
    expect(points.loadInt(16)).toBeGreaterOrEqual(0);
    expect(points.loadInt(16)).toBeGreaterOrEqual(0);
    points.loadInt(16);
    expect(points.loadUint(8)).toBeGreater(0);
}

get fun `test shard renders filled face patch`() {
    val deployer = testing.treasury("shardDeployer");
    val shard = OnchainRendererShard.fromStorage(Storage.default(deployer.address));
    val deploy = shard.deploy(deployer.address, { value: ton("0.05") });
    expect(deploy).toHaveSuccessfulDeploy({
        to: shard.address,
    });

    uploadTriangleShard(shard, deployer);
    val commit = shard.sendCommitModel(
        deployer.address,
        3,
        1,
        0x31,
        0x32,
        { value: ton("0.05") },
    );
    expect(commit).toHaveSuccessfulTx<CommitModel>({
        from: deployer.address,
        to: shard.address,
    });

    val rendered = shard.renderFacePatch(0, 0, 0, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
    var s = rendered.beginParse();
    expect(s.loadUint(32)).toEqual(PATCH_MAGIC);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_WIDTH);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(s.loadUint(16)).toEqual(0);
    expect(s.loadUint(16)).toEqual(0);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_WIDTH);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(s.loadUint(8)).toEqual(16);
    expect(hasNonZeroPixels(s.loadRef())).toEqual(true);
}

get fun `test texture chunks can be committed`() {
    val (contract, deployer, _) = setupCommittedTriangle();

    val upload = contract.sendUploadTextureChunk(
        deployer.address,
        0,
        1,
        texture2x2(),
        { value: ton("0.05") },
    );
    expect(upload).toHaveSuccessfulTx<UploadTextureChunk>({
        from: deployer.address,
        to: contract.address,
    });

    val commit = contract.sendCommitTexture(
        deployer.address,
        2,
        2,
        0x03,
        { value: ton("0.05") },
    );
    expect(commit).toHaveSuccessfulTx<CommitTexture>({
        from: deployer.address,
        to: contract.address,
    });

    val (width, height, hash, committed) = contract.textureInfo();
    expect(width).toEqual(2);
    expect(height).toEqual(2);
    expect(hash).toEqual(0x03);
    expect(committed).toEqual(true);
}

get fun `test 128x128 rgb565 texture chunks can be committed`() {
    val (contract, deployer, _) = setupTest();

    uploadTextureChunks(contract, deployer, 274, 32768);
    val commit = contract.sendCommitTexture(
        deployer.address,
        128,
        128,
        0x04,
        { value: ton("0.05") },
    );
    expect(commit).toHaveSuccessfulTx<CommitTexture>({
        from: deployer.address,
        to: contract.address,
    });

    val (width, height, hash, committed) = contract.textureInfo();
    expect(width).toEqual(128);
    expect(height).toEqual(128);
    expect(hash).toEqual(0x04);
    expect(committed).toEqual(true);
}

get fun `test counted chunks commit large point model`() {
    val (contract, deployer, _) = setupTest();

    uploadVertexChunks(contract, deployer, 96);
    val res = contract.sendCommitModel(
        deployer.address,
        1536,
        0,
        0x10,
        0x20,
        { value: ton("0.05") },
    );
    expect(res).toHaveSuccessfulTx<CommitModel>({
        from: deployer.address,
        to: contract.address,
    });

    val (vertexCount, faceCount, _, _, isCommitted) = contract.modelInfo();
    expect(vertexCount).toEqual(1536);
    expect(faceCount).toEqual(0);
    expect(isCommitted).toEqual(true);

    val rendered = contract.renderPoints(1024, 512);
    var s = rendered.beginParse();
    expect(s.loadUint(32)).toEqual(POINTS_MAGIC);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_WIDTH);
    expect(s.loadUint(16)).toEqual(DEFAULT_CANVAS_HEIGHT);
    expect(s.loadUint(32)).toEqual(1024);
    expect(s.loadUint(16)).toEqual(512);
    expect(s.loadUint(8)).toEqual(7);
    expect(hasNonZeroPointColor(s.loadRef())).toEqual(true);
}

get fun `test commit rejects incomplete high-capacity upload`() {
    val (contract, deployer, _) = setupTest();

    val upload = contract.sendUploadVertexChunk(
        deployer.address,
        0,
        6250,
        vertexChunk(0),
        { value: ton("0.05") },
    );
    expect(upload).toHaveSuccessfulTx<UploadVertexChunk>({
        from: deployer.address,
        to: contract.address,
    });

    val commit = contract.sendCommitModel(
        deployer.address,
        100000,
        0,
        0x11,
        0x22,
        { value: ton("0.05") },
    );
    expect(commit).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidCommit,
    });
}

get fun `test invalid chunks are rejected`() {
    val (contract, deployer, _) = setupTest();

    val res = contract.sendUploadVertexChunk(
        deployer.address,
        0,
        1,
        beginCell().storeUint(1, 7).endCell(),
        { value: ton("0.05") },
    );
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidChunk,
    });
}

get fun `test non-owner cannot mutate model`() {
    val (contract, _, notDeployer) = setupTest();

    val res = contract.sendUploadVertexChunk(
        notDeployer.address,
        0,
        1,
        triangleVertices(),
        { value: ton("0.05") },
    );
    expect(res).toHaveFailedTx({
        from: notDeployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
}

fun setupTest(): (OnchainRenderer, Treasury, Treasury) {
    val deployer = testing.treasury("deployer");
    val notDeployer = testing.treasury("notDeployer");

    val contract = OnchainRenderer.fromStorage(Storage.default(deployer.address));
    val res = contract.deploy(deployer.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, deployer, notDeployer);
}

fun setupCommittedTriangle(): (OnchainRenderer, Treasury, Treasury) {
    val (contract, deployer, notDeployer) = setupTest();
    uploadTriangle(contract, deployer);
    val res = contract.sendCommitModel(
        deployer.address,
        3,
        1,
        0x01,
        0x02,
        { value: ton("0.05") },
    );
    expect(res).toHaveSuccessfulTx<CommitModel>({
        from: deployer.address,
        to: contract.address,
    });
    return (contract, deployer, notDeployer);
}

fun uploadTriangle(contract: OnchainRenderer, deployer: Treasury) {
    val verticesRes = contract.sendUploadVertexChunk(
        deployer.address,
        0,
        1,
        triangleVertices(),
        { value: ton("0.05") },
    );
    expect(verticesRes).toHaveSuccessfulTx<UploadVertexChunk>({
        from: deployer.address,
        to: contract.address,
    });

    val facesRes = contract.sendUploadFaceChunk(
        deployer.address,
        0,
        1,
        triangleFaces(),
        { value: ton("0.05") },
    );
    expect(facesRes).toHaveSuccessfulTx<UploadFaceChunk>({
        from: deployer.address,
        to: contract.address,
    });

    val uvsRes = contract.sendUploadFaceUvChunk(
        deployer.address,
        0,
        1,
        triangleUvs(),
        { value: ton("0.05") },
    );
    expect(uvsRes).toHaveSuccessfulTx<UploadFaceUvChunk>({
        from: deployer.address,
        to: contract.address,
    });
}

fun uploadTriangleShard(contract: OnchainRendererShard, deployer: Treasury) {
    val verticesRes = contract.sendUploadVertexChunk(
        deployer.address,
        0,
        1,
        triangleVertices(),
        { value: ton("0.05") },
    );
    expect(verticesRes).toHaveSuccessfulTx<UploadVertexChunk>({
        from: deployer.address,
        to: contract.address,
    });

    val facesRes = contract.sendUploadFaceChunk(
        deployer.address,
        0,
        1,
        triangleFaces(),
        { value: ton("0.05") },
    );
    expect(facesRes).toHaveSuccessfulTx<UploadFaceChunk>({
        from: deployer.address,
        to: contract.address,
    });

    val uvsRes = contract.sendUploadFaceUvChunk(
        deployer.address,
        0,
        1,
        triangleUvs(),
        { value: ton("0.05") },
    );
    expect(uvsRes).toHaveSuccessfulTx<UploadFaceUvChunk>({
        from: deployer.address,
        to: contract.address,
    });
}

fun triangleVertices(): cell {
    return beginCell()
        .storeInt(-16, 16)
        .storeInt(-16, 16)
        .storeInt(0, 16)
        .storeInt(16, 16)
        .storeInt(-16, 16)
        .storeInt(0, 16)
        .storeInt(0, 16)
        .storeInt(16, 16)
        .storeInt(0, 16)
        .endCell();
}

fun triangleFaces(): cell {
    return beginCell()
        .storeUint(0, 16)
        .storeUint(1, 16)
        .storeUint(2, 16)
        .storeUint(180, 8)
        .endCell();
}

fun triangleUvs(): cell {
    return beginCell()
        .storeUint(0, 8)
        .storeUint(255, 8)
        .storeUint(255, 8)
        .storeUint(255, 8)
        .storeUint(128, 8)
        .storeUint(0, 8)
        .endCell();
}

fun texture2x2(): cell {
    return beginCell()
        .storeUint(0xffe0, 16)
        .storeUint(0x001f, 16)
        .storeUint(0xf800, 16)
        .storeUint(0xffff, 16)
        .endCell();
}

fun uploadVertexChunks(contract: OnchainRenderer, deployer: Treasury, total: uint16) {
    var index = 0;
    while (index < total) {
        val res = contract.sendUploadVertexChunk(
            deployer.address,
            index,
            total,
            vertexChunk(index),
            { value: ton("0.05") },
        );
        expect(res).toHaveSuccessfulTx<UploadVertexChunk>({
            from: deployer.address,
            to: contract.address,
        });
        index = index + 1;
    }
}

fun vertexChunk(seed: int): cell {
    var b = beginCell();
    var i = 0;
    while (i < VERTICES_PER_CHUNK) {
        b.storeInt(((seed + i) % 64) - 32, 16);
        b.storeInt(((seed * 3 + i) % 64) - 32, 16);
        b.storeInt(((seed * 5 + i) % 64) - 32, 16);
        i = i + 1;
    }
    return b.endCell();
}

fun uploadTextureChunks(
    contract: OnchainRenderer,
    deployer: Treasury,
    total: uint16,
    totalBytes: int,
) {
    var index = 0;
    while (index < total) {
        val res = contract.sendUploadTextureChunk(
            deployer.address,
            index,
            total,
            textureChunk(index, total, totalBytes),
            { value: ton("0.05") },
        );
        expect(res).toHaveSuccessfulTx<UploadTextureChunk>({
            from: deployer.address,
            to: contract.address,
        });
        index = index + 1;
    }
}

fun textureChunk(index: int, total: int, totalBytes: int): cell {
    var bytes = TEXTURE_BYTES_PER_CHUNK;
    if (index == total - 1) {
        bytes = totalBytes - (index * TEXTURE_BYTES_PER_CHUNK);
        if (bytes == 0) {
            bytes = TEXTURE_BYTES_PER_CHUNK;
        }
    }

    var b = beginCell();
    var i = 0;
    while (i < bytes) {
        b.storeUint((index * 17 + i) % 256, 8);
        i = i + 1;
    }
    return b.endCell();
}

fun hasNonZeroPixels(root: cell): bool {
    var current: cell? = root;
    while (current != null) {
        var s = current!.beginParse();
        while (s.remainingBitsCount() >= 8) {
            if (s.loadUint(8) > 0) {
                return true;
            }
        }
        if (s.remainingRefsCount() > 0) {
            current = s.loadRef();
        } else {
            current = null;
        }
    }
    return false;
}

fun hasNonZeroPointColor(root: cell): bool {
    var current: cell? = root;
    while (current != null) {
        var s = current!.beginParse();
        while (s.remainingBitsCount() >= 56) {
            s.loadInt(16);
            s.loadInt(16);
            s.loadInt(16);
            if (s.loadUint(8) > 0) {
                return true;
            }
        }
        if (s.remainingRefsCount() > 0) {
            current = s.loadRef();
        } else {
            current = null;
        }
    }
    return false;
}
