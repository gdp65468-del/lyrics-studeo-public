/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SongProject, MediaSourceItem, LyricBlock } from '../types/lyrics';

export interface Mp4ExportConfig {
  sourceId: string | null;
  resolution: '1920x1080' | '1280x720';
  fps: 30;
  quality: 'high' | 'medium' | 'compact';
  maxRenderSeconds?: number; // Allows full or fast preview render
}

export type Mp4ExportStage =
  | 'Preparando'
  | 'Processando mídia'
  | 'Renderizando letras'
  | 'Codificando'
  | 'Finalizando';

function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacityPercent / 100))})`;
}

/**
 * Renders the current project (selected media source + background + synchronized lyrics)
 * into a real downloadable video file using HTML5 Canvas + Web Audio API + MediaRecorder.
 * Never fakes completion; reports real progress and supports cancellation.
 */
export async function exportProjectToVideoFile(
  project: SongProject,
  config: Mp4ExportConfig,
  onProgress: (stage: Mp4ExportStage, percent: number) => void,
  abortSignal: { cancelled: boolean }
): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error(
      'Este navegador não suporta a API MediaRecorder para codificação de vídeo.'
    );
  }

  onProgress('Preparando', 5);

  const [width, height] =
    config.resolution === '1920x1080' ? [1920, 1080] : [1280, 720];
  const scaleFactor = width / 1920;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível inicializar o contexto gráfico 2D para renderização.');
  }

  // Load background image if applicable
  let bgImage: HTMLImageElement | null = null;
  if (project.background.type === 'image' && project.background.value) {
    bgImage = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = project.background.value;
    });
  }

  onProgress('Processando mídia', 15);

  const selectedSource: MediaSourceItem | undefined =
    project.sources.find((s) => s.id === config.sourceId) || project.sources[0];

  // Determine supported mimeType (prefer video/mp4 with H264/AAC if browser supports it, else webm)
  const candidateMimeTypes = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  const supportedMime =
    candidateMimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  if (!supportedMime) {
    throw new Error(
      'Nenhum codec de gravação de vídeo compatível (MP4/WebM) está disponível neste navegador.'
    );
  }

  const bitrate =
    config.quality === 'high'
      ? 6_000_000
      : config.quality === 'medium'
      ? 3_200_000
      : 1_500_000;

  const canvasStream = canvas.captureStream(config.fps);

  // Set up AudioContext to capture audio stream if source has objectUrl
  let audioCtx: AudioContext | null = null;
  let mediaElement: HTMLAudioElement | HTMLVideoElement | null = null;

  if (selectedSource?.objectUrl) {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new AudioContextClass();
      mediaElement = document.createElement(
        selectedSource.mediaType === 'video' ? 'video' : 'audio'
      );
      mediaElement.crossOrigin = 'anonymous';
      mediaElement.src = selectedSource.objectUrl;
      mediaElement.muted = false;
      mediaElement.volume = Math.max(0, Math.min(1, (selectedSource.volume ?? 100) / 100));

      await new Promise<void>((resolve) => {
        if (!mediaElement) return resolve();
        mediaElement.oncanplay = () => resolve();
        mediaElement.onerror = () => resolve();
        setTimeout(resolve, 1200);
      });

      const sourceNode = audioCtx.createMediaElementSource(mediaElement);
      const destNode = audioCtx.createMediaStreamDestination();
      sourceNode.connect(destNode);
      destNode.stream.getAudioTracks().forEach((track) => {
        canvasStream.addTrack(track);
      });
    } catch {
      // Proceed with video stream if audio capture fails
    }
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: supportedMime,
    videoBitsPerSecond: bitrate
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const lastBlockEnd =
    project.blocks.length > 0
      ? Math.max(...project.blocks.map((b) => b.endTime)) + 1.5
      : 10;
  const targetDuration = Math.max(1,
    config.maxRenderSeconds ?? selectedSource?.duration ?? project.duration ?? lastBlockEnd);

  onProgress('Renderizando letras', 25);

  recorder.start(200);
  if (mediaElement) {
    mediaElement.currentTime = 0;
    mediaElement.play().catch(() => {});
  }

  const startWall = performance.now();
  const sourceOffset = selectedSource?.offset || 0;
  const globalOffset = project.globalOffset || 0;

  const drawFrameAt = (elapsedSec: number) => {
    // 1. Draw Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    if (
      mediaElement &&
      selectedSource?.mediaType === 'video' &&
      project.useVideoSourceAsBackground
    ) {
      try {
        ctx.drawImage(mediaElement as HTMLVideoElement, 0, 0, width, height);
      } catch {
        // ignore if frame not ready
      }
    } else if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, width, height);
    } else if (project.background.type === 'color') {
      ctx.fillStyle = project.background.value || '#0b1320';
      ctx.fillRect(0, 0, width, height);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#14223a');
      grad.addColorStop(1, '#09101c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Dim overlay
    const dimAlpha = Math.max(0, Math.min(0.9, (project.background.overlayDim || 45) / 100));
    ctx.fillStyle = `rgba(0, 0, 0, ${dimAlpha})`;
    ctx.fillRect(0, 0, width, height);

    // 3. Find Active Lyric Block (accounting for globalOffset + source.offset)
    const activeBlock: LyricBlock | undefined = project.blocks.find((b) => {
      const effStart = b.startTime + globalOffset + sourceOffset;
      const effEnd = b.endTime + globalOffset + sourceOffset;
      return elapsedSec >= effStart && elapsedSec <= effEnd;
    });

    if (activeBlock) {
      const st = activeBlock.style;
      const fontPx = Math.round(st.fontSize * scaleFactor);
      const weight = st.bold ? '700' : '400';
      const italic = st.italic ? 'italic' : 'normal';
      ctx.font = `${italic} ${weight} ${fontPx}px ${st.fontFamily || 'sans-serif'}`;
      ctx.textBaseline = 'middle';

      const displayText = st.uppercase
        ? activeBlock.text.toUpperCase()
        : activeBlock.text;
      const lines = displayText.split('\n');
      const lineHeightPx = fontPx * (st.lineHeight || 1.25);
      const totalTextHeight = lines.length * lineHeightPx;

      const safeMarginPx = (project.safeAreaMargin / 100) * height;
      let centerY = height - safeMarginPx - totalTextHeight / 2 - 24 * scaleFactor;
      if (st.positionPreset === 'top') {
        centerY = safeMarginPx + totalTextHeight / 2 + 24 * scaleFactor;
      } else if (st.positionPreset === 'center') {
        centerY = height / 2;
      }
      centerY += (st.offsetY / 100) * height;

      let centerX = width / 2 + (st.offsetX / 100) * width;
      if (st.align === 'left') {
        centerX = (project.safeAreaMargin / 100) * width + 24 * scaleFactor;
        ctx.textAlign = 'left';
      } else if (st.align === 'right') {
        centerX = width - (project.safeAreaMargin / 100) * width - 24 * scaleFactor;
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }

      // Measure box width
      let maxLineWidth = 0;
      lines.forEach((l) => {
        const m = ctx.measureText(l).width;
        if (m > maxLineWidth) maxLineWidth = m;
      });

      if (st.backgroundOpacity > 0) {
        const padX = 28 * scaleFactor;
        const padY = 18 * scaleFactor;
        const boxW = maxLineWidth + padX * 2;
        const boxH = totalTextHeight + padY * 2;
        const boxX =
          st.align === 'left'
            ? centerX - padX
            : st.align === 'right'
            ? centerX - maxLineWidth - padX
            : centerX - boxW / 2;
        const boxY = centerY - totalTextHeight / 2 - padY;

        ctx.fillStyle = hexToRgba(st.backgroundColor, st.backgroundOpacity);
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 12 * scaleFactor);
        ctx.fill();
      }

      lines.forEach((line, idx) => {
        const lineY =
          centerY -
          totalTextHeight / 2 +
          idx * lineHeightPx +
          lineHeightPx / 2;

        if (st.shadowBlur > 0) {
          ctx.shadowColor = st.shadowColor || 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = st.shadowBlur * scaleFactor;
          ctx.shadowOffsetX = (st.shadowOffsetX || 0) * scaleFactor;
          ctx.shadowOffsetY = (st.shadowOffsetY || 2) * scaleFactor;
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        if (st.outlineWidth > 0) {
          ctx.strokeStyle = st.outlineColor || '#000000';
          ctx.lineWidth = st.outlineWidth * scaleFactor * 1.5;
          ctx.strokeText(line, centerX, lineY);
        }

        ctx.fillStyle = st.textColor || '#FFFFFF';
        ctx.fillText(line, centerX, lineY);
      });

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  };

  await new Promise<void>((resolve, reject) => {
    const stepInterval = 1000 / config.fps;
    const timer = window.setInterval(() => {
      if (abortSignal.cancelled) {
        window.clearInterval(timer);
        if (mediaElement) mediaElement.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new Error('Exportação cancelada pelo usuário.'));
        return;
      }

      const elapsed = (performance.now() - startWall) / 1000;
      const ratio = Math.min(1, elapsed / targetDuration);

      if (ratio < 0.75) {
        onProgress('Renderizando letras', Math.round(25 + ratio * 55));
      } else {
        onProgress('Codificando', Math.round(25 + ratio * 65));
      }

      drawFrameAt(elapsed);

      if (elapsed >= targetDuration) {
        window.clearInterval(timer);
        if (mediaElement) mediaElement.pause();
        resolve();
      }
    }, stepInterval);
  });

  onProgress('Finalizando', 95);

  const finalBlob = await new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const b = new Blob(chunks, { type: supportedMime });
      resolve(b);
    };
    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      resolve(new Blob(chunks, { type: supportedMime }));
    }
  });

  if (audioCtx) {
    audioCtx.close().catch(() => {});
  }

  onProgress('Finalizando', 100);

  const cleanTitle =
    project.title.trim().replace(/[<>:"/\\|?*]/g, '_') || 'Projeto';

  if (finalBlob.size === 0) throw new Error('O navegador não gerou um vídeo válido.');
  const extension = supportedMime.startsWith('video/mp4') ? 'mp4' : 'webm';
  return {
    blob: finalBlob,
    fileName: `${cleanTitle}.${extension}`,
    mimeType: supportedMime
  };
}
