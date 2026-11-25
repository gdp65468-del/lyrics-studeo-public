/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
  Music,
  Film,
  Eye
} from 'lucide-react';
import {
  SongProject,
  LyricBlock,
  MediaSourceItem,
  formatMillisTimestamp,
  formatSignedOffset
} from '../types/lyrics';

interface LiveLyricPresenterProps {
  project: SongProject;
  initialSourceId: string | null;
  onClose: () => void;
}

function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacityPercent / 100))})`;
}

export const LiveLyricPresenter: React.FC<LiveLyricPresenterProps> = ({
  project,
  initialSourceId,
  onClose
}) => {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    initialSourceId || project.activePreviewSourceId || project.referenceSourceId || project.sources[0]?.id || null
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hideLyrics, setHideLyrics] = useState<boolean>(false);
  const [stageWidth, setStageWidth] = useState<number>(640);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = stageBoxRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setStageWidth(el.clientWidth);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeSource: MediaSourceItem | undefined =
    project.sources.find((s) => s.id === selectedSourceId) || project.sources[0];

  const sourceOffset = activeSource?.offset || 0;
  const globalOffset = project.globalOffset || 0;
  const totalDur = activeSource?.duration || project.duration || 210;

  // Sync play/pause with media elements
  useEffect(() => {
    if (videoRef.current && activeSource?.mediaType === 'video' && activeSource.objectUrl) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
    if (audioRef.current && activeSource?.mediaType === 'audio' && activeSource.objectUrl) {
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, activeSource]);

  // Timer loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      if (
        videoRef.current &&
        activeSource?.mediaType === 'video' &&
        activeSource.objectUrl
      ) {
        setCurrentTime(Number(videoRef.current.currentTime.toFixed(3)));
        return;
      }
      if (
        audioRef.current &&
        activeSource?.mediaType === 'audio' &&
        activeSource.objectUrl
      ) {
        setCurrentTime(Number(audioRef.current.currentTime.toFixed(3)));
        return;
      }
      setCurrentTime((prev) => {
        if (prev + 0.05 >= totalDur) {
          setIsPlaying(false);
          return 0;
        }
        return Number((prev + 0.05).toFixed(3));
      });
    }, 50);
    return () => window.clearInterval(interval);
  }, [isPlaying, totalDur, activeSource]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToBlock(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToBlock(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const activeBlock: LyricBlock | null =
    project.blocks.find((b) => {
      const effStart = b.startTime + globalOffset + sourceOffset;
      const effEnd = b.endTime + globalOffset + sourceOffset;
      return currentTime >= effStart && currentTime <= effEnd;
    }) || null;

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(totalDur, sec));
    setCurrentTime(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
    if (audioRef.current) audioRef.current.currentTime = clamped;
  };

  const jumpToBlock = (delta: number) => {
    if (project.blocks.length === 0) return;
    const currentIdx = project.blocks.findIndex((b) => b.id === activeBlock?.id);
    const nextIdx = Math.max(
      0,
      Math.min(project.blocks.length - 1, (currentIdx === -1 ? 0 : currentIdx) + delta)
    );
    const target = project.blocks[nextIdx];
    if (target) {
      seekTo(Math.max(0, target.startTime + globalOffset + sourceOffset));
    }
  };

  const scaleFactor = stageWidth / 1280;

  return (
    <div className="fixed inset-0 z-50 bg-[#0e0e11]/95 backdrop-blur-md flex flex-col select-none">
      {activeSource?.mediaType === 'audio' && activeSource.objectUrl && (
        <audio
          ref={audioRef}
          src={activeSource.objectUrl}
          muted={isMuted}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Top Header */}
      <header className="h-11 px-2.5 sm:px-4 bg-[#18181c] border-b border-[#2b2b33] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00d4e5]/15 border border-[#00d4e5]/35 text-[#00d4e5] text-[11px] font-semibold shrink-0">
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">Apresentação 16:9</span>
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white truncate">
            {project.title}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {project.sources.length > 0 && (
            <select
              value={selectedSourceId || ''}
              onChange={(e) => {
                setSelectedSourceId(e.target.value);
              }}
              className="h-8 max-w-[130px] sm:max-w-none bg-[#25252c] border border-[#34343e] rounded px-2 text-[11px] text-white"
            >
              {project.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatSignedOffset(s.offset)})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setHideLyrics((h) => !h)}
            className={`h-8 px-2.5 rounded text-[11px] font-medium border cursor-pointer ${
              hideLyrics
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-[#25252c] border-[#34343e] text-[#f3f3f6]'
            }`}
          >
            {hideLyrics ? 'Mostrar' : 'Ocultar'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded bg-[#25252c] hover:bg-[#30303a] border border-[#34343e] text-[#9ca0ab] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Stage + Right Cue List */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-2.5 sm:gap-4 p-2 sm:p-4 overflow-hidden min-h-0">
        <div className="flex flex-col items-center justify-between gap-2 shrink-0 lg:min-h-0">
          {/* 16:9 Stage */}
          <div className="w-full lg:flex-1 flex items-center justify-center lg:min-h-0">
            <div
              ref={stageBoxRef}
              className="relative w-full max-w-[340px] sm:max-w-[520px] lg:max-w-4xl aspect-video rounded-md overflow-hidden border border-[#2e2e38] shadow-2xl"
              style={{
                background:
                  project.background.type === 'color' ||
                  project.background.type === 'gradient'
                    ? project.background.value
                    : '#08080a'
              }}
            >
              {activeSource?.mediaType === 'video' &&
              activeSource.objectUrl &&
              project.useVideoSourceAsBackground ? (
                <video
                  ref={videoRef}
                  src={activeSource.objectUrl}
                  muted={isMuted}
                  playsInline
                  onEnded={() => setIsPlaying(false)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : project.background.type === 'image' && project.background.value ? (
                <img
                  src={project.background.value}
                  alt="Background"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : null}

              {/* Dim Overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundColor: `rgba(0, 0, 0, ${project.background.overlayDim / 100})`
                }}
              />

              {/* Safe Area + Proportional Lyric Render */}
              <div
                className="absolute flex flex-col pointer-events-none"
                style={{
                  top: `${project.safeAreaMargin}%`,
                  bottom: `${project.safeAreaMargin}%`,
                  left: `${project.safeAreaMargin}%`,
                  right: `${project.safeAreaMargin}%`,
                  justifyContent:
                    activeBlock?.style.positionPreset === 'top'
                      ? 'flex-start'
                      : activeBlock?.style.positionPreset === 'center'
                      ? 'center'
                      : 'flex-end',
                  alignItems:
                    activeBlock?.style.align === 'left'
                      ? 'flex-start'
                      : activeBlock?.style.align === 'right'
                      ? 'flex-end'
                      : 'center'
                }}
              >
                {activeBlock && !hideLyrics && (
                  <div
                    style={{
                      fontFamily: activeBlock.style.fontFamily,
                      fontSize: `${Math.max(
                        9,
                        Math.round(activeBlock.style.fontSize * scaleFactor)
                      )}px`,
                      fontWeight: activeBlock.style.bold ? 700 : 400,
                      fontStyle: activeBlock.style.italic ? 'italic' : 'normal',
                      textTransform: activeBlock.style.uppercase ? 'uppercase' : 'none',
                      textAlign: activeBlock.style.align,
                      color: activeBlock.style.textColor,
                      backgroundColor: hexToRgba(
                        activeBlock.style.backgroundColor,
                        activeBlock.style.backgroundOpacity
                      ),
                      lineHeight: activeBlock.style.lineHeight,
                      letterSpacing: `${activeBlock.style.letterSpacing * scaleFactor}px`,
                      WebkitTextStroke:
                        activeBlock.style.outlineWidth > 0
                          ? `${Math.max(0.5, activeBlock.style.outlineWidth * scaleFactor)}px ${activeBlock.style.outlineColor}`
                          : undefined,
                      textShadow:
                        activeBlock.style.shadowBlur > 0
                          ? `${(activeBlock.style.shadowOffsetX || 0) * scaleFactor}px ${
                              (activeBlock.style.shadowOffsetY || 2) * scaleFactor
                            }px ${activeBlock.style.shadowBlur * scaleFactor}px ${
                              activeBlock.style.shadowColor || 'rgba(0,0,0,0.85)'
                            }`
                          : undefined,
                      transform: `translate(${activeBlock.style.offsetX}%, ${activeBlock.style.offsetY}%)`,
                      padding:
                        activeBlock.style.backgroundOpacity > 0
                          ? `${Math.max(4, Math.round(12 * scaleFactor))}px ${Math.max(
                              8,
                              Math.round(20 * scaleFactor)
                            )}px`
                          : '2px 6px',
                      borderRadius: '6px',
                      whiteSpace: 'pre-line',
                      maxWidth: `${activeBlock.style.maxWidth || 92}%`
                    }}
                  >
                    {activeBlock.text}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Compact Transport Bar */}
          <div className="w-full max-w-4xl bg-[#18181c] border border-[#2b2b33] rounded-md p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tabular-nums text-white w-14">
                {formatMillisTimestamp(currentTime).slice(0, 5)}
              </span>
              <input
                type="range"
                min={0}
                max={totalDur}
                step={0.02}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="flex-1 accent-[#00d4e5] h-1.5 bg-[#2a2a34] rounded cursor-pointer"
              />
              <span className="text-[11px] font-mono tabular-nums text-[#8a8e99] w-14 text-right">
                {formatMillisTimestamp(totalDur).slice(0, 5)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => jumpToBlock(-1)}
                  className="h-8 bg-[#25252c] hover:bg-[#30303a] text-[#f3f3f6] border border-[#34343e] rounded px-2.5 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="h-8 bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 rounded px-3.5 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-zinc-950" />
                      Pausar
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-zinc-950" />
                      Play
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => jumpToBlock(1)}
                  className="h-8 bg-[#25252c] hover:bg-[#30303a] text-[#f3f3f6] border border-[#34343e] rounded px-2.5 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  Próximo
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="h-8 w-8 grid place-items-center rounded bg-[#25252c] border border-[#34343e] text-[#9ca0ab] hover:text-white cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right / Bottom Column: Synchronized Blocks */}
        <div className="flex-1 bg-[#18181c] border border-[#2b2b33] rounded-md p-2.5 flex flex-col min-h-0 overflow-hidden">
          <div className="pb-1.5 mb-1.5 border-b border-[#2b2b33] flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              {activeSource?.mediaType === 'video' ? (
                <Film className="w-3.5 h-3.5 text-[#00d4e5]" />
              ) : (
                <Music className="w-3.5 h-3.5 text-[#00d4b2]" />
              )}
              Toque no Bloco para Pular ({project.blocks.length})
            </span>
            <span className="text-[10px] font-mono text-[#8a8e99]">
              Offset: {formatSignedOffset(globalOffset + sourceOffset)}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {project.blocks.map((blk, i) => {
              const effStart = Math.max(0, blk.startTime + globalOffset + sourceOffset);
              const effEnd = Math.max(0.2, blk.endTime + globalOffset + sourceOffset);
              const isCurrent = activeBlock?.id === blk.id;
              return (
                <button
                  key={blk.id}
                  type="button"
                  onClick={() => seekTo(effStart)}
                  className={`w-full text-left px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-[#26262f] border-[#00d4e5] text-white'
                      : 'bg-[#131316] border-[#282830] text-[#d4d4dd] hover:border-[#3c3c48]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8a8e99] mb-0.5">
                    <span className="text-[#00d4e5] font-bold">
                      #{i + 1} · {blk.sectionLabel || `Bloco ${i + 1}`}
                    </span>
                    <span>
                      {formatMillisTimestamp(effStart).slice(0, 5)} → {formatMillisTimestamp(effEnd).slice(0, 5)}
                    </span>
                  </div>
                  <p className="text-xs whitespace-pre-line leading-snug line-clamp-2">{blk.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
