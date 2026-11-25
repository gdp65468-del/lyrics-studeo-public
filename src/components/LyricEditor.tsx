/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FolderOpen,
  FilePlus,
  Upload,
  Download,
  Package,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Wand2,
  FileText,
  Film,
  Eye,
  ArrowLeft,
  Clock,
  Sparkles,
  CheckCircle2,
  Loader2,
  ListMusic,
  Sliders,
  Activity,
  FolderCog,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  Edit3,
  Plus,
  Undo2,
  Redo2
} from 'lucide-react';
import {
  SongProject,
  MediaSourceItem,
  MediaSourceRole,
  LyricBlock,
  LyricStyle,
  SubtitleFormat,
  getRoleLabel,
  getRoleDefaultMediaType,
  formatMillisTimestamp,
  formatDurationShort,
  formatSignedOffset
} from '../types/lyrics';
import {
  parseLrcContent,
  parseSrtContent,
  parseVttContent,
  parseTxtContent,
  exportProjectToLrc,
  exportProjectToSrt,
  exportProjectToVtt
} from '../lib/parsers';
import {
  computeWaveformPeaksFromBlob,
  probeMediaDuration
} from '../lib/waveform';
import { packMdsongPackage } from '../lib/mdsong';
import {
  canExtractAudioThroughHost,
  canSaveThroughHost,
  extractAudioThroughHost,
  saveMdsongThroughHost
} from '../lib/hostBridge';
import { LeftProjectSidebar } from './LeftProjectSidebar';
import { RightPropertiesPanel } from './RightPropertiesPanel';
import {
  TxtImportModal,
  SubtitleConverterModal,
  Mp4ExportModal
} from './EditorModals';

interface LyricEditorProps {
  project: SongProject;
  onChangeProject: (updated: SongProject) => void;
  onBackToHome: () => void;
  onOpenNewProjectModal: () => void;
  onOpenMdsongFile: (file: File) => void;
  onOpenLivePresenter: () => void;
}

