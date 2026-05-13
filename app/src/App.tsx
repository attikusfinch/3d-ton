import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { formatAddressForNetwork, getTonClient, networkLabel } from './lib/ton';
import {
  compileObjToMesh,
  compileTextureFile,
  decodeRenderCell,
  decodeRenderPointsCell,
  rgb332ToRgb,
  sampleObj,
  type CompiledMesh,
  type CompiledTexture,
  type RenderBand,
  type RenderPointBatch,
} from './lib/mesh';
import {
  buildUploadPayloads,
  createRendererContract,
  createTonConnectSender,
  DEFAULT_MAX_FACES,
  DEFAULT_MAX_VERTICES,
  DEFAULT_RENDER_POINTS,
  DEFAULT_RENDER_ROWS,
  MESSAGE_VALUE,
  getWalletMessageBatchSize,
  openRenderer,
  sendRendererPayloads,
  type UploadProgress,
} from './lib/onchainRenderer';

const RESOLUTIONS = [32, 64, 128, 256, 512] as const;

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
  const [mesh, setMesh] = useState<CompiledMesh | null>(null);
  const [texture, setTexture] = useState<CompiledTexture | null>(null);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [renderedAt, setRenderedAt] = useState('');

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

  useEffect(() => {
    paintEmptyCanvas(canvasRef.current, resolution);
  }, [resolution]);

  async function runTask(label: string, task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setStatus(label);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('Stopped');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeploy() {
    await runTask('Deploying scene', async () => {
      if (!walletAddress) throw new Error('Connect a wallet first.');

      const owner = Address.parse(walletAddress);
      const contract = createRendererContract(owner, resolution);
      const sender = createTonConnectSender(
        tonConnectUI,
        walletAddress,
        network,
      );
      const opened = getTonClient(network).open(contract);

      await opened.sendDeploy(sender, MESSAGE_VALUE);
      const address = contract.address.toString({
        bounceable: true,
        testOnly: network === 'testnet',
      });
      setContractAddress(address);
      setStatus('Scene deployed');
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
      setMesh(compiled);
      setTexture(null);
      setStatus('Sample mesh ready');
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
      setMesh(compiled);
      setStatus('OBJ mesh ready');
    });
  }

  async function handleTextureFile(file: File | null) {
    if (!file) return;
    await runTask('Compiling texture', async () => {
      const compiled = await compileTextureFile(file);
      setTexture(compiled);
      setStatus('Texture ready');
    });
  }

  async function handleUpload() {
    await runTask('Uploading mesh', async () => {
      if (!mesh) throw new Error('Compile an OBJ first.');
      if (!contractAddress.trim())
        throw new Error('Deploy or paste a contract address.');

      const address = Address.parse(contractAddress.trim());
      const payloads = buildUploadPayloads(mesh, resolution, texture);
      setProgress({
        done: 0,
        total: Math.ceil(payloads.length / walletBatchSize),
        label: 'Preparing batches',
      });
      await sendRendererPayloads(
        tonConnectUI,
        network,
        address,
        payloads,
        walletBatchSize,
        setProgress,
      );
      setStatus('Mesh committed on-chain');
    });
  }

  async function handleRender() {
    await runTask('Rendering rows', async () => {
      if (!contractAddress.trim())
        throw new Error('Deploy or paste a contract address.');
      const address = Address.parse(contractAddress.trim());
      const opened = openRenderer(network, address);
      const [vertexCount, faceCount, , , isCommitted] =
        await opened.getModelInfo();
      if (!isCommitted) throw new Error('Contract model is not committed.');

      paintEmptyCanvas(canvasRef.current, resolution);
      const totalVertices = Number(vertexCount);
      const totalFaces = Number(faceCount);

      if (
        totalVertices > DEFAULT_RENDER_POINTS ||
        totalFaces === 0 ||
        resolution >= 256
      ) {
        let frame = createFrame(resolution, resolution);
        let frameWidth: number = resolution;
        let frameHeight: number = resolution;

        for (
          let start = 0;
          start < totalVertices;
          start += DEFAULT_RENDER_POINTS
        ) {
          const count = Math.min(DEFAULT_RENDER_POINTS, totalVertices - start);
          setStatus(`Rendering points ${start}-${start + count - 1}`);
          const cell = await opened.getRenderPoints(
            BigInt(start),
            BigInt(count),
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
      } else {
        const frame = createFrame(resolution, resolution);
        for (let y0 = 0; y0 < resolution; y0 += DEFAULT_RENDER_ROWS) {
          const rows = Math.min(DEFAULT_RENDER_ROWS, resolution - y0);
          setStatus(`Rendering rows ${y0}-${y0 + rows - 1}`);
          const cell = await opened.getRenderRows(BigInt(y0), BigInt(rows));
          const band = decodeRenderCell(cell);
          writeBand(frame, band);
          drawFrame(canvasRef.current, frame, band.width, band.height);
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
              <Button onClick={handleUpload} disabled={busy || !mesh}>
                <Wallet className="size-4" />
                Upload
              </Button>
              <Button variant="outline" onClick={handleRender} disabled={busy}>
                <Play className="size-4" />
                Render
              </Button>
            </div>

            <div className="mesh-stats">
              <Stat label="Source" value={mesh?.sourceName ?? '-'} />
              <Stat
                label="Vertices"
                value={mesh ? String(mesh.vertices.length) : '-'}
              />
              <Stat
                label="Faces"
                value={mesh ? String(mesh.faces.length) : '-'}
              />
              <Stat
                label="UVs"
                value={mesh ? String(mesh.faceUvs.length) : '-'}
              />
              <Stat
                label="Samples"
                value={mesh ? String(mesh.surfaceSamples) : '-'}
              />
              <Stat label="Texture" value={texture?.sourceName ?? '-'} />
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
                value={mesh ? String(mesh.truncatedFaces) : '-'}
              />
              <Stat label="Batch" value={`${walletBatchSize}`} />
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
                setMesh(null);
                setTexture(null);
                setProgress(null);
                setError('');
                setRenderedAt('');
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

function writeBand(frame: Uint8ClampedArray, band: RenderBand) {
  for (let row = 0; row < band.rows; row += 1) {
    for (let x = 0; x < band.width; x += 1) {
      const value = band.pixels[row * band.width + x] ?? 0;
      const dst = ((band.y0 + row) * band.width + x) * 4;
      const [r, g, b] = colorFromPixel(value);
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
