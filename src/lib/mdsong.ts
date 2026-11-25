/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type JSZip from 'jszip';
import {
  SongProject,
  MediaSourceItem,
  MediaSourceRole,
  MdsongManifestV1,
  MdsongLyricsJsonV1,
  DEFAULT_LYRIC_STYLE
} from '../types/lyrics';
import { computeWaveformPeaksFromBlob, probeMediaDuration } from './waveform';

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ') || 'Projeto'
  );
}

async function fetchUrlAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export interface PreparedMdsongPackage {
  manifest: MdsongManifestV1;
  lyrics: MdsongLyricsJsonV1;
  files: { path: string; blob: Blob }[];
  fileName: string;
}

/** Produces metadata and file references without building a large ZIP in JavaScript. */
export async function prepareMdsongPackage(project: SongProject): Promise<PreparedMdsongPackage> {
  if (!project.title.trim()) throw new Error('Informe o nome da música antes de exportar.');
  if (project.sources.length === 0) throw new Error('Adicione um áudio ou vídeo antes de exportar o Projeto de Louvor.');
  if (project.referenceSourceId && !project.sources.some(source => source.id === project.referenceSourceId)) {
    throw new Error('A fonte de referência não existe neste projeto.');
  }

  const files: PreparedMdsongPackage['files'] = [];
  let coverPath: string | null = null;
  let coverBlob = project.cover.blob || null;
  if (!coverBlob && project.cover.imageUrl) coverBlob = await fetchUrlAsBlob(project.cover.imageUrl);
  if (project.cover.imageUrl && !coverBlob) throw new Error('A capa não pôde ser lida.');
  if (coverBlob) {
    coverPath = `cover/cover.${coverBlob.type.includes('png') ? 'png' : 'jpg'}`;
    files.push({ path: coverPath, blob: coverBlob });
  }

  const sources: MdsongManifestV1['sources'] = [];
  const used = new Set<string>();
  for (const source of project.sources) {
    const extension = source.fileName.split('.').pop()?.toLowerCase() || '';
    const supported = source.mediaType === 'video'
      ? ['mp4', 'mov', 'mkv', 'webm', 'm4v']
      : ['mp3', 'wav', 'aac', 'flac', 'ogg', 'wma'];
    if (!supported.includes(extension)) {
      throw new Error(`Formato não suportado no Projeto de Louvor: ${source.fileName}`);
    }
    if (!Number.isFinite(source.offset) || !Number.isFinite(source.duration)) {
      throw new Error(`Tempo inválido na fonte: ${source.name}`);
    }
    const folder = source.mediaType === 'video' ? 'video' : 'audio';
    const path = `${folder}/${source.id.replace(/[^A-Za-z0-9_-]/g, '_')}-${sanitizeFileName(source.fileName)}`;
    if (used.has(path)) throw new Error(`Fonte repetida: ${source.fileName}`);
    used.add(path);
    let blob = source.blob || null;
    if (!blob && source.objectUrl) blob = await fetchUrlAsBlob(source.objectUrl);
    if (!blob) throw new Error(`Arquivo da fonte não encontrado: ${source.fileName}`);
    files.push({ path, blob });
    sources.push({ id: source.id, name: source.name, role: source.role,
      mediaType: source.mediaType, file: path, duration: source.duration,
      offset: source.offset, volume: source.volume });
  }

  let backgroundPath: string | undefined;
  if (project.background.type === 'image' || project.background.type === 'video') {
    let blob = project.background.blob || null;
    if (!blob && project.background.value) blob = await fetchUrlAsBlob(project.background.value);
    if (!blob) throw new Error('O arquivo de background não pôde ser lido.');
    const ext = project.background.type === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
    backgroundPath = `background/background.${ext}`;
    files.push({ path: backgroundPath, blob });
  }

  const lyrics: MdsongLyricsJsonV1 = {
    version: 1, globalOffset: project.globalOffset,
    safeAreaMargin: project.safeAreaMargin,
    showSafeAreaGuide: project.showSafeAreaGuide,
    blocks: project.blocks.map(block => ({ id: block.id, sectionLabel: block.sectionLabel,
      start: block.startTime, end: block.endTime, text: block.text, style: block.style })),
    style: { fontFamily: project.defaultStyle.fontFamily, fontSize: project.defaultStyle.fontSize,
      fontWeight: project.defaultStyle.bold ? 700 : 400, color: project.defaultStyle.textColor,
      align: project.defaultStyle.align, fullStyle: project.defaultStyle }
  };
  const manifest: MdsongManifestV1 = {
    format: 'MediaDeckSong', version: 1, id: project.id, title: project.title,
    artist: project.artist, album: project.album, year: project.year,
    category: project.category, notes: project.notes, duration: project.duration,
    cover: coverPath, referenceSourceId: project.referenceSourceId,
    sources, lyrics: 'lyrics/lyrics.json',
    background: { type: project.background.type,
      value: project.background.type === 'color' || project.background.type === 'gradient'
        ? project.background.value : undefined,
      file: backgroundPath, overlayDim: project.background.overlayDim,
      useVideoSourceAsBackground: project.useVideoSourceAsBackground }
  };
  return { manifest, lyrics, files, fileName: `${sanitizeFileName(project.title)}.mdsong` };
}

