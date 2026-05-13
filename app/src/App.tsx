import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera as CameraIcon,
  Cuboid,
  ImageIcon,
  Moon,
  Play,
  Rocket,
  RotateCcw,
  Sun,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  THEME,
  TonConnectButton,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from '@tonconnect/ui-react';
import { Address } from '@ton/core';

import { Button } from '@/components/ui/button';
import { NetworkDropdown } from './components/NetworkDropdown';
import { useRouter } from './lib/router';
import {
  formatAddressForNetwork,
  getTonClient,
  hasToncenterApiKey,
  networkLabel,
} from './lib/ton';
import {
  compactMeshToFaces,
  compileObjToMesh,
  compileTextureFile,
  decodeRenderPatchCell,
  decodeRenderPointsCell,
  rgb332ToRgb,
  rgb565ToRgb,
  sampleObj,
  type CompiledMesh,
  type CompiledTexture,
  type MeshFaceFilterStats,
  type RenderPatch,
  type RenderPointBatch,
} from './lib/mesh';
import {
  buildUploadPayloads,
  buildSetCameraPayload,
  CAMERA_VIEWS,
  createRendererContract,
  createTonConnectSender,
  DEFAULT_CAMERA_VIEW,
  DEFAULT_DEPLOY_SEED,
  DEFAULT_MAX_FACES,
  DEFAULT_MAX_VERTICES,
  DEFAULT_RENDER_POINTS,
  DEPLOY_MESSAGE_VALUE,
  estimateRendererPayloadBatches,
  fitCameraForView,
  getWalletMessageBatchSize,
  MAX_DEPLOY_SEED,
  normalizeDeploySeed,
  openRenderer,
  PAYLOAD_MESSAGE_VALUE,
  projectMeshVertex,
  sendRendererPayloads,
  type CameraView,
  type UploadProgress,
} from './lib/onchainRenderer';

const RESOLUTIONS = [32, 64, 128, 256, 512] as const;
const RPC_RETRY_DELAYS = [1500, 3500, 7000];
const MAX_RENDER_PATCH_PIXELS = 4096;

type FittedCamera = ReturnType<typeof fitCameraForView>;

function makeDeploySeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? DEFAULT_DEPLOY_SEED;
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('ton-dapp:theme');
    return stored === 'light' ? 'light' : 'dark';
  });
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ton-dapp:theme', theme);
    tonConnectUI.uiOptions = {
      uiPreferences: { theme: theme === 'light' ? THEME.LIGHT : THEME.DARK },
    };
  }, [theme, tonConnectUI]);

  return { theme, setTheme };
}

