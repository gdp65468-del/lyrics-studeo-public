import { MediaSourceItem, SongProject } from '../types/lyrics';
import { prepareMdsongPackage } from './mdsong';
import { Mp4ExportConfig } from './mp4Exporter';

interface WebViewBridge {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
}

function bridge(): WebViewBridge | null {
  return (window as typeof window & { chrome?: { webview?: WebViewBridge } }).chrome?.webview || null;
}

function callHost(method: string, params: unknown): Promise<unknown> {
  const host = bridge();
  if (!host) return Promise.reject(new Error('O host MediaDeck não está disponível.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      host.removeEventListener('message', receive);
      reject(new Error('O MediaDeck não respondeu a tempo.'));
    }, method === 'finishMdsong' || method === 'renderMdsongVideo' || method === 'finishAudioExtraction'
      ? 30 * 60 * 1000 : 60000);
    const receive = (event: MessageEvent) => {
      const value = event.data;
      if (!value || value.protocolVersion !== 1 || value.id !== id) return;
      window.clearTimeout(timer);
      host.removeEventListener('message', receive);
      if (value.success) resolve(value.result);
      else reject(new Error(value.error || 'Falha na comunicação com o MediaDeck.'));
    };
    host.addEventListener('message', receive);
    host.postMessage({ protocolVersion: 1, id, method, params });
  });
}

export async function canSaveThroughHost(): Promise<boolean> {
  if (!bridge()) return false;
  try {
    const capabilities = await callHost('getCapabilities', {}) as { packageWriter?: boolean };
    return capabilities.packageWriter === true;
  } catch { return false; }
}

export async function canExportVideoThroughHost(): Promise<boolean> {
  if (!bridge()) return false;
  try {
    const capabilities = await callHost('getCapabilities', {}) as { videoExporter?: boolean };
    return capabilities.videoExporter === true;
  } catch { return false; }
}