/**
 * Packs a SongProject into a real, self-contained .mdsong archive (ZIP format internally)
 * following Sections 32-36 of the specification.
 */
export async function packMdsongPackage(
  project: SongProject,
  onProgress?: (stage: string, percent: number) => void
): Promise<{ blob: Blob; fileName: string; sizeBytes: number }> {
  onProgress?.('Validando estrutura do projeto...', 10);
  const prepared = await prepareMdsongPackage(project);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(prepared.manifest, null, 2));
  zip.file('lyrics/lyrics.json', JSON.stringify(prepared.lyrics, null, 2));
  for (const file of prepared.files) zip.file(file.path, file.blob);
  onProgress?.('Gerando pacote .mdsong...', 70);
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } },
    meta => onProgress?.('Compactando pacote .mdsong...', Math.min(99, Math.round(70 + meta.percent * 0.29)))
  );
  onProgress?.('Concluído', 100);
  return { blob, fileName: prepared.fileName, sizeBytes: blob.size };
}

/**
 * Unpacks and validates a .mdsong file into a ready-to-edit SongProject (Sections 37 & 38)
 */
export async function unpackMdsongPackage(file: File): Promise<SongProject> {
  if (file.size > 512 * 1024 * 1024) {
    throw new Error('Este projeto é grande demais para abrir no navegador. Use o MediaDeck para reproduzi-lo.');
  }
  let zip: JSZip;
  try {
    const JSZip = (await import('jszip')).default;
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(
      'Arquivo inválido ou corrompido: não foi possível ler o pacote .mdsong.'
    );
  }

  const entries = Object.values(zip.files);
  if (entries.length > 128 || entries.some(entry =>
    entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.includes(':') ||
    entry.name.split('/').some(part => part === '..' || part === '.'))) {
    throw new Error('O pacote contém caminhos inválidos ou arquivos demais.');
  }

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new Error(
      'Pacote .mdsong inválido: o arquivo obrigatório "manifest.json" não foi encontrado.'
    );
  }

  let manifest: MdsongManifestV1;
  try {
    const manifestText = await manifestEntry.async('string');
    manifest = JSON.parse(manifestText) as MdsongManifestV1;
  } catch {
    throw new Error('Erro ao ler manifest.json do pacote .mdsong.');
  }

  if (manifest.format !== 'MediaDeckSong') {
    throw new Error('Este arquivo não é um pacote MediaDeckSong válido.');
  }

  // Future compatibility check (Section 38)
  if (manifest.version !== 1 || !manifest.id || !manifest.title || !Array.isArray(manifest.sources)) {
    throw new Error(
      'Este projeto utiliza uma versão mais nova do formato MediaDeck Song.'
    );
  }

  // Load lyrics/lyrics.json
  const lyricsPath = manifest.lyrics;
  if (!lyricsPath?.startsWith('lyrics/') || !lyricsPath.endsWith('.json')) {
    throw new Error('O caminho das letras é inválido.');
  }
  const lyricsEntry = zip.file(lyricsPath);
  let lyricsData: MdsongLyricsJsonV1 | null = null;
  if (lyricsEntry) {
    try {
      const lyricsText = await lyricsEntry.async('string');
      lyricsData = JSON.parse(lyricsText) as MdsongLyricsJsonV1;
    } catch {
      lyricsData = null;
    }
  }
  if (!lyricsData || lyricsData.version !== 1 || !Array.isArray(lyricsData.blocks)) {
    throw new Error('As letras obrigatórias estão ausentes ou são inválidas.');
  }

  const referencedPaths = new Set<string>(['manifest.json', lyricsPath]);
  for (const source of manifest.sources) {
    if (!source.file?.startsWith(`${source.mediaType}/`) ||
        !['audio', 'video'].includes(source.mediaType) || !zip.file(source.file)) {
      throw new Error(`A fonte ${source.name || source.id} está ausente ou é inválida.`);
    }
    referencedPaths.add(source.file);
  }
  if (manifest.cover) referencedPaths.add(manifest.cover);
  if (manifest.background?.file) referencedPaths.add(manifest.background.file);
  if (entries.some(entry => !entry.dir && !referencedPaths.has(entry.name))) {
    throw new Error('O pacote contém arquivos não declarados.');
  }
  if (manifest.cover && !zip.file(manifest.cover)) throw new Error('A capa declarada não existe.');
  if (manifest.background?.file && !zip.file(manifest.background.file)) {
    throw new Error('O background declarado não existe.');
  }

  const defaultStyle = lyricsData?.style?.fullStyle
    ? { ...DEFAULT_LYRIC_STYLE, ...lyricsData.style.fullStyle }
    : {
        ...DEFAULT_LYRIC_STYLE,
        fontFamily: lyricsData?.style?.fontFamily || DEFAULT_LYRIC_STYLE.fontFamily,
        fontSize: lyricsData?.style?.fontSize || DEFAULT_LYRIC_STYLE.fontSize,
        bold: (lyricsData?.style?.fontWeight || 700) >= 600,
        textColor: lyricsData?.style?.color || DEFAULT_LYRIC_STYLE.textColor,
        align: lyricsData?.style?.align || DEFAULT_LYRIC_STYLE.align
      };

  // Load Cover
  let coverImageUrl: string | undefined;
  let coverBlob: Blob | undefined;
  if (manifest.cover) {
    const coverEntry = zip.file(manifest.cover);
    if (coverEntry) {
      const rawBlob = await coverEntry.async('blob');
      const mime = manifest.cover.endsWith('.png') ? 'image/png' : 'image/jpeg';
      coverBlob = new Blob([rawBlob], { type: mime });
      coverImageUrl = URL.createObjectURL(coverBlob);
    }
  }

  // Load Background
  let bgValue = manifest.background?.value || '#0b1320';
  let bgBlob: Blob | undefined;
  if (manifest.background?.file) {
    const bgEntry = zip.file(manifest.background.file);
    if (bgEntry) {
      const rawBlob = await bgEntry.async('blob');
      const isVid = manifest.background.type === 'video';
      bgBlob = new Blob([rawBlob], {
        type: isVid ? 'video/mp4' : 'image/jpeg'
      });
      bgValue = URL.createObjectURL(bgBlob);
    }
  }

  // Load Media Sources
  const loadedSources: MediaSourceItem[] = [];
  for (const s of manifest.sources || []) {
    const entry = zip.file(s.file);
    let mediaBlob: Blob | undefined;
    let objectUrl: string | undefined;
    let waveformPeaks: number[] | undefined;
    let duration = s.duration || 210;

    if (entry) {
      const raw = await entry.async('blob');
      const ext = s.file.split('.').pop()?.toLowerCase();
      const mime =
        s.mediaType === 'video'
          ? ext === 'webm'
            ? 'video/webm'
            : 'video/mp4'
          : ext === 'wav'
          ? 'audio/wav'
          : ext === 'm4a'
          ? 'audio/mp4'
          : 'audio/mpeg';

      mediaBlob = new Blob([raw], { type: mime });
      objectUrl = URL.createObjectURL(mediaBlob);

      try {
        const wf = await computeWaveformPeaksFromBlob(mediaBlob);
        waveformPeaks = wf.peaks;
        if (wf.duration > 0) duration = wf.duration;
      } catch {
        if (objectUrl) {
          duration = await probeMediaDuration(objectUrl, s.mediaType);
        }
      }
    }

    const validRole = (
      [
        'playback',
        'cantado',
        'instrumental',
        'audio',
        'video-playback',
        'video-cantado',
        'video'
      ].includes(s.role)
        ? s.role
        : s.mediaType === 'video'
        ? 'video'
        : 'audio'
    ) as MediaSourceRole;

    loadedSources.push({
      id: s.id,
      name: s.name,
      role: validRole,
      mediaType: s.mediaType,
      fileName: s.file.split('/').pop() || s.name,
      duration,
      offset: typeof s.offset === 'number' ? s.offset : 0,
      volume: typeof s.volume === 'number' ? s.volume : 100,
      blob: mediaBlob,
      objectUrl,
      waveformPeaks,
      fileMissing: !entry
    });
  }

  const blocks = (lyricsData?.blocks || []).map((b, idx) => ({
    id: b.id || `blk-${Date.now()}-${idx}`,
    sectionLabel: b.sectionLabel,
    startTime: typeof b.start === 'number' ? b.start : 0,
    endTime: typeof b.end === 'number' ? b.end : 5,
    text: b.text || '',
    style: b.style ? { ...defaultStyle, ...b.style } : { ...defaultStyle }
  }));

  const refId =
    manifest.referenceSourceId || loadedSources[0]?.id || null;

  return {
    id: manifest.id || `proj-${Date.now()}`,
    title: manifest.title || file.name.replace(/\.mdsong$/i, ''),
    artist: manifest.artist || '',
    album: manifest.album || '',
    year: manifest.year || '',
    category: manifest.category || '',
    notes: manifest.notes || '',
    duration: manifest.duration || loadedSources[0]?.duration || 240,
    globalOffset: lyricsData?.globalOffset || 0,
    referenceSourceId: refId,
    activePreviewSourceId: refId,
    sources: loadedSources,
    blocks,
    defaultStyle,
    safeAreaMargin: lyricsData?.safeAreaMargin ?? 8,
    showSafeAreaGuide: lyricsData?.showSafeAreaGuide ?? true,
    useVideoSourceAsBackground:
      manifest.background?.useVideoSourceAsBackground ?? true,
    cover: {
      imageUrl: coverImageUrl,
      blob: coverBlob,
      fileName: manifest.cover?.split('/').pop(),
      gradientFallback: 'linear-gradient(135deg, #1d3557, #457b9d)'
    },
    background: {
      type: manifest.background?.type || 'color',
      value: bgValue,
      overlayDim: manifest.background?.overlayDim ?? 45,
      blob: bgBlob,
      fileName: manifest.background?.file?.split('/').pop()
    },
    updatedAt: Date.now()
  };
}