export default function App() {
  const { network, setTestnet } = useRouter();
  const walletAddress = useTonAddress();
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const { theme, setTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);

  const [resolution, setResolution] =
    useState<(typeof RESOLUTIONS)[number]>(32);
  const [contractAddress, setContractAddress] = useState('');
  const [sourceMesh, setSourceMesh] = useState<CompiledMesh | null>(null);
  const [mesh, setMesh] = useState<CompiledMesh | null>(null);
  const [meshOptimization, setMeshOptimization] =
    useState<MeshFaceFilterStats | null>(null);
  const [optimizingMesh, setOptimizingMesh] = useState(false);
  const [texture, setTexture] = useState<CompiledTexture | null>(null);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [renderedAt, setRenderedAt] = useState('');
  const [cameraViewId, setCameraViewId] = useState(DEFAULT_CAMERA_VIEW.id);
  const [deploySeed, setDeploySeed] = useState(makeDeploySeed);
  const [localMeshUploaded, setLocalMeshUploaded] = useState(false);

  const formattedWallet = useMemo(() => {
    if (!walletAddress) return '';
    try {
      return formatAddressForNetwork(walletAddress, network);
    } catch {
      return walletAddress;
    }
  }, [network, walletAddress]);
  const walletBatchSize = useMemo(
    () => getWalletMessageBatchSize(wallet),
    [wallet],
  );
  const cameraView = useMemo(
    () =>
      CAMERA_VIEWS.find((view) => view.id === cameraViewId) ??
      DEFAULT_CAMERA_VIEW,
    [cameraViewId],
  );
  const uploadEstimate = useMemo(() => {
    if (!mesh) return null;
    const payloads = buildUploadPayloads(mesh, resolution, texture, cameraView);
    const rawPayloads =
      sourceMesh && sourceMesh !== mesh
        ? buildUploadPayloads(sourceMesh, resolution, texture, cameraView)
        : payloads;
    const uploadValue = PAYLOAD_MESSAGE_VALUE * BigInt(payloads.length);
    const savedMessages = Math.max(0, rawPayloads.length - payloads.length);
    return {
      messages: payloads.length,
      batches: estimateRendererPayloadBatches(payloads, walletBatchSize),
      uploadValue,
      deployAndUploadValue: DEPLOY_MESSAGE_VALUE + uploadValue,
      rawMessages: rawPayloads.length,
      savedMessages,
      savedUploadValue: PAYLOAD_MESSAGE_VALUE * BigInt(savedMessages),
    };
  }, [cameraView, mesh, resolution, sourceMesh, texture, walletBatchSize]);

  useEffect(() => {
    paintEmptyCanvas(canvasRef.current, resolution);
  }, [resolution]);

  useEffect(() => {
    let cancelled = false;

    if (!sourceMesh) {
      setMesh(null);
      setMeshOptimization(null);
      setOptimizingMesh(false);
      return;
    }

    setOptimizingMesh(true);
    setLocalMeshUploaded(false);
    void optimizeMeshForCamera(sourceMesh, resolution, cameraView)
      .then(({ mesh: optimizedMesh, stats }) => {
        if (cancelled) return;
        setMesh(optimizedMesh);
        setMeshOptimization(stats);
        setStatus(
          `Optimized for ${cameraView.label}: ${stats.keptFaces}/${stats.sourceFaces} faces`,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMesh(sourceMesh);
        setMeshOptimization(createPassthroughOptimizationStats(sourceMesh));
        setError(`Optimization failed: ${formatTaskError(err)}`);
        setStatus('Optimization failed');
      })
      .finally(() => {
        if (!cancelled) setOptimizingMesh(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cameraView, resolution, sourceMesh]);

  async function runTask(label: string, task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setStatus(label);
    try {
      await task();
    } catch (err) {
      setError(formatTaskError(err));
      setStatus('Stopped');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeploy() {
    await runTask('Deploying scene', async () => {
      if (!walletAddress) throw new Error('Connect a wallet first.');

      const owner = Address.parse(walletAddress);
      const seed = normalizeDeploySeed(deploySeed);
      setDeploySeed(seed);
      const contract = createRendererContract(owner, resolution, seed);
      const sender = createTonConnectSender(
        tonConnectUI,
        walletAddress,
        network,
      );
      const opened = getTonClient(network).open(contract);

      await opened.sendDeploy(sender, DEPLOY_MESSAGE_VALUE);
      const address = contract.address.toString({
        bounceable: true,
        testOnly: network === 'testnet',
      });
      setContractAddress(address);
      setLocalMeshUploaded(false);
      setStatus(`Scene deployed with seed ${seed}. Compile and upload a mesh.`);
    });
  }

  async function handleSample() {
    await runTask('Compiling sample', async () => {
      const compiled = await compileObjToMesh(
        sampleObj(),
        'sample-cube.obj',
        DEFAULT_MAX_VERTICES,
        DEFAULT_MAX_FACES,
      );
      setSourceMesh(compiled);
      setMesh(compiled);
      setTexture(null);
      setLocalMeshUploaded(false);
      setStatus('Sample mesh ready. Optimizing for camera.');
    });
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    await runTask('Compiling OBJ', async () => {
      const source = await file.text();
      const compiled = await compileObjToMesh(
        source,
        file.name,
        DEFAULT_MAX_VERTICES,
        DEFAULT_MAX_FACES,
      );
      setSourceMesh(compiled);
      setMesh(compiled);
      setLocalMeshUploaded(false);
      setStatus('OBJ mesh ready. Optimizing for camera.');
    });
  }

  async function handleTextureFile(file: File | null) {
    if (!file) return;
    await runTask('Compiling texture', async () => {
      const compiled = await compileTextureFile(file);
      setTexture(compiled);
      setLocalMeshUploaded(false);
      setStatus('Texture ready. Upload again to commit it on-chain.');
    });
  }

  async function handleUpload() {
    await runTask('Uploading mesh', async () => {
      if (!mesh) throw new Error('Compile an OBJ first.');
      if (optimizingMesh) throw new Error('Wait for camera optimization.');
      if (!contractAddress.trim())
        throw new Error('Deploy or paste a contract address.');

      const address = Address.parse(contractAddress.trim());
      const payloads = buildUploadPayloads(
        mesh,
        resolution,
        texture,
        cameraView,
      );
      setProgress({
        done: 0,
        total: estimateRendererPayloadBatches(payloads, walletBatchSize),
        label: `Preparing ${payloads.length} messages`,
      });
      await sendRendererPayloads(
        tonConnectUI,
        network,
        address,
        payloads,
        walletBatchSize,
        setProgress,
      );
      setLocalMeshUploaded(true);
      setStatus('Mesh committed on-chain');
    });
  }

  async function handleApplyCamera() {
    await runTask('Applying camera', async () => {
      if (!mesh) throw new Error('Compile an OBJ first.');
      if (!localMeshUploaded) {
        throw new Error(
          'Camera changes the optimized mesh. Click Upload to commit this camera view.',
        );
      }
      if (!contractAddress.trim())
        throw new Error('Deploy or paste a contract address.');

      const address = Address.parse(contractAddress.trim());
      const payload = buildSetCameraPayload(mesh, resolution, cameraView);
      setProgress({
        done: 0,
        total: 1,
        label: `Applying ${cameraView.label}`,
      });
      await sendRendererPayloads(
        tonConnectUI,
        network,
        address,
        [payload],
        walletBatchSize,
        setProgress,
      );
      setStatus(`${cameraView.label} camera applied`);
    });
  }

  async function handleRender() {
    await runTask('Rendering rows', async () => {
      if (!contractAddress.trim())
        throw new Error('Deploy or paste a contract address.');
      const address = Address.parse(contractAddress.trim());
      const opened = openRenderer(network, address);
      const renderRpc = createRenderRpcScheduler(
        hasToncenterApiKey(network) ? 150 : 1150,
        setStatus,
      );
      const [vertexCount, faceCount, , , isCommitted] = await renderRpc(
        'Reading model info',
        () => opened.getModelInfo(),
      );
      if (!isCommitted) {
        throw new Error(
          mesh
            ? 'This contract is empty. Sample/OBJ is only local until you click Upload.'
            : 'This contract has no committed model. Compile and upload a mesh first.',
        );
      }

      paintEmptyCanvas(canvasRef.current, resolution);
      const totalVertices = Number(vertexCount);
      const totalFaces = Number(faceCount);

      const renderPoints = async () => {
        let frame = createFrame(resolution, resolution);
        let frameWidth: number = resolution;
        let frameHeight: number = resolution;

        for (
          let start = 0;
          start < totalVertices;
          start += DEFAULT_RENDER_POINTS
        ) {
          const count = Math.min(DEFAULT_RENDER_POINTS, totalVertices - start);
          const label = `Rendering points ${start}-${start + count - 1}`;
          const cell = await renderRpc(label, () =>
            opened.getRenderPoints(BigInt(start), BigInt(count)),
          );
          const batch = decodeRenderPointsCell(cell);
          if (start === 0) {
            frameWidth = batch.width;
            frameHeight = batch.height;
            frame = createFrame(frameWidth, frameHeight);
          }
          writePointBatch(frame, batch);
          drawFrame(canvasRef.current, frame, frameWidth, frameHeight);
        }
      };

      const renderFacePatches = async () => {
        if (!mesh || !localMeshUploaded || mesh.faces.length < totalFaces) {
          throw new Error(
            'Patch render needs the committed mesh loaded locally. Click Sample/OBJ, Upload, then Render again.',
          );
        }

        const frame = createFrame(resolution, resolution);
        const camera = fitCameraForView(mesh.vertices, resolution, cameraView);
        for (let faceIndex = 0; faceIndex < totalFaces; faceIndex += 1) {
          const bounds = faceBounds(mesh, faceIndex, camera, resolution);
          if (!bounds) continue;

          for (const patch of splitBounds(bounds, MAX_RENDER_PATCH_PIXELS)) {
            const label = `Rendering face ${faceIndex + 1}/${totalFaces}`;
            const cell = await renderRpc(label, () =>
              opened.getRenderFacePatch(
                BigInt(faceIndex),
                BigInt(patch.x0),
                BigInt(patch.y0),
                BigInt(patch.width),
                BigInt(patch.height),
              ),
            );
            writePatch(frame, decodeRenderPatchCell(cell));
          }
          drawFrame(canvasRef.current, frame, resolution, resolution);
        }
      };

      if (totalFaces === 0) {
        await renderPoints();
      } else {
        try {
          await renderFacePatches();
        } catch (err) {
          if (isGetMethodOutOfGas(err)) {
            throw new Error(
              'Patch render exceeded TVM gas. Try a smaller resolution or fewer faces.',
            );
          }
          throw err;
        }
      }

      setRenderedAt(new Date().toLocaleTimeString());
      setStatus('Render complete');
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-7 h-[60px] border-b sticky top-0 z-50 bg-background/95 backdrop-blur max-sm:px-4 max-sm:h-auto max-sm:flex-wrap max-sm:gap-2.5 max-sm:py-3">
        <div className="flex items-center gap-2.5 text-[17px] font-bold max-sm:text-[15px]">
          <div className="size-8 rounded-md bg-primary flex items-center justify-center text-white">
            <Cuboid className="size-[18px]" />
          </div>
          TON Onchain Renderer
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full size-10 bg-secondary max-sm:size-9"
            title="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="size-[18px]" />
            ) : (
              <Moon className="size-[18px]" />
            )}
          </Button>
          <NetworkDropdown network={network} setTestnet={setTestnet} />
          <TonConnectButton />
        </div>
      </header>

      <main className="renderer-shell">
        <section className="renderer-canvas-panel">
          <div className="renderer-canvas-toolbar">
            <div>
              <p className="panel-label">Canvas</p>
              <h1>
                {resolution}x{resolution} TVM render
              </h1>
            </div>
            <div className="resolution-group" aria-label="Resolution">
              {RESOLUTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === resolution ? 'is-active' : ''}
                  onClick={() => setResolution(value)}
                  disabled={busy}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="canvas-stage">
            <canvas
              ref={canvasRef}
              width={resolution}
              height={resolution}
              aria-label="On-chain render result"
            />
          </div>

          <div className="renderer-statusbar">
            <span>{status}</span>
            <span>
              {renderedAt ? `Rendered ${renderedAt}` : networkLabel(network)}
            </span>
          </div>
        </section>

        <aside className="renderer-control-panel">
          <div className="panel-block">
            <p className="panel-label">Scene</p>
            <div className="button-row">
              <Button onClick={handleDeploy} disabled={busy || !walletAddress}>
                <Rocket className="size-4" />
                Deploy
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeploySeed(makeDeploySeed())}
                disabled={busy}
                title="Generate deploy seed"
              >
                <RotateCcw className="size-4" />
                Seed
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleSample()}
                disabled={busy}
              >
                <Cuboid className="size-4" />
                Sample
              </Button>
            </div>
            <label className="field-label" htmlFor="contract-address">
              Contract
            </label>
            <input
              id="contract-address"
              className="text-input"
              value={contractAddress}
              onChange={(event) => setContractAddress(event.target.value)}
              placeholder="EQ..."
              spellCheck={false}
            />
            <label className="field-label" htmlFor="deploy-seed">
              Seed
            </label>
            <input
              id="deploy-seed"
              className="text-input"
              type="number"
              min={0}
              max={MAX_DEPLOY_SEED}
              value={deploySeed}
              onChange={(event) =>
                setDeploySeed(normalizeDeploySeed(event.target.valueAsNumber))
              }
            />
          </div>

          <div className="panel-block">
            <p className="panel-label">Camera</p>
            <div className="camera-preset-grid" aria-label="Camera view">
              {CAMERA_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={view.id === cameraView.id ? 'is-active' : ''}
                  onClick={() => setCameraViewId(view.id)}
                  disabled={busy}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={handleApplyCamera}
              disabled={busy || !mesh || optimizingMesh || !localMeshUploaded}
            >
              <CameraIcon className="size-4" />
              Apply Camera
            </Button>
          </div>

          <div className="panel-block">
            <p className="panel-label">Mesh</p>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".obj,text/plain"
              onChange={(event) =>
                void handleFile(event.target.files?.[0] ?? null)
              }
            />
            <input
              ref={textureInputRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) =>
                void handleTextureFile(event.target.files?.[0] ?? null)
              }
            />
            <div className="button-row">
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <Upload className="size-4" />
                OBJ
              </Button>
              <Button
                variant="secondary"
                onClick={() => textureInputRef.current?.click()}
                disabled={busy}
              >
                <ImageIcon className="size-4" />
                Texture
              </Button>
              <Button
                onClick={handleUpload}
                disabled={busy || !mesh || optimizingMesh}
              >
                <Wallet className="size-4" />
                Upload
              </Button>
              <Button
                variant="outline"
                onClick={handleRender}
                disabled={busy || optimizingMesh}
              >
                <Play className="size-4" />
                Render
              </Button>
            </div>

            <div className="mesh-stats">
              <Stat label="Source" value={sourceMesh?.sourceName ?? '-'} />
              <Stat
                label="Raw V"
                value={
                  meshOptimization
                    ? String(meshOptimization.sourceVertices)
                    : sourceMesh
                      ? String(sourceMesh.vertices.length)
                      : '-'
                }
              />
              <Stat
                label="Upload V"
                value={mesh ? String(mesh.vertices.length) : '-'}
              />
              <Stat
                label="Raw F"
                value={
                  meshOptimization
                    ? String(meshOptimization.sourceFaces)
                    : sourceMesh
                      ? String(sourceMesh.faces.length)
                      : '-'
                }
              />
              <Stat
                label="Upload F"
                value={mesh ? String(mesh.faces.length) : '-'}
              />
              <Stat
                label="UVs"
                value={mesh ? String(mesh.faceUvs.length) : '-'}
              />
              <Stat
                label="Samples"
                value={sourceMesh ? String(sourceMesh.surfaceSamples) : '-'}
              />
              <Stat label="Texture" value={texture?.sourceName ?? '-'} />
              <Stat label="Camera" value={cameraView.label} />
              <Stat
                label="On-chain"
                value={
                  optimizingMesh
                    ? 'Optimizing'
                    : localMeshUploaded
                      ? 'Committed'
                      : 'Needs upload'
                }
              />
              <Stat
                label="Culled F"
                value={
                  meshOptimization ? String(meshOptimization.culledFaces) : '-'
                }
              />
              <Stat
                label="Backfaces"
                value={
                  meshOptimization
                    ? String(meshOptimization.backfaceFaces)
                    : '-'
                }
              />
              <Stat
                label="Offscreen"
                value={
                  meshOptimization
                    ? String(meshOptimization.offscreenFaces)
                    : '-'
                }
              />
              <Stat
                label="Chunks"
                value={
                  mesh
                    ? `${
                        mesh.vertexChunks.length +
                        mesh.faceChunks.length +
                        mesh.faceUvChunks.length +
                        (texture?.chunks.length ?? 0)
                      }`
                    : '-'
                }
              />
              <Stat
                label="Skipped"
                value={sourceMesh ? String(sourceMesh.truncatedFaces) : '-'}
              />
              <Stat label="Batch" value={`${walletBatchSize}`} />
              <Stat
                label="Messages"
                value={uploadEstimate ? String(uploadEstimate.messages) : '-'}
              />
              <Stat
                label="Saved msg"
                value={
                  uploadEstimate ? String(uploadEstimate.savedMessages) : '-'
                }
              />
              <Stat
                label="Tx est."
                value={uploadEstimate ? String(uploadEstimate.batches) : '-'}
              />
              <Stat
                label="Upload TON"
                value={
                  uploadEstimate
                    ? `~${formatTon(uploadEstimate.uploadValue)}`
                    : '-'
                }
              />
              <Stat
                label="Deploy+upload"
                value={
                  uploadEstimate
                    ? `~${formatTon(uploadEstimate.deployAndUploadValue)}`
                    : '-'
                }
              />
              <Stat
                label="Saved TON"
                value={
                  uploadEstimate
                    ? `~${formatTon(uploadEstimate.savedUploadValue)}`
                    : '-'
                }
              />
            </div>
          </div>

          <div className="panel-block">
            <p className="panel-label">Wallet</p>
            <div className="wallet-readout">
              {formattedWallet || 'Not connected'}
            </div>
            {progress && (
              <div className="progress">
                <div>
                  <span>{progress.label}</span>
                  <span>
                    {progress.done}/{progress.total}
                  </span>
                </div>
                <progress value={progress.done} max={progress.total} />
              </div>
            )}
            {error && <div className="error-box">{error}</div>}
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setSourceMesh(null);
                setMesh(null);
                setMeshOptimization(null);
                setTexture(null);
                setProgress(null);
                setError('');
                setRenderedAt('');
                setDeploySeed(makeDeploySeed());
                setLocalMeshUploaded(false);
                setStatus('Idle');
                paintEmptyCanvas(canvasRef.current, resolution);
              }}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        </aside>
      </main>
    </div>
  );
}

async function optimizeMeshForCamera(
  sourceMesh: CompiledMesh,
  resolution: number,
  cameraView: CameraView,
): Promise<{ mesh: CompiledMesh; stats: MeshFaceFilterStats }> {
  if (!sourceMesh.faces.length) {
    return {
      mesh: sourceMesh,
      stats: createPassthroughOptimizationStats(sourceMesh),
    };
  }

  const camera = fitCameraForView(sourceMesh.vertices, resolution, cameraView);
  const positiveFaces: number[] = [];
  const negativeFaces: number[] = [];
  let positiveArea = 0;
  let negativeArea = 0;
  let offscreenFaces = 0;
  let degenerateFaces = 0;

  for (let faceIndex = 0; faceIndex < sourceMesh.faces.length; faceIndex += 1) {
    const face = sourceMesh.faces[faceIndex];
    if (!face) continue;

    const a = projectMeshVertex(
      sourceMesh.vertices[face.a]!,
      camera,
      resolution,
    );
    const b = projectMeshVertex(
      sourceMesh.vertices[face.b]!,
      camera,
      resolution,
    );
    const c = projectMeshVertex(
      sourceMesh.vertices[face.c]!,
      camera,
      resolution,
    );
    const area = signedFaceArea(a, b, c);

    if (Math.abs(area) < 1) {
      degenerateFaces += 1;
      continue;
    }

    if (isFaceOutsideViewport([a, b, c], resolution)) {
      offscreenFaces += 1;
      continue;
    }

    if (area > 0) {
      positiveFaces.push(faceIndex);
      positiveArea += area;
    } else {
      negativeFaces.push(faceIndex);
      negativeArea += Math.abs(area);
    }
  }

  const keptFaceIndices =
    positiveFaces.length === 0
      ? negativeFaces
      : negativeFaces.length === 0 || positiveArea >= negativeArea
        ? positiveFaces
        : negativeFaces;
  const backfaceFaces =
    positiveFaces.length + negativeFaces.length - keptFaceIndices.length;

  return compactMeshToFaces(
    sourceMesh,
    keptFaceIndices,
    {
      offscreenFaces,
      backfaceFaces,
      degenerateFaces,
    },
    `${cameraView.id}-cull`,
  );
}

function createPassthroughOptimizationStats(
  mesh: CompiledMesh,
): MeshFaceFilterStats {
  return {
    sourceVertices: mesh.vertices.length,
    sourceFaces: mesh.faces.length,
    keptVertices: mesh.vertices.length,
    keptFaces: mesh.faces.length,
    culledFaces: 0,
    offscreenFaces: 0,
    backfaceFaces: 0,
    degenerateFaces: 0,
  };
}

function signedFaceArea(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isFaceOutsideViewport(
  points: Array<{ x: number; y: number }>,
  size: number,
): boolean {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return maxX < 0 || maxY < 0 || minX >= size || minY >= size;
}

function formatTaskError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (isRpcRateLimit(err)) {
    return 'Toncenter RPC rate limit. Refresh and try again, or add TONCENTER_TESTNET_API_KEY / TONCENTER_MAINNET_API_KEY to .env for faster rendering.';
  }
  if (message.includes('exit_code: -14')) {
    return 'TVM get-method ran out of gas. I switched render calls to smaller chunks; refresh and try Render again.';
  }
  return message;
}

function createRenderRpcScheduler(
  minDelayMs: number,
  setStatus: (status: string) => void,
) {
  let nextAt = 0;

  return async function callRenderRpc<T>(
    label: string,
    call: () => Promise<T>,
  ): Promise<T> {
    const waitMs = Math.max(0, nextAt - Date.now());
    if (waitMs > 0) {
      setStatus(`${label} (waiting RPC)`);
      await sleep(waitMs);
    }

    nextAt = Date.now() + minDelayMs;
    return retryRpcCall(label, call, setStatus);
  };
}

async function retryRpcCall<T>(
  label: string,
  call: () => Promise<T>,
  setStatus: (status: string) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      setStatus(label);
      return await call();
    } catch (err) {
      if (!isRpcRateLimit(err) || attempt >= RPC_RETRY_DELAYS.length) {
        throw err;
      }
      const delay = RPC_RETRY_DELAYS[attempt]!;
      setStatus(`${label} rate-limited; retrying`);
      await sleep(delay);
    }
  }
}