export async function canExtractAudioThroughHost(): Promise<boolean> {
  if (!bridge()) return false;
  try {
    const capabilities = await callHost('getCapabilities', {}) as { audioExtractor?: boolean };
    return capabilities.audioExtractor === true;
  } catch { return false; }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function extractAudioThroughHost(
  source: MediaSourceItem,
  onProgress: (stage: string, percent: number) => void,
  abortSignal?: { cancelled: boolean }
): Promise<{ blob: Blob; fileName: string }> {
  let sourceBlob = source.blob || null;
  if (!sourceBlob && source.objectUrl) sourceBlob = await (await fetch(source.objectUrl)).blob();
  if (!sourceBlob) throw new Error('O arquivo de vídeo não está disponível para conversão.');
  const begun = await callHost('beginAudioExtraction', {
    fileName: source.fileName, size: sourceBlob.size
  }) as { sessionId: string };
  const sessionId = begun.sessionId;
  try {
    for (let offset = 0; offset < sourceBlob.size; offset += 128 * 1024) {
      if (abortSignal?.cancelled) throw new Error('Conversão cancelada.');
      const chunk = new Uint8Array(await sourceBlob.slice(offset, offset + 128 * 1024).arrayBuffer());
      await callHost('appendAudioExtractionChunk', { sessionId, offset, data: toBase64(chunk) });
      onProgress('Enviando vídeo para conversão...', Math.round(((offset + chunk.length) / sourceBlob.size) * 45));
    }
    if (abortSignal?.cancelled) throw new Error('Conversão cancelada.');
    onProgress('Extraindo áudio MP3 320 kbps...', 55);
    const completed = await callHost('finishAudioExtraction', {
      sessionId, fileName: source.fileName
    }) as { sessionId: string; fileName: string; size: number };
    const chunks: Uint8Array[] = [];
    let offset = 0;
    while (true) {
      if (abortSignal?.cancelled) throw new Error('Conversão cancelada.');
      const chunk = await callHost('readAudioExtractionChunk', { sessionId: completed.sessionId, offset }) as {
        data: string; eof: boolean;
      };
      const bytes = fromBase64(chunk.data);
      chunks.push(bytes);
      offset += bytes.length;
      onProgress('Recebendo áudio convertido...', 55 + Math.round((offset / Math.max(1, completed.size)) * 45));
      if (chunk.eof) break;
    }
    return { blob: new Blob(chunks, { type: 'audio/mpeg' }), fileName: completed.fileName };
  } catch (error) {
    await callHost('cancelAudioExtraction', { sessionId }).catch(() => {});
    throw error;
  }
}

async function uploadPackage(project: SongProject,
  onProgress: (stage: string, percent: number) => void,
  abortSignal?: { cancelled: boolean }): Promise<{ sessionId: string; fileName: string }> {
  const prepared = await prepareMdsongPackage(project);
  const total = prepared.files.reduce((sum, file) => sum + file.blob.size, 0);
  const begun = await callHost('beginMdsong', {
    manifest: prepared.manifest, lyrics: prepared.lyrics,
    files: prepared.files.map(file => ({ path: file.path, size: file.blob.size }))
  }) as { sessionId: string };
  const sessionId = begun.sessionId;
  let transferred = 0;
  try {
    for (const file of prepared.files) {
      for (let offset = 0; offset < file.blob.size; offset += 128 * 1024) {
        if (abortSignal?.cancelled) throw new Error('Exportação cancelada.');
        const chunk = new Uint8Array(await file.blob.slice(offset, offset + 128 * 1024).arrayBuffer());
        let binary = '';
        for (let index = 0; index < chunk.length; index++) binary += String.fromCharCode(chunk[index]);
        await callHost('appendMdsongChunk', { sessionId, path: file.path, offset,
          data: btoa(binary) });
        transferred += chunk.length;
        onProgress('Transferindo mídias para o MediaDeck...', total ? Math.round(transferred / total * 85) : 85);
      }
    }
    return { sessionId, fileName: prepared.fileName };
  } catch (error) {
    await callHost('cancelMdsong', { sessionId }).catch(() => {});
    throw error;
  }
}

export async function saveMdsongThroughHost(
  project: SongProject, onProgress: (stage: string, percent: number) => void
): Promise<string> {
  const { sessionId, fileName } = await uploadPackage(project, onProgress);
  try {
    onProgress('Validando e gravando pacote...', 90);
    const completed = await callHost('finishMdsong', { sessionId, fileName }) as { path: string };
    onProgress('Concluído', 100);
    return completed.path;
  } catch (error) {
    await callHost('cancelMdsong', { sessionId }).catch(() => {});
    throw error;
  }
}

export async function exportMdsongVideoThroughHost(project: SongProject, config: Mp4ExportConfig,
  onProgress: (stage: string, percent: number) => void,
  abortSignal: { cancelled: boolean }): Promise<string> {
  const { sessionId, fileName } = await uploadPackage(project, onProgress, abortSignal);
  const cancellationCheck = window.setInterval(() => {
    if (abortSignal.cancelled) {
      window.clearInterval(cancellationCheck);
      void callHost('cancelMdsong', { sessionId }).catch(() => {});
    }
  }, 200);
  try {
    if (abortSignal.cancelled) throw new Error('Exportação cancelada.');
    onProgress('Renderizando vídeo MP4 pelo MediaDeck...', 90);
    const completed = await callHost('renderMdsongVideo', {
      sessionId, fileName, sourceId: config.sourceId,
      resolution: config.resolution, quality: config.quality,
      previewSeconds: config.maxRenderSeconds === 12 ? 12 : null
    }) as { path: string };
    onProgress('Concluído', 100);
    return completed.path;
  } catch (error) {
    await callHost('cancelMdsong', { sessionId }).catch(() => {});
    throw error;
  } finally { window.clearInterval(cancellationCheck); }
}