function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(
    clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean,
    16
  );
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(
    0,
    Math.min(1, opacityPercent / 100)
  )})`;
}

export const LyricEditor: React.FC<LyricEditorProps> = ({
  project,
  onChangeProject: rawOnChangeProject,
  onBackToHome,
  onOpenNewProjectModal,
  onOpenMdsongFile,
  onOpenLivePresenter
}) => {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    project.blocks[0]?.id || null
  );
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [timelineZoom, setTimelineZoom] = useState<number>(1.5);
  const [previewSelectedBlockWhenPaused] = useState<boolean>(true);
  const [mobileNavTab, setMobileNavTab] = useState<
    'sync' | 'lyrics' | 'edit' | 'media'
  >('sync');

  // Undo / Redo History Stack
  const undoStackRef = useRef<SongProject[]>([]);
  const redoStackRef = useRef<SongProject[]>([]);
  const lastHistoryPushTimeRef = useRef<number>(0);
  const [historyCounts, setHistoryCounts] = useState<{ undo: number; redo: number }>({
    undo: 0,
    redo: 0
  });

  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastHistoryPushTimeRef.current = 0;
    setHistoryCounts({ undo: 0, redo: 0 });
  }, [project.id]);

  const onChangeProject = (
    updated: SongProject,
    options?: { skipHistory?: boolean }
  ) => {
    if (!options?.skipHistory) {
      const now = Date.now();
      const shouldCoalesce = now - lastHistoryPushTimeRef.current < 450;
      if (!shouldCoalesce) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), project];
      }
      lastHistoryPushTimeRef.current = now;
      redoStackRef.current = [];
      setHistoryCounts({
        undo: undoStackRef.current.length,
        redo: 0
      });
    }
    rawOnChangeProject(updated);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, project];
    lastHistoryPushTimeRef.current = 0;
    setHistoryCounts({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length
    });
    rawOnChangeProject(previous);
    showNotice('Alteração desfeita');
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, project];
    lastHistoryPushTimeRef.current = 0;
    setHistoryCounts({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length
    });
    rawOnChangeProject(next);
    showNotice('Alteração refeita');
  };

  // Compact / Collapsed / Expanded state for the 16:9 preview
  const [previewCollapsed, setPreviewCollapsed] = useState<boolean>(false);
  const [previewExpandedMobile, setPreviewExpandedMobile] = useState<boolean>(false);
  const [stageWidth, setStageWidth] = useState<number>(480);

  // Menus & Modals
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [pendingImportFormat, setPendingImportFormat] =
    useState<SubtitleFormat>('lrc');
  const [txtModalData, setTxtModalData] = useState<{
    fileName: string;
    rawText: string;
  } | null>(null);
  const [showSubtitleConverter, setShowSubtitleConverter] = useState(false);
  const [showMp4ExportModal, setShowMp4ExportModal] = useState(false);

  // Packaging status
  const [packagingState, setPackagingState] = useState<{
    stage: string;
    percent: number;
  } | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Refs for media playback & timeline drag
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  // The HTML media element is the preview clock. Keeping this outside React
  // state prevents a re-render (or a delayed loadedmetadata event) from
  // seeking a playing video back to an old position.
  const currentTimeRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const subtitleFileInputRef = useRef<HTMLInputElement | null>(null);
  const mdsongInputRef = useRef<HTMLInputElement | null>(null);

  // Timeline drag state (blocks or playhead scrub)
  const [dragBlockState, setDragBlockState] = useState<{
    blockId: string;
    mode: 'move' | 'start' | 'end';
    initialX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);
  const [isScrubbingPlayhead, setIsScrubbingPlayhead] = useState<boolean>(false);

  // Stage text drag state
  const [isDraggingStageText, setIsDraggingStageText] = useState(false);

  // Measure actual 16:9 stage width so lyric font scales proportionally on all screens
  useEffect(() => {
    const el = previewStageRef.current;
    if (!el) return;
    const updateSize = () => {
      if (el.clientWidth > 0) {
        setStageWidth(el.clientWidth);
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewCollapsed, previewExpandedMobile]);

  // Active media source
  const activeSource: MediaSourceItem | undefined = useMemo(() => {
    return (
      project.sources.find((s) => s.id === project.activePreviewSourceId) ||
      project.sources.find((s) => s.id === project.referenceSourceId) ||
      project.sources[0]
    );
  }, [project.sources, project.activePreviewSourceId, project.referenceSourceId]);

  const totalDuration = Math.max(
    15,
    activeSource?.duration || project.duration || 180,
    ...(project.blocks.map((b) => b.endTime + 4) || [15])
  );

  const selectedBlock = useMemo(
    () => project.blocks.find((b) => b.id === selectedBlockId) || null,
    [project.blocks, selectedBlockId]
  );

  // Effective lyric block at currentTime (taking into account globalOffset + activeSource.offset)
  const effectiveSourceOffset = activeSource?.offset || 0;
  const effectiveGlobalOffset = project.globalOffset || 0;

  const currentLiveBlock = useMemo(() => {
    return (
      project.blocks.find((b) => {
        const start = b.startTime + effectiveGlobalOffset + effectiveSourceOffset;
        const end = b.endTime + effectiveGlobalOffset + effectiveSourceOffset;
        return currentTime >= start && currentTime <= end;
      }) || null
    );
  }, [
    project.blocks,
    currentTime,
    effectiveGlobalOffset,
    effectiveSourceOffset
  ]);

  const displayedStageBlock =
    isPlaying || !previewSelectedBlockWhenPaused
      ? currentLiveBlock
      : selectedBlock || currentLiveBlock;

  const showNotice = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Decode real waveform peaks via Web Audio API if activeSource has a blob and no peaks yet
  useEffect(() => {
    if (
      activeSource &&
      activeSource.blob &&
      (!activeSource.waveformPeaks || activeSource.waveformPeaks.length === 0) &&
      !activeSource.isDecodingWaveform
    ) {
      let cancelled = false;
      computeWaveformPeaksFromBlob(activeSource.blob, 160)
        .then((wf) => {
          if (cancelled) return;
          onChangeProject(
            {
              ...project,
              sources: project.sources.map((s) =>
                s.id === activeSource.id
                  ? {
                      ...s,
                      waveformPeaks: wf.peaks,
                      duration: wf.duration > 0 ? wf.duration : s.duration,
                      isDecodingWaveform: false
                    }
                  : s
              )
            },
            { skipHistory: true }
          );
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [activeSource?.id]);

  const updatePlaybackTime = (time: number) => {
    if (!Number.isFinite(time)) return;
    const normalized = Number(Math.max(0, time).toFixed(3));
    currentTimeRef.current = normalized;
    setCurrentTime((previous) =>
      Math.abs(previous - normalized) >= 0.01 ? normalized : previous
    );
  };

  const applyPendingSeek = (mediaEl: HTMLMediaElement) => {
    if (mediaEl.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const target = pendingSeekRef.current ?? currentTimeRef.current;
    if (!Number.isFinite(target)) return;

    const maximum = Number.isFinite(mediaEl.duration)
      ? Math.max(0, mediaEl.duration)
      : totalDuration;
    const clamped = Math.max(0, Math.min(maximum, target));
    if (Math.abs(mediaEl.currentTime - clamped) > 0.01) {
      mediaEl.currentTime = clamped;
    }
    pendingSeekRef.current = null;
  };

  const handleActiveMediaLoaded = (mediaEl: HTMLMediaElement) => {
    applyPendingSeek(mediaEl);
    if (isPlaying) {
      mediaEl.play().catch(() => setIsPlaying(false));
    }
  };

  // Sync play/pause with HTML5 Audio/Video element or fallback timer.
  // Do not assign currentTime here: this effect can run after React has
  // rendered an older closure and used to rewind a playing video.
  useEffect(() => {
    const mediaEl =
      activeSource?.mediaType === 'video' ? videoRef.current : audioRef.current;
    const otherEl =
      activeSource?.mediaType === 'video' ? audioRef.current : videoRef.current;

    if (otherEl) {
      otherEl.pause();
    }

    if (mediaEl && activeSource?.objectUrl && !activeSource.fileMissing) {
      mediaEl.muted = isMuted;
      mediaEl.volume = Math.max(0, Math.min(1, (activeSource.volume ?? 100) / 100));
      if (isPlaying) {
        applyPendingSeek(mediaEl);
        mediaEl.play().catch(() => {
          setIsPlaying(false);
        });
      } else {
        mediaEl.pause();
      }
      return;
    }

    // Fallback precision timer when no media blob is attached
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev + 0.05 >= totalDuration) {
          setIsPlaying(false);
          currentTimeRef.current = 0;
          return 0;
        }
        const next = Number((prev + 0.05).toFixed(3));
        currentTimeRef.current = next;
        return next;
      });
    }, 50);

    return () => window.clearInterval(interval);
  }, [isPlaying, activeSource?.id, activeSource?.objectUrl, isMuted, totalDuration]);

  // WebView can throttle timeupdate while the editor is being redrawn. Poll
  // the active element at animation-frame cadence so the playhead follows the
  // actual media clock without creating a second timer/player.
  useEffect(() => {
    if (!isPlaying || !activeSource?.objectUrl || activeSource.fileMissing) return;
    const mediaEl = activeSource.mediaType === 'video' ? videoRef.current : audioRef.current;
    if (!mediaEl) return;

    let frameId = 0;
    const tick = () => {
      if (!mediaEl.paused && !mediaEl.ended) {
        updatePlaybackTime(mediaEl.currentTime);
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, activeSource?.id, activeSource?.objectUrl, activeSource?.mediaType]);

  const seekTo = (timeSec: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, Number(timeSec.toFixed(3))));
    updatePlaybackTime(clamped);
    pendingSeekRef.current = clamped;
    const mediaEl = activeSource?.mediaType === 'video' ? videoRef.current : audioRef.current;
    if (mediaEl) {
      applyPendingSeek(mediaEl);
    }
  };

  // Reset only for an explicit media-source change or the Stop command. The
  // playhead drag is intentionally not part of this path.
  const resetPreviewPosition = () => {
    setIsPlaying(false);
    currentTimeRef.current = 0;
    pendingSeekRef.current = 0;
    setCurrentTime(0);
    const mediaEl = activeSource?.mediaType === 'video' ? videoRef.current : audioRef.current;
    if (mediaEl && mediaEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
      mediaEl.currentTime = 0;
    }
  };

  const selectPreviewSource = (sourceId: string) => {
    if (sourceId === activeSource?.id) return;
    resetPreviewPosition();
    handleUpdateProjectMeta({ activePreviewSourceId: sourceId });
  };

  // Section 21: Keyboard Shortcuts (including Ctrl+Z / Ctrl+Y Undo & Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        seekTo(currentTime - step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        seekTo(currentTime + step);
      } else if (e.key.toLowerCase() === 'i' && selectedBlock) {
        e.preventDefault();
        handleSetBlockStartAtPlayhead();
      } else if (e.key.toLowerCase() === 'o' && selectedBlock) {
        e.preventDefault();
        handleSetBlockEndAtPlayhead();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleMarkNextBlockLive();
      } else if (e.key === 'Delete' && selectedBlockId) {
        e.preventDefault();
        handleDeleteBlock(selectedBlockId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Playhead scrub listeners (Mouse + Touch)
  useEffect(() => {
    if (!isScrubbingPlayhead) return;

    const scrubAtClientX = (clientX: number) => {
      if (!timelineTrackRef.current) return;
      const rect = timelineTrackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seekTo(ratio * totalDuration);
    };

    const handleMouseMove = (e: MouseEvent) => scrubAtClientX(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) scrubAtClientX(e.touches[0].clientX);
    };
    const handleEnd = () => setIsScrubbingPlayhead(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isScrubbingPlayhead, totalDuration]);

  // Timeline block drag listeners (Mouse + Touch support for mobile/tablet)
  useEffect(() => {
    if (!dragBlockState) return;

    const applyDeltaX = (clientX: number) => {
      if (!timelineTrackRef.current) return;
      const rect = timelineTrackRef.current.getBoundingClientRect();
      const deltaPx = clientX - dragBlockState.initialX;
      const deltaSec = (deltaPx / rect.width) * totalDuration;

      onChangeProject({
        ...project,
        blocks: project.blocks.map((b) => {
          if (b.id !== dragBlockState.blockId) return b;
          if (dragBlockState.mode === 'move') {
            const dur = dragBlockState.initialEnd - dragBlockState.initialStart;
            const nextStart = Math.max(
              0,
              Math.min(totalDuration - dur, dragBlockState.initialStart + deltaSec)
            );
            return {
              ...b,
              startTime: Number(nextStart.toFixed(3)),
              endTime: Number((nextStart + dur).toFixed(3))
            };
          }
          if (dragBlockState.mode === 'start') {
            const nextStart = Math.max(
              0,
              Math.min(
                dragBlockState.initialEnd - 0.3,
                dragBlockState.initialStart + deltaSec
              )
            );
            return { ...b, startTime: Number(nextStart.toFixed(3)) };
          }
          const nextEnd = Math.max(
            dragBlockState.initialStart + 0.3,
            Math.min(totalDuration, dragBlockState.initialEnd + deltaSec)
          );
          return { ...b, endTime: Number(nextEnd.toFixed(3)) };
        })
      });
    };

    const handleMouseMove = (e: MouseEvent) => applyDeltaX(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) applyDeltaX(e.touches[0].clientX);
    };
    const handleEnd = () => setDragBlockState(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragBlockState, project, totalDuration]);

  // Project & Block handlers
  const handleUpdateProjectMeta = (patch: Partial<SongProject>) => {
    onChangeProject({
      ...project,
      ...patch,
      updatedAt: Date.now()
    });
  };

  const handleUpdateBlock = (blockId: string, patch: Partial<LyricBlock>) => {
    onChangeProject({
      ...project,
      blocks: project.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
      updatedAt: Date.now()
    });
  };

  const handleUpdateBlockStyle = (
    blockId: string,
    stylePatch: Partial<LyricStyle>
  ) => {
    onChangeProject({
      ...project,
      blocks: project.blocks.map((b) =>
        b.id === blockId ? { ...b, style: { ...b.style, ...stylePatch } } : b
      ),
      updatedAt: Date.now()
    });
  };

  const handleApplyStyleToAllBlocks = (style: LyricStyle) => {
    onChangeProject({
      ...project,
      defaultStyle: { ...style },
      blocks: project.blocks.map((b) => ({
        ...b,
        style: { ...style }
      })),
      updatedAt: Date.now()
    });
    showNotice('Estilo e tamanho aplicados a toda a música.');
  };

  // Direct 1-tap Font Size Adjuster
  const activeFontSize =
    displayedStageBlock?.style.fontSize ||
    selectedBlock?.style.fontSize ||
    project.defaultStyle.fontSize ||
    64;

  const handleQuickStepFontSize = (delta: number) => {
    const nextSize = Math.max(12, Math.min(120, activeFontSize + delta));
    onChangeProject({
      ...project,
      defaultStyle: {
        ...project.defaultStyle,
        fontSize: nextSize
      },
      blocks: project.blocks.map((b) => ({
        ...b,
        style: {
          ...b.style,
          fontSize: nextSize
        }
      })),
      updatedAt: Date.now()
    });
  };

  const handleAddBlock = () => {
    const lastBlk = project.blocks[project.blocks.length - 1];
    const start = lastBlk
      ? Number((lastBlk.endTime + 0.4).toFixed(3))
      : Number(currentTime.toFixed(3));
    const end = Number((start + 4.5).toFixed(3));
    const newBlk: LyricBlock = {
      id: `blk-${Date.now()}`,
      sectionLabel: `Bloco ${project.blocks.length + 1}`,
      startTime: start,
      endTime: end,
      text: 'Nova linha de letra sincronizada',
      style: { ...(selectedBlock?.style || project.defaultStyle) }
    };

    onChangeProject({
      ...project,
      blocks: [...project.blocks, newBlk],
      updatedAt: Date.now()
    });
    setSelectedBlockId(newBlk.id);
  };

  const handleDuplicateBlock = (blockId: string) => {
    const idx = project.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const orig = project.blocks[idx];
    const dur = Math.max(1, orig.endTime - orig.startTime);
    const start = Number((orig.endTime + 0.2).toFixed(3));
    const copy: LyricBlock = {
      ...orig,
      id: `blk-${Date.now()}`,
      sectionLabel: `${orig.sectionLabel || 'Bloco'} (Cópia)`,
      startTime: start,
      endTime: Number((start + dur).toFixed(3)),
      style: { ...orig.style }
    };
    const nextBlocks = [...project.blocks];
    nextBlocks.splice(idx + 1, 0, copy);
    onChangeProject({ ...project, blocks: nextBlocks, updatedAt: Date.now() });
    setSelectedBlockId(copy.id);
  };

  const handleSplitBlock = (blockId: string) => {
    const idx = project.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const orig = project.blocks[idx];
    const midTime = Number(((orig.startTime + orig.endTime) / 2).toFixed(3));
    const lines = orig.text.split('\n');
    const firstText =
      lines.length > 1
        ? lines.slice(0, Math.ceil(lines.length / 2)).join('\n')
        : orig.text;
    const secondText =
      lines.length > 1
        ? lines.slice(Math.ceil(lines.length / 2)).join('\n')
        : orig.text;

    const firstHalf: LyricBlock = {
      ...orig,
      endTime: Math.max(orig.startTime + 0.3, Number((midTime - 0.05).toFixed(3))),
      text: firstText
    };
    const secondHalf: LyricBlock = {
      ...orig,
      id: `blk-${Date.now()}`,
      sectionLabel: `${orig.sectionLabel || 'Bloco'} (Parte 2)`,
      startTime: midTime,
      endTime: Math.max(midTime + 0.3, orig.endTime),
      text: secondText,
      style: { ...orig.style }
    };

    const nextBlocks = [...project.blocks];
    nextBlocks.splice(idx, 1, firstHalf, secondHalf);
    onChangeProject({ ...project, blocks: nextBlocks, updatedAt: Date.now() });
    setSelectedBlockId(secondHalf.id);
  };

  const handleMergeWithNextBlock = (blockId: string) => {
    const idx = project.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1 || idx >= project.blocks.length - 1) return;
    const cur = project.blocks[idx];
    const nxt = project.blocks[idx + 1];

    const merged: LyricBlock = {
      ...cur,
      endTime: Math.max(cur.endTime, nxt.endTime),
      text: `${cur.text}\n${nxt.text}`.trim()
    };

    const nextBlocks = [...project.blocks];
    nextBlocks.splice(idx, 2, merged);
    onChangeProject({ ...project, blocks: nextBlocks, updatedAt: Date.now() });
    setSelectedBlockId(merged.id);
  };

  const handleMoveBlockOrder = (blockId: string, direction: 'up' | 'down') => {
    const idx = project.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= project.blocks.length) return;

    const nextBlocks = [...project.blocks];
    const [moved] = nextBlocks.splice(idx, 1);
    nextBlocks.splice(targetIdx, 0, moved);
    onChangeProject({ ...project, blocks: nextBlocks, updatedAt: Date.now() });
  };

  const handleDeleteBlock = (blockId: string) => {
    const remaining = project.blocks.filter((b) => b.id !== blockId);
    onChangeProject({ ...project, blocks: remaining, updatedAt: Date.now() });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(remaining[0]?.id || null);
    }
  };

  // Live Sync Actions (I, O, M)
  const handleSetBlockStartAtPlayhead = () => {
    if (!selectedBlock) return;
    const rawTime = Math.max(
      0,
      Number((currentTime - effectiveGlobalOffset - effectiveSourceOffset).toFixed(3))
    );
    handleUpdateBlock(selectedBlock.id, {
      startTime: rawTime,
      endTime: Math.max(rawTime + 0.4, selectedBlock.endTime)
    });
  };

  const handleSetBlockEndAtPlayhead = () => {
    if (!selectedBlock) return;
    const rawTime = Math.max(
      selectedBlock.startTime + 0.3,
      Number((currentTime - effectiveGlobalOffset - effectiveSourceOffset).toFixed(3))
    );
    handleUpdateBlock(selectedBlock.id, { endTime: rawTime });
  };

  const handleMarkNextBlockLive = () => {
    if (project.blocks.length === 0) return;
    const nowRef = Math.max(
      0,
      Number((currentTime - effectiveGlobalOffset - effectiveSourceOffset).toFixed(3))
    );
    const curIdx = project.blocks.findIndex((b) => b.id === selectedBlockId);
    const activeIdx = curIdx >= 0 ? curIdx : 0;
    const nextIdx = Math.min(project.blocks.length - 1, activeIdx + 1);

    const updatedBlocks = project.blocks.map((b, i) => {
      if (i === activeIdx && activeIdx !== nextIdx) {
        return {
          ...b,
          endTime: Math.max(b.startTime + 0.3, Number((nowRef - 0.05).toFixed(3)))
        };
      }
      if (i === nextIdx) {
        const dur = Math.max(3.5, b.endTime - b.startTime);
        return {
          ...b,
          startTime: nowRef,
          endTime: Number((nowRef + dur).toFixed(3))
        };
      }
      return b;
    });

    onChangeProject({ ...project, blocks: updatedBlocks, updatedAt: Date.now() });
    setSelectedBlockId(updatedBlocks[nextIdx].id);
  };

  // Media Sources Management
  const handleExtractAudio = async (source: MediaSourceItem) => {
    if (source.mediaType !== 'video') return;
    const existing = project.sources.find(item => item.derivedFromSourceId === source.id);
    if (existing) {
      resetPreviewPosition();
      onChangeProject({
        ...project,
        activePreviewSourceId: existing.id,
        referenceSourceId: existing.id,
        updatedAt: Date.now()
      });
      showNotice('O áudio extraído já existe e foi selecionado.');
      return;
    }
    if (!await canExtractAudioThroughHost()) {
      showNotice('A extração de áudio requer o Lyrics Studio aberto pelo MediaDeck.');
      return;
    }

    setPackagingState({ stage: 'Preparando conversão...', percent: 0 });
    try {
      const converted = await extractAudioThroughHost(source, (stage, percent) =>
        setPackagingState({ stage, percent }));
      const objectUrl = URL.createObjectURL(converted.blob);
      const duration = await probeMediaDuration(objectUrl, 'audio');
      let waveformPeaks: number[] = [];
      try { waveformPeaks = (await computeWaveformPeaksFromBlob(converted.blob, 160)).peaks; }
      catch { waveformPeaks = Array.from({ length: 120 }, (_, index) => 22 + ((index * 19) % 58)); }
      const role = source.role === 'video-playback' ? 'playback'
        : source.role === 'video-cantado' ? 'cantado' : 'audio';
      const audioSource: MediaSourceItem = {
        id: `src-audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Áudio extraído • ${source.name}`,
        role,
        mediaType: 'audio',
        fileName: converted.fileName,
        duration: duration > 0 ? duration : source.duration,
        offset: source.offset,
        volume: source.volume,
        blob: converted.blob,
        objectUrl,
        waveformPeaks,
        derivedFromSourceId: source.id,
        fileMissing: false
      };
      resetPreviewPosition();
      onChangeProject({
        ...project,
        sources: [...project.sources, audioSource],
        activePreviewSourceId: audioSource.id,
        referenceSourceId: audioSource.id,
        duration: audioSource.duration,
        updatedAt: Date.now()
      });
      showNotice('Áudio MP3 320 kbps extraído e selecionado como fonte principal.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível extrair o áudio deste vídeo.');
    } finally {
      setPackagingState(null);
    }
  };

  const handleAddMediaSource = async (role: MediaSourceRole, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const mediaType =
      file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)
        ? 'video'
        : getRoleDefaultMediaType(role);

    let probedDuration = await probeMediaDuration(objectUrl, mediaType);
    let peaks: number[] = [];
    try {
      const wf = await computeWaveformPeaksFromBlob(file, 160);
      peaks = wf.peaks;
      if (wf.duration > 0) probedDuration = wf.duration;
    } catch {
      peaks = Array.from({ length: 120 }, (_, i) => 20 + ((i * 17) % 60));
    }

    const newSource: MediaSourceItem = {
      id: `src-${Date.now()}`,
      name: getRoleLabel(role),
      role,
      mediaType,
      fileName: file.name,
      duration: probedDuration,
      offset: 0,
      volume: 100,
      blob: file,
      objectUrl,
      waveformPeaks: peaks,
      fileMissing: false
    };

    resetPreviewPosition();
    onChangeProject({
      ...project,
      duration: project.sources.length === 0 ? probedDuration : project.duration,
      referenceSourceId: project.referenceSourceId || newSource.id,
      activePreviewSourceId: newSource.id,
      sources: [...project.sources, newSource],
      updatedAt: Date.now()
    });
    showNotice(`Mídia "${newSource.name}" (${file.name}) adicionada.`);
  };

  const handleReplaceMediaSourceFile = async (sourceId: string, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const mediaType =
      file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)
        ? 'video'
        : 'audio';
    let probedDuration = await probeMediaDuration(objectUrl, mediaType);
    let peaks: number[] = [];
    try {
      const wf = await computeWaveformPeaksFromBlob(file, 160);
      peaks = wf.peaks;
      if (wf.duration > 0) probedDuration = wf.duration;
    } catch {
      peaks = Array.from({ length: 120 }, (_, i) => 25 + ((i * 19) % 55));
    }

    if (sourceId === activeSource?.id) {
      resetPreviewPosition();
    }
    onChangeProject({
      ...project,
      sources: project.sources.map((s) =>
        s.id === sourceId
          ? {
              ...s,
              fileName: file.name,
              duration: probedDuration,
              blob: file,
              objectUrl,
              waveformPeaks: peaks,
              fileMissing: false
            }
          : s
      ),
      updatedAt: Date.now()
    });
    showNotice(`Arquivo "${file.name}" vinculado.`);
  };

  const handleUpdateMediaSource = (
    sourceId: string,
    patch: Partial<MediaSourceItem>
  ) => {
    onChangeProject({
      ...project,
      sources: project.sources.map((s) =>
        s.id === sourceId ? { ...s, ...patch } : s
      ),
      updatedAt: Date.now()
    });
  };

  const handleRemoveMediaSource = (sourceId: string) => {
    const remaining = project.sources.filter((s) => s.id !== sourceId);
    onChangeProject({
      ...project,
      sources: remaining,
      referenceSourceId:
        project.referenceSourceId === sourceId
          ? remaining[0]?.id || null
          : project.referenceSourceId,
      activePreviewSourceId:
        project.activePreviewSourceId === sourceId
          ? remaining[0]?.id || null
          : project.activePreviewSourceId,
      updatedAt: Date.now()
    });
  };

  const handleUpdateCoverFile = (file: File | null) => {
    if (!file) {
      onChangeProject({
        ...project,
        cover: {
          ...project.cover,
          imageUrl: undefined,
          fileName: undefined,
          blob: undefined
        },
        updatedAt: Date.now()
      });
      return;
    }
    const url = URL.createObjectURL(file);
    onChangeProject({
      ...project,
      cover: {
        ...project.cover,
        imageUrl: url,
        fileName: file.name,
        blob: file
      },
      updatedAt: Date.now()
    });
  };

  const handleUpdateBackgroundFile = (type: 'image' | 'video', file: File) => {
    const url = URL.createObjectURL(file);
    onChangeProject({
      ...project,
      background: {
        ...project.background,
        type,
        value: url,
        fileName: file.name,
        blob: file
      },
      updatedAt: Date.now()
    });
  };

  // Subtitle / Lyric File Import
  const triggerSubtitleImport = (format: SubtitleFormat) => {
    setPendingImportFormat(format);
    setShowImportMenu(false);
    setTimeout(() => {
      subtitleFileInputRef.current?.click();
    }, 20);
  };

  const handleSubtitleFileSelected = async (file: File) => {
    const rawText = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase();
    const format: SubtitleFormat =
      ext === 'srt' || ext === 'vtt' || ext === 'lrc' || ext === 'txt'
        ? ext
        : pendingImportFormat;

    if (format === 'txt') {
      setTxtModalData({ fileName: file.name, rawText });
      return;
    }

    let blocks: LyricBlock[] = [];
    if (format === 'lrc') {
      blocks = parseLrcContent(rawText, project.defaultStyle, {
        mediaTotalDuration: totalDuration
      });
    } else if (format === 'srt') {
      blocks = parseSrtContent(rawText, project.defaultStyle);
    } else if (format === 'vtt') {
      blocks = parseVttContent(rawText, project.defaultStyle);
    }

    if (blocks.length > 0) {
      onChangeProject({
        ...project,
        blocks,
        updatedAt: Date.now()
      });
      setSelectedBlockId(blocks[0].id);
      showNotice(
        `${blocks.length} blocos importados de ${file.name} (${format.toUpperCase()}).`
      );
    }
  };

  // Export Actions
  const handleSaveMdsongPackage = async () => {
    setShowExportMenu(false);
    setPackagingState({ stage: 'Empacotando...', percent: 5 });
    try {
      if (await canSaveThroughHost()) {
        const path = await saveMdsongThroughHost(project, (stage, percent) =>
          setPackagingState({ stage, percent }));
        showNotice(`Projeto salvo pelo MediaDeck em ${path}`);
        return;
      }
      const res = await packMdsongPackage(project, (stage, percent) => {
        setPackagingState({ stage, percent });
      });

      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotice(
        `Pacote "${res.fileName}" (${(res.sizeBytes / 1024).toFixed(0)} KB) salvo!`
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível salvar o Projeto de Louvor.');
    } finally {
      setPackagingState(null);
    }
  };

  const handleDownloadTextFormat = (fmt: 'lrc' | 'srt' | 'vtt') => {
    setShowExportMenu(false);
    const content =
      fmt === 'lrc'
        ? exportProjectToLrc(project)
        : fmt === 'srt'
        ? exportProjectToSrt(project)
        : exportProjectToVtt(project);

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'letra'}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice(`Arquivo .${fmt.toUpperCase()} exportado.`);
  };

  const waveformBars = activeSource?.waveformPeaks || [];
  const stageScaleFactor = stageWidth / 1280;

  return (
    <div className="h-[100dvh] w-screen bg-[#121215] text-[#f3f3f6] flex flex-col overflow-hidden select-none">
      {/* Hidden File Inputs */}
      <input
        ref={subtitleFileInputRef}
        type="file"
        accept={
          pendingImportFormat === 'srt'
            ? '.srt'
            : pendingImportFormat === 'vtt'
            ? '.vtt'
            : pendingImportFormat === 'txt'
            ? '.txt,text/plain'
            : '.lrc,.srt,.vtt,.txt'
        }
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleSubtitleFileSelected(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      <input
        ref={mdsongInputRef}
        type="file"
        accept=".mdsong,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onOpenMdsongFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Hidden Audio Player for audio sources */}
      <audio
        ref={audioRef}
        src={activeSource?.mediaType === 'audio' ? activeSource.objectUrl : undefined}
        onLoadedMetadata={(e) => handleActiveMediaLoaded(e.currentTarget)}
        onTimeUpdate={(e) => {
          if (activeSource?.mediaType === 'audio') {
            updatePlaybackTime(e.currentTarget.currentTime);
          }
        }}
        onSeeked={(e) => updatePlaybackTime(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          showNotice('Não foi possível reproduzir esta mídia na prévia.');
        }}
        className="hidden"
      />

      {/* ================================================================== */}
      {/* BARRA SUPERIOR (CapCut / Premiere Dark Graphite #18181c + Cyan)    */}
      {/* ================================================================== */}
      <header className="h-10 sm:h-11 px-2 sm:px-3.5 bg-[#18181c] border-b border-[#2b2b33] flex items-center justify-between gap-1.5 shrink-0 z-30">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackToHome}
            title="Voltar para Projetos Recentes"
            className="h-7 sm:h-8 px-2 rounded bg-[#25252c] hover:bg-[#30303a] border border-[#34343e] text-[11px] font-semibold text-[#e4e4ea] flex items-center gap-1 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#00d4e5]" />
            <span className="hidden sm:inline">Projetos</span>
          </button>

          <span className="text-xs font-bold text-white truncate">
            {project.title}
          </span>
        </div>

        {statusBanner && (
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#00d4e5]/15 border border-[#00d4e5]/35 text-[#00e5ff] text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>{statusBanner}</span>
          </div>
        )}

        {/* Top Right Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Setas de Voltar Alterações (Undo) e Avançar Alterações (Redo) */}
          <div className="flex items-center bg-[#121215] border border-[#2e2e38] rounded h-7 sm:h-8 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyCounts.undo === 0}
              title="Voltar alteração / Desfazer (Ctrl+Z)"
              className="h-6 w-6 sm:w-7 grid place-items-center rounded hover:bg-[#26262f] active:bg-[#00d4e5] active:text-zinc-950 disabled:opacity-30 disabled:pointer-events-none text-[#e4e4ea] cursor-pointer transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5 text-[#00d4e5]" />
            </button>
            <div className="w-px h-3.5 bg-[#2b2b33]" />
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyCounts.redo === 0}
              title="Avançar alteração / Refazer (Ctrl+Y)"
              className="h-6 w-6 sm:w-7 grid place-items-center rounded hover:bg-[#26262f] active:bg-[#00d4e5] active:text-zinc-950 disabled:opacity-30 disabled:pointer-events-none text-[#e4e4ea] cursor-pointer transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5 text-[#00d4e5]" />
            </button>
          </div>

          {/* Quick Font Size A- / A+ right in Top Bar */}
          <div className="flex items-center bg-[#121215] border border-[#2e2e38] rounded h-7 sm:h-8 px-1 gap-0.5">
            <button
              type="button"
              onClick={() => handleQuickStepFontSize(-4)}
              title="Diminuir Letra no Telão"
              className="h-6 px-1.5 rounded hover:bg-[#26262f] active:bg-[#00d4e5] active:text-zinc-950 text-[11px] font-bold text-[#d4d4dd] hover:text-white cursor-pointer"
            >
              A-
            </button>
            <span className="text-[10px] font-mono text-[#00d4e5] px-1 tabular-nums">
              {activeFontSize}
            </span>
            <button
              type="button"
              onClick={() => handleQuickStepFontSize(4)}
              title="Aumentar Letra no Telão"
              className="h-6 px-1.5 rounded hover:bg-[#26262f] active:bg-[#00d4e5] active:text-zinc-950 text-[11px] font-bold text-[#d4d4dd] hover:text-white cursor-pointer"
            >
              A+
            </button>
          </div>

          {/* Dropdown: Importar Letra */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowImportMenu((v) => !v);
                setShowExportMenu(false);
              }}
              className="h-7 sm:h-8 px-2 rounded bg-[#25252c] hover:bg-[#30303a] border border-[#34343e] text-[11px] font-semibold text-[#f3f3f6] flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#00d4e5]" />
              <span className="hidden md:inline">Importar</span>
            </button>

            {showImportMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-[#1c1c22] border border-[#34343e] rounded-md shadow-2xl py-1 z-40 text-xs">
                <button
                  type="button"
                  onClick={() => triggerSubtitleImport('lrc')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Importar .LRC</span>
                  <span className="font-mono text-[10px] text-[#00d4e5]">[mm:ss.xx]</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerSubtitleImport('srt')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Importar .SRT</span>
                  <span className="font-mono text-[10px] text-amber-400">SubRip</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerSubtitleImport('vtt')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Importar .VTT</span>
                  <span className="font-mono text-[10px] text-purple-400">WebVTT</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerSubtitleImport('txt')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Importar .TXT</span>
                  <span className="font-mono text-[10px] text-emerald-400">Texto Puro</span>
                </button>
                <div className="my-1 border-t border-[#2b2b33]" />
                <button
                  type="button"
                  onClick={() => {
                    setShowImportMenu(false);
                    setShowSubtitleConverter(true);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#00d4e5] font-semibold cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Converter Legenda...
                </button>
              </div>
            )}
          </div>

          {/* Dropdown: Exportar */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu((v) => !v);
                setShowImportMenu(false);
              }}
              className="h-7 sm:h-8 px-2 rounded bg-[#25252c] hover:bg-[#30303a] border border-[#34343e] text-[11px] font-semibold text-[#f3f3f6] flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#00d4e5]" />
              <span className="hidden md:inline">Exportar</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-[#1c1c22] border border-[#34343e] rounded-md shadow-2xl py-1 z-40 text-xs">
                <button
                  type="button"
                  onClick={handleSaveMdsongPackage}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-white font-bold cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-[#00d4e5]" />
                    Salvar Pacote .mdsong
                  </span>
                  <span className="text-[10px] font-mono text-[#00d4e5]">MediaDeck</span>
                </button>
                <div className="my-1 border-t border-[#2b2b33]" />
                <button
                  type="button"
                  onClick={() => handleDownloadTextFormat('lrc')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Exportar .LRC</span>
                  <FileText className="w-3.5 h-3.5 text-[#00d4e5]" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTextFormat('srt')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Exportar .SRT</span>
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTextFormat('vtt')}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#f3f3f6] cursor-pointer"
                >
                  <span>Exportar .VTT</span>
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                </button>
                <div className="my-1 border-t border-[#2b2b33]" />
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    setShowMp4ExportModal(true);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center justify-between text-[#00d4e5] font-semibold cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Film className="w-3.5 h-3.5" />
                    Exportar vídeo...
                  </span>
                  <span className="text-[10px] font-mono">1080p</span>
                </button>
                <div className="my-1 border-t border-[#2b2b33]" />
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    mdsongInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#d4d4dd] cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#00d4e5]" />
                  Abrir pacote .mdsong...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    onOpenNewProjectModal();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#d4d4dd] cursor-pointer"
                >
                  <FilePlus className="w-3.5 h-3.5 text-[#00d4e5]" />
                  Novo Projeto...
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenLivePresenter}
            className="h-7 sm:h-8 px-2 rounded bg-[#25252c] hover:bg-[#30303a] border border-[#34343e] text-[11px] font-semibold text-[#f3f3f6] flex items-center gap-1 cursor-pointer"
            title="Testar Apresentação em Tela Cheia"
          >
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Apresentar</span>
          </button>

          {/* CapCut Iconic Cyan Export CTA Button */}
          <button
            type="button"
            onClick={handleSaveMdsongPackage}
            disabled={!!packagingState}
            className="h-7 sm:h-8 px-2.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] disabled:opacity-50 text-[11px] font-extrabold text-zinc-950 flex items-center gap-1 cursor-pointer shadow-sm"
          >
            {packagingState ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{packagingState.percent}%</span>
              </>
            ) : (
              <>
                <Package className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Salvar .mdsong</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ================================================================== */}
      {/* WORKSPACE BODY                                                     */}
      {/* ================================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* PAINEL ESQUERDO (Desktop Only) */}
        <div className="hidden lg:flex h-full">
          <LeftProjectSidebar
            project={project}
            selectedBlockId={selectedBlockId}
            onUpdateProjectMeta={handleUpdateProjectMeta}
            onSelectBlock={(blockId, seekToStart) => {
              setSelectedBlockId(blockId);
              if (seekToStart) {
                const blk = project.blocks.find((b) => b.id === blockId);
                if (blk) {
                  seekTo(
                    blk.startTime + effectiveGlobalOffset + effectiveSourceOffset + 0.02
                  );
                }
              }
            }}
            onAddBlock={handleAddBlock}
            onDuplicateBlock={handleDuplicateBlock}
            onSplitBlock={handleSplitBlock}
            onMergeWithNextBlock={handleMergeWithNextBlock}
            onMoveBlockOrder={handleMoveBlockOrder}
            onDeleteBlock={handleDeleteBlock}
            onOpenSubtitleConverter={() => setShowSubtitleConverter(true)}
            onAddMediaSource={handleAddMediaSource}
            onReplaceMediaSourceFile={handleReplaceMediaSourceFile}
            onUpdateMediaSource={handleUpdateMediaSource}
            onExtractAudio={handleExtractAudio}
            onRemoveMediaSource={handleRemoveMediaSource}
            onSetReferenceSource={(sourceId) =>
              handleUpdateProjectMeta({ referenceSourceId: sourceId })
            }
            onSetActivePreviewSource={selectPreviewSource}
            onUpdateCoverFile={handleUpdateCoverFile}
            onUpdateBackgroundFile={handleUpdateBackgroundFile}
          />
        </div>

        {/* ÁREA CENTRAL: PREVIEW 16:9 COMPACTO + PLAYER + TIMELINE + ABAS MOBILE */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#101013] overflow-hidden">
          {/* 1. PREVIEW 16:9 (CapCut Player Monitor Canvas #0c0c0e) */}
          {previewCollapsed ? (
            <div className="h-7 px-3 bg-[#16161a] border-b border-[#2b2b33] flex items-center justify-between text-[11px] shrink-0">
              <div className="flex items-center gap-2 truncate text-[#9ca0ab]">
                <span className="text-[#00d4e5] font-semibold">Telão Recolhido:</span>
                <span className="text-white truncate">
                  {displayedStageBlock
                    ? displayedStageBlock.text.replace(/\n/g, ' / ')
                    : '♪ Sem letra neste instante'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewCollapsed(false)}
                className="px-2 py-0.5 rounded bg-[#25252c] text-[#00d4e5] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ChevronDown className="w-3 h-3" />
                Mostrar Telão
              </button>
            </div>
          ) : (
            <div className="shrink-0 lg:flex-1 lg:min-h-0 py-1.5 px-2 sm:py-2 sm:px-3 flex flex-col items-center justify-center relative overflow-hidden bg-[#0c0c0e]">
              <div
                ref={previewStageRef}
                onMouseMove={(e) => {
                  if (!isDraggingStageText || !displayedStageBlock || !previewStageRef.current)
                    return;
                  const rect = previewStageRef.current.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width - 0.5) * 100;
                  const relY = ((e.clientY - rect.top) / rect.height - 0.5) * 100;
                  handleUpdateBlockStyle(displayedStageBlock.id, {
                    positionPreset: 'center',
                    offsetX: Math.max(-42, Math.min(42, Math.round(relX))),
                    offsetY: Math.max(-42, Math.min(42, Math.round(relY)))
                  });
                }}
                onTouchMove={(e) => {
                  if (!isDraggingStageText || !displayedStageBlock || !previewStageRef.current)
                    return;
                  const t = e.touches[0];
                  if (!t) return;
                  const rect = previewStageRef.current.getBoundingClientRect();
                  const relX = ((t.clientX - rect.left) / rect.width - 0.5) * 100;
                  const relY = ((t.clientY - rect.top) / rect.height - 0.5) * 100;
                  handleUpdateBlockStyle(displayedStageBlock.id, {
                    positionPreset: 'center',
                    offsetX: Math.max(-42, Math.min(42, Math.round(relX))),
                    offsetY: Math.max(-42, Math.min(42, Math.round(relY)))
                  });
                }}
                onMouseUp={() => setIsDraggingStageText(false)}
                onMouseLeave={() => setIsDraggingStageText(false)}
                onTouchEnd={() => setIsDraggingStageText(false)}
                className={`${
                  previewExpandedMobile
                    ? 'h-[175px] sm:h-[220px]'
                    : 'h-[104px] sm:h-[138px]'
                } lg:h-full lg:max-h-[38vh] xl:max-h-[44vh] w-auto max-w-full aspect-video rounded border border-[#2e2e38] shadow-2xl relative overflow-hidden bg-black flex items-center justify-center transition-all`}
                style={{
                  background:
                    project.background.type === 'color' ||
                    project.background.type === 'gradient'
                      ? project.background.value
                      : '#08080a'
                }}
              >
                {/* Video Source Background or Custom Image/Video Background */}
                {activeSource?.mediaType === 'video' &&
                activeSource.objectUrl &&
                project.useVideoSourceAsBackground ? (
                  <video
                    ref={videoRef}
                    src={activeSource.objectUrl}
                    playsInline
                    onLoadedMetadata={(e) => handleActiveMediaLoaded(e.currentTarget)}
                    onTimeUpdate={(e) => {
                      if (activeSource.mediaType === 'video') {
                        updatePlaybackTime(e.currentTarget.currentTime);
                      }
                    }}
                    onSeeked={(e) => updatePlaybackTime(e.currentTarget.currentTime)}
                    onEnded={() => setIsPlaying(false)}
                    onError={() => {
                      setIsPlaying(false);
                      showNotice('Não foi possível reproduzir este vídeo na prévia.');
                    }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <>
                    {activeSource?.mediaType === 'video' && activeSource.objectUrl && (
                      <video
                        ref={videoRef}
                        src={activeSource.objectUrl}
                        playsInline
                        onLoadedMetadata={(e) => handleActiveMediaLoaded(e.currentTarget)}
                        onTimeUpdate={(e) => {
                          updatePlaybackTime(e.currentTarget.currentTime);
                        }}
                        onSeeked={(e) => updatePlaybackTime(e.currentTarget.currentTime)}
                        onEnded={() => setIsPlaying(false)}
                        onError={() => {
                          setIsPlaying(false);
                          showNotice('Não foi possível reproduzir este vídeo na prévia.');
                        }}
                        className="hidden"
                      />
                    )}
                    {project.background.type === 'image' && project.background.value && (
                      <img
                        src={project.background.value}
                        alt="Background"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {project.background.type === 'video' && project.background.value && (
                      <video
                        ref={bgVideoRef}
                        src={project.background.value}
                        muted
                        loop
                        autoPlay
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </>
                )}

                {/* Background Dim Overlay */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundColor: `rgba(0, 0, 0, ${
                      (project.background.overlayDim || 0) / 100
                    })`
                  }}
                />

                {/* Safe Area Guide */}
                {project.showSafeAreaGuide && (
                  <div
                    className="absolute border border-dashed border-[#00d4e5]/45 pointer-events-none rounded-sm"
                    style={{
                      top: `${project.safeAreaMargin}%`,
                      bottom: `${project.safeAreaMargin}%`,
                      left: `${project.safeAreaMargin}%`,
                      right: `${project.safeAreaMargin}%`
                    }}
                  />
                )}

                {/* Top-Right Subtle Stage Controls: Expand/Collapse Preview */}
                <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewExpandedMobile((v) => !v)}
                    className="lg:hidden h-6 w-6 grid place-items-center rounded bg-black/65 hover:bg-black/85 text-white/85 border border-white/15 cursor-pointer"
                    title={previewExpandedMobile ? 'Diminuir Telão' : 'Aumentar Telão'}
                  >
                    {previewExpandedMobile ? (
                      <Minimize2 className="w-3 h-3" />
                    ) : (
                      <Maximize2 className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewCollapsed(true)}
                    className="h-6 px-1.5 rounded bg-black/65 hover:bg-black/85 text-[10px] text-white/85 border border-white/15 flex items-center gap-0.5 cursor-pointer"
                    title="Ocultar Telão para ganhar espaço"
                  >
                    <ChevronUp className="w-3 h-3" />
                    <span className="hidden sm:inline">Ocultar</span>
                  </button>
                </div>

                {/* Proportional Lyric Overlay on 16:9 Stage */}
                {displayedStageBlock ? (
                  <div
                    onMouseDown={() => setIsDraggingStageText(true)}
                    onTouchStart={() => setIsDraggingStageText(true)}
                    className="absolute z-10 flex flex-col px-2 cursor-move touch-none"
                    style={{
                      width: `${displayedStageBlock.style.maxWidth}%`,
                      top:
                        displayedStageBlock.style.positionPreset === 'top'
                          ? `${project.safeAreaMargin + 4}%`
                          : displayedStageBlock.style.positionPreset === 'center'
                          ? '50%'
                          : undefined,
                      bottom:
                        displayedStageBlock.style.positionPreset === 'bottom'
                          ? `${project.safeAreaMargin + 4}%`
                          : undefined,
                      transform: `translate(${displayedStageBlock.style.offsetX}%, ${
                        displayedStageBlock.style.positionPreset === 'center'
                          ? -50 + displayedStageBlock.style.offsetY
                          : displayedStageBlock.style.offsetY
                      }%)`,
                      alignItems:
                        displayedStageBlock.style.align === 'left'
                          ? 'flex-start'
                          : displayedStageBlock.style.align === 'right'
                          ? 'flex-end'
                          : 'center'
                    }}
                  >
                    <div
                      className="rounded transition-all"
                      style={{
                        padding:
                          displayedStageBlock.style.backgroundOpacity > 0
                            ? `${Math.max(3, Math.round(10 * stageScaleFactor))}px ${Math.max(
                                6,
                                Math.round(18 * stageScaleFactor)
                              )}px`
                            : '2px 4px',
                        backgroundColor:
                          displayedStageBlock.style.backgroundOpacity > 0
                            ? hexToRgba(
                                displayedStageBlock.style.backgroundColor,
                                displayedStageBlock.style.backgroundOpacity
                              )
                            : 'transparent',
                        fontFamily: displayedStageBlock.style.fontFamily,
                        fontSize: `${Math.max(
                          8,
                          Math.round(displayedStageBlock.style.fontSize * stageScaleFactor)
                        )}px`,
                        fontWeight: displayedStageBlock.style.bold ? 700 : 400,
                        fontStyle: displayedStageBlock.style.italic ? 'italic' : 'normal',
                        textTransform: displayedStageBlock.style.uppercase
                          ? 'uppercase'
                          : 'none',
                        textAlign: displayedStageBlock.style.align,
                        color: displayedStageBlock.style.textColor,
                        lineHeight: displayedStageBlock.style.lineHeight,
                        letterSpacing: `${
                          displayedStageBlock.style.letterSpacing * stageScaleFactor
                        }px`,
                        WebkitTextStroke:
                          displayedStageBlock.style.outlineWidth > 0
                            ? `${Math.max(
                                0.4,
                                displayedStageBlock.style.outlineWidth * stageScaleFactor
                              )}px ${displayedStageBlock.style.outlineColor}`
                            : undefined,
                        textShadow:
                          displayedStageBlock.style.shadowBlur > 0
                            ? `0px ${
                                displayedStageBlock.style.shadowOffsetY * stageScaleFactor
                              }px ${
                                displayedStageBlock.style.shadowBlur * stageScaleFactor
                              }px ${displayedStageBlock.style.shadowColor}`
                            : undefined
                      }}
                    >
                      <div className="whitespace-pre-line">
                        {displayedStageBlock.text}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] sm:text-xs text-white/30 font-mono">
                    ♪ {formatMillisTimestamp(currentTime).slice(0, 5)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SINGLE-ROW COMPACT PLAYER BAR (CapCut / Premiere Transport)      */}
          {/* ================================================================ */}
          <div className="h-10 px-2 sm:px-3 bg-[#18181c] border-t border-b border-[#2b2b33] flex items-center justify-between gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            {/* Transport Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="h-7 px-2.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                title="Play / Pause (Espaço)"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 fill-zinc-950" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-zinc-950" />
                    <span>Play</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetPreviewPosition}
                className="h-7 w-7 grid place-items-center rounded bg-[#25252c] hover:bg-[#30303a] text-[#d4d4dd] cursor-pointer"
                title="Parar e voltar ao início"
              >
                <Square className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const curIdx = project.blocks.findIndex(
                    (b) => b.id === selectedBlockId
                  );
                  const prevBlk = project.blocks[Math.max(0, curIdx - 1)];
                  if (prevBlk) {
                    setSelectedBlockId(prevBlk.id);
                    seekTo(
                      prevBlk.startTime +
                        effectiveGlobalOffset +
                        effectiveSourceOffset +
                        0.02
                    );
                  }
                }}
                className="h-7 w-7 grid place-items-center rounded bg-[#25252c] hover:bg-[#30303a] text-[#d4d4dd] cursor-pointer"
                title="Bloco Anterior"
              >
                <SkipBack className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const curIdx = project.blocks.findIndex(
                    (b) => b.id === selectedBlockId
                  );
                  const nextBlk =
                    project.blocks[
                      Math.min(project.blocks.length - 1, curIdx + 1)
                    ];
                  if (nextBlk) {
                    setSelectedBlockId(nextBlk.id);
                    seekTo(
                      nextBlk.startTime +
                        effectiveGlobalOffset +
                        effectiveSourceOffset +
                        0.02
                    );
                  }
                }}
                className="h-7 w-7 grid place-items-center rounded bg-[#25252c] hover:bg-[#30303a] text-[#d4d4dd] cursor-pointer"
                title="Próximo Bloco"
              >
                <SkipForward className="w-3 h-3" />
              </button>

              <div className="px-1.5 py-0.5 rounded bg-[#121215] border border-[#2b2b33] font-mono text-[10px] sm:text-[11px] tabular-nums text-white shrink-0">
                <span className="text-[#00d4e5] font-bold">
                  {formatMillisTimestamp(currentTime).slice(0, 5)}
                </span>
                <span className="text-[#686875]"> / </span>
                <span className="text-[#9ca0ab]">
                  {formatMillisTimestamp(totalDuration).slice(0, 5)}
                </span>
              </div>
            </div>

            {/* Desktop Live Sync Button */}
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleMarkNextBlockLive}
                className="h-7 px-2.5 rounded bg-[#00d4e5]/15 hover:bg-[#00d4e5]/25 border border-[#00d4e5]/35 text-[11px] font-semibold text-[#00e5ff] flex items-center gap-1 cursor-pointer"
                title="Atalho: Tecla M — Finaliza o bloco atual e inicia o próximo neste instante"
              >
                <Sparkles className="w-3 h-3" />
                Sincronizar Próximo (M)
              </button>
            </div>

            {/* Active Source Selector, Mute & Timeline Zoom */}
            <div className="flex items-center gap-1 shrink-0">
              <select
                value={activeSource?.id || ''}
                onChange={(e) => selectPreviewSource(e.target.value)}
                className="h-7 max-w-[110px] sm:max-w-[160px] bg-[#121215] border border-[#34343e] rounded px-1.5 text-[11px] font-medium text-white focus:outline-none focus:border-[#00d4e5]"
              >
                {project.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {Math.abs(s.offset) > 0.0005
                      ? ` (${formatSignedOffset(s.offset)})`
                      : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="h-7 w-7 grid place-items-center rounded bg-[#25252c] hover:bg-[#30303a] text-[#d4d4dd] cursor-pointer"
                title="Mudo"
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#00d4e5]" />
                )}
              </button>

              <div className="flex items-center gap-0.5 bg-[#121215] border border-[#2b2b33] rounded px-1 h-7">
                <button
                  type="button"
                  onClick={() =>
                    setTimelineZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))
                  }
                  className="p-1 text-[#d4d4dd] hover:text-white cursor-pointer"
                  title="Diminuir Zoom da Timeline"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="font-mono text-[10px] text-[#9ca0ab] w-6 text-center">
                  {timelineZoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setTimelineZoom((z) => Math.min(6, Number((z + 0.5).toFixed(1))))
                  }
                  className="p-1 text-[#d4d4dd] hover:text-white cursor-pointer"
                  title="Aumentar Zoom da Timeline"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* CAPCUT / PREMIERE TIMELINE (Graphite Well + Teal Waveform +      */}
          {/* Amber/Coral Text Clips with White Selection Handles)             */}
          {/* ================================================================ */}
          <div
            className={`${
              mobileNavTab === 'sync' ? 'flex' : 'hidden lg:flex'
            } h-20 sm:h-24 lg:h-32 bg-[#141417] flex-col shrink-0 border-b border-[#2b2b33] lg:border-b-0`}
          >
            <div className="flex-1 overflow-x-auto overflow-y-hidden relative">
              <div
                ref={timelineTrackRef}
                onMouseDown={(e) => {
                  if (
                    e.target !== e.currentTarget &&
                    !(e.target as HTMLElement).dataset.timelineBg
                  )
                    return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickRatio = Math.max(
                    0,
                    Math.min(1, (e.clientX - rect.left) / rect.width)
                  );
                  seekTo(clickRatio * totalDuration);
                  setIsScrubbingPlayhead(true);
                }}
                data-timeline-bg="true"
                className="h-full relative select-none"
                style={{ width: `${Math.round(timelineZoom * 100)}%`, minWidth: '100%' }}
              >
                {/* Top Time Ruler */}
                <div
                  data-timeline-bg="true"
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    if (!t || !timelineTrackRef.current) return;
                    const rect = timelineTrackRef.current.getBoundingClientRect();
                    const ratio = Math.max(
                      0,
                      Math.min(1, (t.clientX - rect.left) / rect.width)
                    );
                    seekTo(ratio * totalDuration);
                    setIsScrubbingPlayhead(true);
                  }}
                  className="h-6 border-b border-[#282830] bg-[#18181c] flex items-center relative cursor-ew-resize touch-none"
                >
                  {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map(
                    (_, idx) => {
                      const sec = idx * 5;
                      const leftPct = (sec / totalDuration) * 100;
                      if (leftPct > 100) return null;
                      return (
                        <div
                          key={sec}
                          className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                          style={{ left: `${leftPct}%` }}
                        >
                          <div className="h-2.5 w-px bg-[#3a3a46]" />
                          <span className="ml-1 text-[9px] font-mono text-[#8a8e99]">
                            {formatMillisTimestamp(sec).slice(0, 5)}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* CapCut / Premiere NLE Audio Waveform Bars (Teal/Emerald #00d4b2) */}
                <div
                  data-timeline-bg="true"
                  className="inset-x-0 top-6 bottom-0 absolute flex items-center justify-between px-1 opacity-30 pointer-events-none gap-[2px]"
                >
                  {waveformBars.map((peak, idx) => (
                    <div
                      key={idx}
                      className="flex-1 bg-[#00d4b2] rounded-full"
                      style={{ height: `${Math.max(10, Math.min(95, peak))}%` }}
                    />
                  ))}
                </div>

                {/* CapCut Style Text/Subtitle Clips Track (Amber/Orange-Coral + White Handles when Selected) */}
                <div
                  data-timeline-bg="true"
                  className="absolute inset-x-0 top-7 bottom-1.5"
                >
                  {project.blocks.map((blk, idx) => {
                    const effStart =
                      blk.startTime + effectiveGlobalOffset + effectiveSourceOffset;
                    const effEnd =
                      blk.endTime + effectiveGlobalOffset + effectiveSourceOffset;
                    const leftPct = Math.max(
                      0,
                      Math.min(100, (effStart / totalDuration) * 100)
                    );
                    const widthPct = Math.max(
                      1.2,
                      Math.min(100 - leftPct, ((effEnd - effStart) / totalDuration) * 100)
                    );
                    const blockDuration = Math.max(0, effEnd - effStart);
                    const blockText = blk.text.replace(/\n/g, ' / ').trim() || 'Bloco sem texto';
                    const blockTooltip = `${blockText}\nInício: ${formatDurationShort(effStart)}\nFim: ${formatDurationShort(effEnd)}\nDuração: ${formatDurationShort(blockDuration)}`;
                    const isCompactBlock = widthPct < 6 || blockDuration < 2;
                    const isSelected = blk.id === selectedBlockId;
                    const isLive = currentLiveBlock?.id === blk.id;

                    return (
                      <div
                        key={blk.id}
                        title={isCompactBlock ? blockTooltip : undefined}
                        aria-label={blockTooltip}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBlockId(blk.id);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedBlockId(blk.id);
                          seekTo(effStart + 0.02);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedBlockId(blk.id);
                          setDragBlockState({
                            blockId: blk.id,
                            mode: 'move',
                            initialX: e.clientX,
                            initialStart: blk.startTime,
                            initialEnd: blk.endTime
                          });
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const t = e.touches[0];
                          if (!t) return;
                          if (!isSelected) {
                            setSelectedBlockId(blk.id);
                            return;
                          }
                          setDragBlockState({
                            blockId: blk.id,
                            mode: 'move',
                            initialX: t.clientX,
                            initialStart: blk.startTime,
                            initialEnd: blk.endTime
                          });
                        }}
                        className={`absolute top-1 bottom-1 rounded border flex items-center px-2 overflow-hidden transition-colors ${
                          isSelected
                            ? 'bg-[#d96b27] border-2 border-white z-20 shadow-lg touch-none'
                            : isLive
                            ? 'bg-[#00b8c8]/55 border-[#00e5ff] z-10'
                            : 'bg-[#7c3f1c]/85 border-[#a85525] hover:border-[#e07b39]'
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`
                        }}
                      >
                        {/* CapCut White Left Resize Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedBlockId(blk.id);
                            setDragBlockState({
                              blockId: blk.id,
                              mode: 'start',
                              initialX: e.clientX,
                              initialStart: blk.startTime,
                              initialEnd: blk.endTime
                            });
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            const t = e.touches[0];
                            if (!t) return;
                            setSelectedBlockId(blk.id);
                            setDragBlockState({
                              blockId: blk.id,
                              mode: 'start',
                              initialX: t.clientX,
                              initialStart: blk.startTime,
                              initialEnd: blk.endTime
                            });
                          }}
                          className={`absolute left-0 top-0 bottom-0 w-3.5 cursor-ew-resize z-30 touch-none flex items-center justify-center ${
                            isSelected
                              ? 'bg-white text-zinc-950'
                              : 'bg-transparent hover:bg-white/30'
                          }`}
                        >
                          {isSelected && (
                            <div className="w-0.5 h-3 bg-zinc-900 rounded-full" />
                          )}
                        </div>

                        {/* CapCut White Right Resize Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedBlockId(blk.id);
                            setDragBlockState({
                              blockId: blk.id,
                              mode: 'end',
                              initialX: e.clientX,
                              initialStart: blk.startTime,
                              initialEnd: blk.endTime
                            });
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            const t = e.touches[0];
                            if (!t) return;
                            setSelectedBlockId(blk.id);
                            setDragBlockState({
                              blockId: blk.id,
                              mode: 'end',
                              initialX: t.clientX,
                              initialStart: blk.startTime,
                              initialEnd: blk.endTime
                            });
                          }}
                          className={`absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize z-30 touch-none flex items-center justify-center ${
                            isSelected
                              ? 'bg-white text-zinc-950'
                              : 'bg-transparent hover:bg-white/30'
                          }`}
                        >
                          {isSelected && (
                            <div className="w-0.5 h-3 bg-zinc-900 rounded-full" />
                          )}
                        </div>

                        <div className="text-[10px] sm:text-[11px] font-medium text-white truncate pointer-events-none px-1.5">
                          <span className="text-amber-200 font-mono text-[9px] mr-1">
                            #{idx + 1}
                          </span>
                          {blk.text.replace(/\n/g, ' · ')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CapCut Signature Crisp White Playhead Cursor */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsScrubbingPlayhead(true);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setIsScrubbingPlayhead(true);
                  }}
                  className="absolute top-0 bottom-0 w-[2px] bg-white z-30 cursor-ew-resize touch-none shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                  style={{
                    left: `${Math.max(
                      0,
                      Math.min(100, (currentTime / totalDuration) * 100)
                    )}%`
                  }}
                >
                  <div className="w-3.5 h-4 -ml-[6px] top-0 rounded-b-sm bg-white border border-zinc-800 shadow-md" />
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* MOBILE & TABLET WORKSPACE (< 1024px)                             */}
          {/* ================================================================ */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden lg:hidden">
            {mobileNavTab === 'sync' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#141417]">
                {/* Compact 1-Row Touch Sync Bar + Fine-Tune Nudge Buttons */}
                <div className="p-2 bg-[#1c1c21] border-b border-[#2b2b33] space-y-1.5 shrink-0">
                  <div className="grid grid-cols-12 gap-1.5">
                    <button
                      type="button"
                      onClick={handleSetBlockStartAtPlayhead}
                      className="col-span-3 h-9 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 border border-[#34343e] text-[11px] font-semibold text-[#f3f3f6] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Clock className="w-3 h-3 text-[#00d4e5]" />
                      <span>Início</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleMarkNextBlockLive}
                      className="col-span-6 h-9 rounded bg-[#00d4e5] hover:bg-[#00bfe0] active:scale-[0.99] text-zinc-950 font-extrabold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>MARCAR PRÓXIMO</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSetBlockEndAtPlayhead}
                      className="col-span-3 h-9 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 border border-[#34343e] text-[11px] font-semibold text-[#f3f3f6] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Clock className="w-3 h-3 text-[#00d4e5]" />
                      <span>Fim</span>
                    </button>
                  </div>

                  {/* Fine-Tune Finger Tap Adjusters for Selected Block + Font Size */}
                  {selectedBlock && (
                    <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[#9ca0ab]">Início:</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateBlock(selectedBlock.id, {
                              startTime: Math.max(
                                0,
                                Number((selectedBlock.startTime - 0.1).toFixed(2))
                              )
                            })
                          }
                          className="h-6 px-1.5 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 font-mono text-white cursor-pointer"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateBlock(selectedBlock.id, {
                              startTime: Number((selectedBlock.startTime + 0.1).toFixed(2))
                            })
                          }
                          className="h-6 px-1.5 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 font-mono text-white cursor-pointer"
                        >
                          +0.1s
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[#9ca0ab]">Fim:</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateBlock(selectedBlock.id, {
                              endTime: Math.max(
                                selectedBlock.startTime + 0.4,
                                Number((selectedBlock.endTime - 0.1).toFixed(2))
                              )
                            })
                          }
                          className="h-6 px-1.5 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 font-mono text-white cursor-pointer"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateBlock(selectedBlock.id, {
                              endTime: Number((selectedBlock.endTime + 0.1).toFixed(2))
                            })
                          }
                          className="h-6 px-1.5 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 font-mono text-white cursor-pointer"
                        >
                          +0.1s
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickStepFontSize(-4)}
                          className="h-6 px-1.5 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 font-bold text-[#00d4e5] cursor-pointer"
                        >
                          Letra A-
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickStepFontSize(4)}
                          className="h-6 px-1.5 rounded bg-[#26262e] active:bg-[#00d4e5] active:text-zinc-950 font-bold text-[#00d4e5] cursor-pointer"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Integrated Scrollable Lyric Blocks List right under the Sync Bar */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  <div className="flex items-center justify-between px-1 pb-0.5 text-[10px] text-[#9ca0ab]">
                    <span>Toque em um bloco para selecionar ou sincronizar</span>
                    <button
                      type="button"
                      onClick={handleAddBlock}
                      className="text-[#00d4e5] font-semibold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Adicionar Bloco
                    </button>
                  </div>

                  {project.blocks.map((blk, idx) => {
                    const isSelected = blk.id === selectedBlockId;
                    const isLive = currentLiveBlock?.id === blk.id;
                    return (
                      <div
                        key={blk.id}
                        onClick={() => setSelectedBlockId(blk.id)}
                        className={`rounded-md border px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#26262f] border-[#00d4e5]'
                            : isLive
                            ? 'bg-[#00d4e5]/10 border-[#00d4e5]/40'
                            : 'bg-[#1b1b20] border-[#2b2b33]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[10px] font-mono text-[#8a8e99]">
                            <span
                              className={
                                isSelected ? 'text-[#00d4e5] font-bold' : ''
                              }
                            >
                              #{idx + 1} {blk.sectionLabel ? `· ${blk.sectionLabel}` : ''}
                            </span>
                            <span>
                              {formatDurationShort(blk.startTime)} →{' '}
                              {formatDurationShort(blk.endTime)}
                            </span>
                          </div>
                          <div className="text-xs text-white truncate">
                            {blk.text.replace(/\n/g, ' / ')}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBlockId(blk.id);
                              seekTo(
                                blk.startTime +
                                  effectiveGlobalOffset +
                                  effectiveSourceOffset +
                                  0.02
                              );
                            }}
                            className="h-7 px-2 rounded bg-[#26262e] text-[10px] text-[#d4d4dd] font-mono cursor-pointer"
                            title="Ouvir a partir deste bloco"
                          >
                            Ir
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBlockId(blk.id);
                              setMobileNavTab('edit');
                            }}
                            className="h-7 w-7 grid place-items-center rounded bg-[#26262e] text-[#00d4e5] cursor-pointer"
                            title="Editar Texto e Estilo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {mobileNavTab === 'lyrics' && (
              <LeftProjectSidebar
                project={project}
                selectedBlockId={selectedBlockId}
                isMobileFullWidth={true}
                forcedTab="lyrics"
                onEditSelectedBlockOnMobile={() => setMobileNavTab('edit')}
                onUpdateProjectMeta={handleUpdateProjectMeta}
                onSelectBlock={(blockId, seekToStart) => {
                  setSelectedBlockId(blockId);
                  if (seekToStart) {
                    const blk = project.blocks.find((b) => b.id === blockId);
                    if (blk) {
                      seekTo(
                        blk.startTime +
                          effectiveGlobalOffset +
                          effectiveSourceOffset +
                          0.02
                      );
                    }
                  }
                }}
                onAddBlock={handleAddBlock}
                onDuplicateBlock={handleDuplicateBlock}
                onSplitBlock={handleSplitBlock}
                onMergeWithNextBlock={handleMergeWithNextBlock}
                onMoveBlockOrder={handleMoveBlockOrder}
                onDeleteBlock={handleDeleteBlock}
                onOpenSubtitleConverter={() => setShowSubtitleConverter(true)}
                onAddMediaSource={handleAddMediaSource}
                onReplaceMediaSourceFile={handleReplaceMediaSourceFile}
                onUpdateMediaSource={handleUpdateMediaSource}
                onExtractAudio={handleExtractAudio}
                onRemoveMediaSource={handleRemoveMediaSource}
                onSetReferenceSource={(sourceId) =>
                  handleUpdateProjectMeta({ referenceSourceId: sourceId })
                }
                onSetActivePreviewSource={selectPreviewSource}
                onUpdateCoverFile={handleUpdateCoverFile}
                onUpdateBackgroundFile={handleUpdateBackgroundFile}
              />
            )}

            {mobileNavTab === 'edit' && (
              <RightPropertiesPanel
                project={project}
                selectedBlock={selectedBlock}
                currentTime={currentTime}
                isMobileFullWidth={true}
                onUpdateBlock={handleUpdateBlock}
                onUpdateBlockStyle={handleUpdateBlockStyle}
                onApplyStyleToAllBlocks={handleApplyStyleToAllBlocks}
                onDuplicateBlock={handleDuplicateBlock}
                onSplitBlock={handleSplitBlock}
                onMergeWithNextBlock={handleMergeWithNextBlock}
                onDeleteBlock={handleDeleteBlock}
                onUpdateProjectMeta={handleUpdateProjectMeta}
              />
            )}

            {mobileNavTab === 'media' && (
              <LeftProjectSidebar
                project={project}
                selectedBlockId={selectedBlockId}
                isMobileFullWidth={true}
                forcedTab="media"
                onUpdateProjectMeta={handleUpdateProjectMeta}
                onSelectBlock={(blockId) => setSelectedBlockId(blockId)}
                onAddBlock={handleAddBlock}
                onDuplicateBlock={handleDuplicateBlock}
                onSplitBlock={handleSplitBlock}
                onMergeWithNextBlock={handleMergeWithNextBlock}
                onMoveBlockOrder={handleMoveBlockOrder}
                onDeleteBlock={handleDeleteBlock}
                onOpenSubtitleConverter={() => setShowSubtitleConverter(true)}
                onAddMediaSource={handleAddMediaSource}
                onReplaceMediaSourceFile={handleReplaceMediaSourceFile}
                onUpdateMediaSource={handleUpdateMediaSource}
                onExtractAudio={handleExtractAudio}
                onRemoveMediaSource={handleRemoveMediaSource}
                onSetReferenceSource={(sourceId) =>
                  handleUpdateProjectMeta({ referenceSourceId: sourceId })
                }
                onSetActivePreviewSource={selectPreviewSource}
                onUpdateCoverFile={handleUpdateCoverFile}
                onUpdateBackgroundFile={handleUpdateBackgroundFile}
              />
            )}
          </div>
        </main>

        {/* PAINEL DIREITO: PROPRIEDADES (Desktop Only) */}
        <div className="hidden lg:flex h-full">
          <RightPropertiesPanel
            project={project}
            selectedBlock={selectedBlock}
            currentTime={currentTime}
            onUpdateBlock={handleUpdateBlock}
            onUpdateBlockStyle={handleUpdateBlockStyle}
            onApplyStyleToAllBlocks={handleApplyStyleToAllBlocks}
            onDuplicateBlock={handleDuplicateBlock}
            onSplitBlock={handleSplitBlock}
            onMergeWithNextBlock={handleMergeWithNextBlock}
            onDeleteBlock={handleDeleteBlock}
            onUpdateProjectMeta={handleUpdateProjectMeta}
          />
        </div>

        {/* ================================================================== */}
        {/* COMPACT MOBILE & TABLET BOTTOM NAVIGATION BAR (CapCut Graphite)    */}
        {/* ================================================================== */}
        <nav className="lg:hidden h-12 bg-[#18181c] border-t border-[#2b2b33] grid grid-cols-4 shrink-0 z-30">
          <button
            type="button"
            onClick={() => setMobileNavTab('sync')}
            className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              mobileNavTab === 'sync'
                ? 'text-[#00d4e5] bg-[#00d4e5]/10 font-bold'
                : 'text-[#8a8e99]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-[10px]">Sincronizar</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileNavTab('lyrics')}
            className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              mobileNavTab === 'lyrics'
                ? 'text-[#00d4e5] bg-[#00d4e5]/10 font-bold'
                : 'text-[#8a8e99]'
            }`}
          >
            <ListMusic className="w-4 h-4" />
            <span className="text-[10px]">Letras ({project.blocks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileNavTab('edit')}
            className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              mobileNavTab === 'edit'
                ? 'text-[#00d4e5] bg-[#00d4e5]/10 font-bold'
                : 'text-[#8a8e99]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[10px]">Bloco & Letra</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileNavTab('media')}
            className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              mobileNavTab === 'media'
                ? 'text-[#00d4e5] bg-[#00d4e5]/10 font-bold'
                : 'text-[#8a8e99]'
            }`}
          >
            <FolderCog className="w-4 h-4" />
            <span className="text-[10px]">Mídias & Capa</span>
          </button>
        </nav>
      </div>

      {/* MODALS */}
      {txtModalData && (
        <TxtImportModal
          fileName={txtModalData.fileName}
          rawText={txtModalData.rawText}
          onCancel={() => setTxtModalData(null)}
          onConfirm={(splitMode, editedText) => {
            const blocks = parseTxtContent(
              editedText,
              project.defaultStyle,
              splitMode
            );
            setTxtModalData(null);
            if (blocks.length > 0) {
              onChangeProject({
                ...project,
                blocks,
                updatedAt: Date.now()
              });
              setSelectedBlockId(blocks[0].id);
              showNotice(
                `${blocks.length} blocos gerados a partir do TXT (${
                  splitMode === 'stanza' ? 'estrofes' : 'linhas'
                }).`
              );
            }
          }}
        />
      )}

      {showSubtitleConverter && (
        <SubtitleConverterModal
          blocks={project.blocks}
          onCancel={() => setShowSubtitleConverter(false)}
          onApply={(convertedBlocks) => {
            setShowSubtitleConverter(false);
            onChangeProject({
              ...project,
              blocks: convertedBlocks,
              updatedAt: Date.now()
            });
            if (convertedBlocks[0]) {
              setSelectedBlockId(convertedBlocks[0].id);
            }
            showNotice(
              `Legenda convertida em letra (${convertedBlocks.length} blocos).`
            );
          }}
        />
      )}

      {showMp4ExportModal && (
        <Mp4ExportModal
          project={project}
          onClose={() => setShowMp4ExportModal(false)}
        />
      )}
    </div>
  );
};