function isRpcRateLimit(err: unknown): boolean {
  const value = err as {
    message?: string;
    status?: number;
    response?: { status?: number };
  };
  return (
    value?.status === 429 ||
    value?.response?.status === 429 ||
    Boolean(value?.message?.includes('429'))
  );
}

function isGetMethodOutOfGas(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).includes(
    'exit_code: -14',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatTon(nano: bigint): string {
  const scale = 1_000_000_000n;
  const whole = nano / scale;
  const fraction = (nano % scale)
    .toString()
    .padStart(9, '0')
    .slice(0, 3)
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function createFrame(width: number, height: number): Uint8ClampedArray {
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

function writePatch(frame: Uint8ClampedArray, patch: RenderPatch) {
  for (let row = 0; row < patch.height; row += 1) {
    for (let x = 0; x < patch.width; x += 1) {
      const value = patch.pixels[row * patch.width + x] ?? 0;
      if (value === 0) continue;
      const dst = ((patch.y0 + row) * patch.canvasWidth + patch.x0 + x) * 4;
      const [r, g, b] = rgb565ToRgb(value);
      frame[dst] = r;
      frame[dst + 1] = g;
      frame[dst + 2] = b;
      frame[dst + 3] = 255;
    }
  }
}

function writePointBatch(frame: Uint8ClampedArray, batch: RenderPointBatch) {
  const radius = batch.width >= 256 ? 2 : batch.width >= 128 ? 1 : 0;
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
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
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

function faceBounds(
  mesh: CompiledMesh,
  faceIndex: number,
  camera: FittedCamera,
  size: number,
) {
  const face = mesh.faces[faceIndex];
  if (!face) return null;

  const points = [face.a, face.b, face.c].map((index) =>
    projectMeshVertex(mesh.vertices[index]!, camera, size),
  );
  const minX = Math.max(0, Math.min(...points.map((point) => point.x)) - 1);
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)) - 1);
  const maxX = Math.min(
    size - 1,
    Math.max(...points.map((point) => point.x)) + 1,
  );
  const maxY = Math.min(
    size - 1,
    Math.max(...points.map((point) => point.y)) + 1,
  );

  if (maxX < 0 || maxY < 0 || minX >= size || minY >= size) return null;
  if (maxX < minX || maxY < minY) return null;

  return {
    x0: minX,
    y0: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function splitBounds(
  bounds: { x0: number; y0: number; width: number; height: number },
  maxPixels: number,
) {
  const side = Math.max(1, Math.floor(Math.sqrt(maxPixels)));
  const patches: Array<{
    x0: number;
    y0: number;
    width: number;
    height: number;
  }> = [];

  for (let y = bounds.y0; y < bounds.y0 + bounds.height; y += side) {
    for (let x = bounds.x0; x < bounds.x0 + bounds.width; x += side) {
      patches.push({
        x0: x,
        y0: y,
        width: Math.min(side, bounds.x0 + bounds.width - x),
        height: Math.min(side, bounds.y0 + bounds.height - y),
      });
    }
  }

  return patches;
}

function drawFrame(
  canvas: HTMLCanvasElement | null,
  frame: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (!canvas) return;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(width, height);
  image.data.set(frame);
  ctx.putImageData(image, 0, 0);
}

function paintEmptyCanvas(canvas: HTMLCanvasElement | null, size: number) {
  drawFrame(canvas, createFrame(size, size), size, size);
}

function colorFromPixel(value: number): [number, number, number] {
  if (value === 0) return [9, 14, 20];
  return rgb332ToRgb(value);
}
