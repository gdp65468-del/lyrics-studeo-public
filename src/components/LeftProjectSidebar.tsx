/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Music,
  Film,
  Plus,
  Trash2,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Copy,
  Scissors,
  Merge,
  Wand2,
  RefreshCw,
  AlertTriangle,
  SlidersHorizontal,
  Edit3
} from 'lucide-react';
import {
  SongProject,
  MediaSourceItem,
  MediaSourceRole,
  formatDurationShort,
  formatSignedOffset
} from '../types/lyrics';

interface LeftProjectSidebarProps {
  project: SongProject;
  selectedBlockId: string | null;
  isMobileFullWidth?: boolean;
  forcedTab?: 'lyrics' | 'media' | 'project';
  onEditSelectedBlockOnMobile?: () => void;
  onUpdateProjectMeta: (patch: Partial<SongProject>) => void;
  onSelectBlock: (blockId: string, seekToStart?: boolean) => void;
  onAddBlock: () => void;
  onDuplicateBlock: (blockId: string) => void;
  onSplitBlock: (blockId: string) => void;
  onMergeWithNextBlock: (blockId: string) => void;
  onMoveBlockOrder: (blockId: string, direction: 'up' | 'down') => void;
  onDeleteBlock: (blockId: string) => void;
  onOpenSubtitleConverter: () => void;
  onAddMediaSource: (role: MediaSourceRole, file: File) => void;
  onReplaceMediaSourceFile: (sourceId: string, file: File) => void;
  onUpdateMediaSource: (sourceId: string, patch: Partial<MediaSourceItem>) => void;
  onExtractAudio: (source: MediaSourceItem) => void;
  onRemoveMediaSource: (sourceId: string) => void;
  onSetReferenceSource: (sourceId: string) => void;
  onSetActivePreviewSource: (sourceId: string) => void;
  onUpdateCoverFile: (file: File | null) => void;
  onUpdateBackgroundFile: (type: 'image' | 'video', file: File) => void;
}

export const LeftProjectSidebar: React.FC<LeftProjectSidebarProps> = ({
  project,
  selectedBlockId,
  isMobileFullWidth = false,
  forcedTab,
  onEditSelectedBlockOnMobile,
  onUpdateProjectMeta,
  onSelectBlock,
  onAddBlock,
  onDuplicateBlock,
  onSplitBlock,
  onMergeWithNextBlock,
  onMoveBlockOrder,
  onDeleteBlock,
  onOpenSubtitleConverter,
  onAddMediaSource,
  onReplaceMediaSourceFile,
  onUpdateMediaSource,
  onExtractAudio,
  onRemoveMediaSource,
  onSetReferenceSource,
  onSetActivePreviewSource,
  onUpdateCoverFile,
  onUpdateBackgroundFile
}) => {
  const [activeTab, setActiveTab] = useState<'lyrics' | 'media' | 'project'>(
    forcedTab || 'lyrics'
  );
  const [showAddMediaMenu, setShowAddMediaMenu] = useState(false);
  const [pendingRole, setPendingRole] = useState<MediaSourceRole>('playback');
  const [replaceTargetSourceId, setReplaceTargetSourceId] = useState<string | null>(null);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab]);

  const addMediaInputRef = useRef<HTMLInputElement | null>(null);
  const replaceMediaInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const bgImageInputRef = useRef<HTMLInputElement | null>(null);
  const bgVideoInputRef = useRef<HTMLInputElement | null>(null);

  const triggerAddMedia = (role: MediaSourceRole) => {
    setPendingRole(role);
    setShowAddMediaMenu(false);
    setTimeout(() => {
      addMediaInputRef.current?.click();
    }, 20);
  };

  const isRoleVideo = (role: MediaSourceRole) =>
    role === 'video-playback' || role === 'video-cantado' || role === 'video';

  return (
    <aside
      className={`${
        isMobileFullWidth
          ? 'w-full flex-1'
          : 'w-[264px] shrink-0 border-r border-[#2b2b33]'
      } bg-[#18181c] flex flex-col select-none overflow-hidden`}
    >
      {/* Hidden File Inputs */}
      <input
        ref={addMediaInputRef}
        type="file"
        accept={isRoleVideo(pendingRole) ? 'video/*' : 'audio/*,video/*'}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAddMediaSource(pendingRole, f);
          e.target.value = '';
        }}
        className="hidden"
      />

      <input
        ref={replaceMediaInputRef}
        type="file"
        accept="audio/*,video/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && replaceTargetSourceId) {
            onReplaceMediaSourceFile(replaceTargetSourceId, f);
          }
          setReplaceTargetSourceId(null);
          e.target.value = '';
        }}
        className="hidden"
      />

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpdateCoverFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      <input
        ref={bgImageInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpdateBackgroundFile('image', f);
          e.target.value = '';
        }}
        className="hidden"
      />

      <input
        ref={bgVideoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpdateBackgroundFile('video', f);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Tab Header: Full 3 tabs on desktop; on mobile only show Mídias | Capa switch when in 'media' mode */}
      {!isMobileFullWidth ? (
        <div className="grid grid-cols-3 border-b border-[#2b2b33] bg-[#131316] p-1 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('lyrics')}
            className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
              activeTab === 'lyrics'
                ? 'bg-[#00d4e5] text-zinc-950'
                : 'text-[#8a8e99] hover:text-white'
            }`}
          >
            Letras ({project.blocks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
              activeTab === 'media'
                ? 'bg-[#00d4e5] text-zinc-950'
                : 'text-[#8a8e99] hover:text-white'
            }`}
          >
            Mídias ({project.sources.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('project')}
            className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
              activeTab === 'project'
                ? 'bg-[#00d4e5] text-zinc-950'
                : 'text-[#8a8e99] hover:text-white'
            }`}
          >
            Projeto
          </button>
        </div>
      ) : forcedTab === 'media' ? (
        <div className="grid grid-cols-2 border-b border-[#2b2b33] bg-[#131316] p-1 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
              activeTab === 'media'
                ? 'bg-[#00d4e5] text-zinc-950'
                : 'text-[#8a8e99] hover:text-white'
            }`}
          >
            Mídias ({project.sources.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('project')}
            className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
              activeTab === 'project'
                ? 'bg-[#00d4e5] text-zinc-950'
                : 'text-[#8a8e99] hover:text-white'
            }`}
          >
            Capa & Fundo
          </button>
        </div>
      ) : null}

      {/* ================================================================== */}
      {/* TAB 1: LETRAS (Compact, touch-ready list of blocks)                */}
      {/* ================================================================== */}
      {activeTab === 'lyrics' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-[#2b2b33] flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={onAddBlock}
              className="h-8 px-2.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Bloco
            </button>

            <button
              type="button"
              onClick={onOpenSubtitleConverter}
              className="h-8 px-2.5 rounded bg-[#25252c] hover:bg-[#30303a] text-[#d4d4dd] hover:text-white text-xs flex items-center gap-1 cursor-pointer"
              title="Limpar e unir legendas automáticas"
            >
              <Wand2 className="w-3.5 h-3.5 text-[#00d4e5]" />
              Limpar Legenda
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {project.blocks.map((blk, idx) => {
              const isSelected = blk.id === selectedBlockId;
              return (
                <div
                  key={blk.id}
                  onClick={() => onSelectBlock(blk.id, isMobileFullWidth)}
                  onDoubleClick={() => onSelectBlock(blk.id, true)}
                  className={`rounded-md border px-2.5 py-1.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#26262f] border-[#00d4e5]'
                      : 'bg-[#131316]/80 border-[#282830] hover:border-[#3c3c48]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8a8e99] mb-0.5">
                    <span className={isSelected ? 'text-[#00d4e5] font-bold' : ''}>
                      #{idx + 1} {blk.sectionLabel ? `· ${blk.sectionLabel}` : ''}
                    </span>
                    <span>
                      {formatDurationShort(blk.startTime)} –{' '}
                      {formatDurationShort(blk.endTime)}
                    </span>
                  </div>

                  <div className="text-xs text-[#f3f3f6] whitespace-pre-line line-clamp-2 leading-snug">
                    {blk.text}
                  </div>

                  {isSelected && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 pt-1.5 border-t border-[#34343f] flex items-center justify-between gap-1 text-[#9ca0ab]"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onMoveBlockOrder(blk.id, 'up')}
                          disabled={idx === 0}
                          title="Subir"
                          className="h-7 w-7 grid place-items-center rounded bg-[#18181c] hover:bg-[#32323c] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveBlockOrder(blk.id, 'down')}
                          disabled={idx === project.blocks.length - 1}
                          title="Descer"
                          className="h-7 w-7 grid place-items-center rounded bg-[#18181c] hover:bg-[#32323c] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateBlock(blk.id)}
                          title="Duplicar"
                          className="h-7 w-7 grid place-items-center rounded bg-[#18181c] hover:bg-[#32323c] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSplitBlock(blk.id)}
                          title="Dividir"
                          className="h-7 w-7 grid place-items-center rounded bg-[#18181c] hover:bg-[#32323c] cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </button>
                        {idx < project.blocks.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onMergeWithNextBlock(blk.id)}
                            title="Unir com próximo"
                            className="h-7 w-7 grid place-items-center rounded bg-[#18181c] hover:bg-[#32323c] cursor-pointer"
                          >
                            <Merge className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isMobileFullWidth && onEditSelectedBlockOnMobile && (
                          <button
                            type="button"
                            onClick={onEditSelectedBlockOnMobile}
                            className="h-7 px-2.5 rounded bg-[#00d4e5] text-zinc-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            Editar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteBlock(blk.id)}
                          title="Excluir"
                          className="h-7 w-7 grid place-items-center rounded bg-[#18181c] hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: MÍDIAS                                                      */}
      {/* ================================================================== */}
      {activeTab === 'media' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-[#2b2b33] flex items-center justify-between shrink-0">
            <span className="text-[11px] font-medium text-[#8a8e99]">
              Toque para alternar a mídia
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMediaMenu((v) => !v)}
                className="h-8 px-2.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>

              {showAddMediaMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[#1c1c22] border border-[#34343e] rounded-md shadow-2xl py-1 z-30 text-xs">
                  <button
                    type="button"
                    onClick={() => triggerAddMedia('playback')}
                    className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#f3f3f6] cursor-pointer"
                  >
                    <Music className="w-3.5 h-3.5 text-[#00d4b2]" />
                    Áudio Playback
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAddMedia('cantado')}
                    className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#f3f3f6] cursor-pointer"
                  >
                    <Music className="w-3.5 h-3.5 text-[#00d4e5]" />
                    Áudio Cantado
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAddMedia('instrumental')}
                    className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#f3f3f6] cursor-pointer"
                  >
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                    Instrumental
                  </button>
                  <div className="my-1 border-t border-[#2b2b33]" />
                  <button
                    type="button"
                    onClick={() => triggerAddMedia('video-playback')}
                    className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#f3f3f6] cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5 text-[#00d4e5]" />
                    Vídeo Playback
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAddMedia('video-cantado')}
                    className="w-full px-3 py-2 text-left hover:bg-[#282832] flex items-center gap-2 text-[#f3f3f6] cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5 text-purple-400" />
                    Vídeo Cantado
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {project.sources.map((src) => {
              const isRef = project.referenceSourceId === src.id;
              const isActive = project.activePreviewSourceId === src.id;
              const isExpanded = expandedSourceId === src.id;

              return (
                <div
                  key={src.id}
                  onClick={() => onSetActivePreviewSource(src.id)}
                  className={`rounded-md border px-2.5 py-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#26262f] border-[#00d4e5]'
                      : 'bg-[#131316]/80 border-[#282830] hover:border-[#3c3c48]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {src.mediaType === 'video' ? (
                        <Film className="w-3.5 h-3.5 text-[#00d4e5] shrink-0" />
                      ) : (
                        <Music className="w-3.5 h-3.5 text-[#00d4b2] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white text-xs truncate">
                            {src.name}
                          </span>
                          {isRef && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-[#00d4b2]/15 text-[#00d4b2] font-mono">
                              Ref
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8a8e99] truncate">
                          {src.fileName} · {formatDurationShort(src.duration)}
                          {Math.abs(src.offset) > 0.0005
                            ? ` · ${formatSignedOffset(src.offset)}`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSourceId(isExpanded ? null : src.id);
                      }}
                      title="Ajustar Offset ou Arquivo"
                      className={`h-7 w-7 grid place-items-center rounded cursor-pointer ${
                        isExpanded
                          ? 'bg-[#00d4e5] text-zinc-950'
                          : 'text-[#8a8e99] hover:text-white hover:bg-[#2c2c36]'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {src.fileMissing && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 p-1.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-[11px] text-amber-200"
                    >
                      <span className="flex items-center gap-1 truncate">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Ausente
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setReplaceTargetSourceId(src.id);
                          replaceMediaInputRef.current?.click();
                        }}
                        className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-100 font-semibold cursor-pointer"
                      >
                        Localizar
                      </button>
                    </div>
                  )}

                  {isExpanded && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 pt-2 border-t border-[#34343f] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#8a8e99]">
                          Offset (s):
                        </span>
                        <div className="flex items-center gap-1">
                          {src.mediaType === 'video' && (
                            <button
                              type="button"
                              onClick={() => onExtractAudio(src)}
                              className="h-7 px-2 rounded bg-[#00d4b2]/15 hover:bg-[#00d4b2]/25 text-[11px] text-[#00d4b2] flex items-center gap-1 cursor-pointer"
                              title="Extrair áudio MP3 320 kbps deste vídeo"
                            >
                              <Music className="w-3 h-3" />
                              Extrair áudio
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMediaSource(src.id, {
                                offset: Number((src.offset - 0.1).toFixed(3))
                              })
                            }
                            className="h-7 px-2 rounded bg-[#18181c] active:bg-[#00d4e5] active:text-zinc-950 text-xs font-mono text-white cursor-pointer"
                          >
                            -0.1
                          </button>
                          <input
                            type="number"
                            step="0.05"
                            value={src.offset}
                            onChange={(e) =>
                              onUpdateMediaSource(src.id, {
                                offset: parseFloat(e.target.value) || 0
                              })
                            }
                            className="w-16 h-7 bg-[#121215] border border-[#34343e] rounded px-1 text-center font-mono text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMediaSource(src.id, {
                                offset: Number((src.offset + 0.1).toFixed(3))
                              })
                            }
                            className="h-7 px-2 rounded bg-[#18181c] active:bg-[#00d4e5] active:text-zinc-950 text-xs font-mono text-white cursor-pointer"
                          >
                            +0.1
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-0.5">
                        {!isRef ? (
                          <button
                            type="button"
                            onClick={() => onSetReferenceSource(src.id)}
                            className="h-7 px-2 rounded bg-[#18181c] hover:bg-[#2c2c36] text-[11px] text-[#00d4b2] cursor-pointer"
                          >
                            Definir Referência
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#00d4b2]">
                            ✓ Mídia de Referência
                          </span>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReplaceTargetSourceId(src.id);
                              replaceMediaInputRef.current?.click();
                            }}
                            className="h-7 px-2 rounded bg-[#18181c] hover:bg-[#2c2c36] text-[11px] text-[#d4d4dd] flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Trocar
                          </button>
                          {project.sources.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onRemoveMediaSource(src.id)}
                              className="h-7 w-7 grid place-items-center rounded text-[#8a8e99] hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3: PROJETO                                                     */}
      {/* ================================================================== */}
      {activeTab === 'project' && (
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-3 text-xs">
          {/* Cover + Title */}
          <div className="flex items-center gap-2.5 bg-[#131316] border border-[#282830] rounded-md p-2.5">
            <div
              onClick={() => coverInputRef.current?.click()}
              className="w-12 h-12 rounded overflow-hidden border border-[#34343e] shrink-0 relative flex items-center justify-center cursor-pointer"
              style={{ background: project.cover.gradientFallback }}
            >
              {project.cover.imageUrl ? (
                <img
                  src={project.cover.imageUrl}
                  alt={project.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-4 h-4 text-white/60" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="text-xs font-semibold text-white truncate">
                Capa do Projeto
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="h-6 px-2 rounded bg-[#25252c] text-[10px] text-[#00d4e5] font-medium cursor-pointer"
                >
                  Alterar imagem
                </button>
                {project.cover.imageUrl && (
                  <button
                    type="button"
                    onClick={() => onUpdateCoverFile(null)}
                    className="text-[10px] text-[#8a8e99] hover:text-red-400 cursor-pointer"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Metadata inputs */}
          <div className="space-y-2.5">
            <div>
              <label className="block text-[10px] text-[#8a8e99] mb-1">
                Título da Música
              </label>
              <input
                type="text"
                value={project.title}
                onChange={(e) => onUpdateProjectMeta({ title: e.target.value })}
                className="w-full h-8 bg-[#121215] border border-[#2e2e38] rounded px-2.5 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8a8e99] mb-1">
                Artista / Ministério
              </label>
              <input
                type="text"
                value={project.artist}
                onChange={(e) => onUpdateProjectMeta({ artist: e.target.value })}
                className="w-full h-8 bg-[#121215] border border-[#2e2e38] rounded px-2.5 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[#8a8e99] mb-1">
                  Álbum
                </label>
                <input
                  type="text"
                  value={project.album}
                  onChange={(e) => onUpdateProjectMeta({ album: e.target.value })}
                  className="w-full h-8 bg-[#121215] border border-[#2e2e38] rounded px-2.5 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#8a8e99] mb-1">
                  Ano
                </label>
                <input
                  type="text"
                  value={project.year}
                  onChange={(e) => onUpdateProjectMeta({ year: e.target.value })}
                  className="w-full h-8 bg-[#121215] border border-[#2e2e38] rounded px-2.5 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
                />
              </div>
            </div>
          </div>

          {/* Background settings */}
          <div className="pt-2.5 border-t border-[#2b2b33] space-y-2">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#8a8e99]">
              Fundo da Projeção
            </span>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'none', label: 'Preto' },
                  { id: 'color', label: 'Cor' },
                  { id: 'gradient', label: 'Gradiente' },
                  { id: 'image', label: 'Imagem' },
                  { id: 'video', label: 'Vídeo' }
                ] as const
              ).map((bgOpt) => (
                <button
                  key={bgOpt.id}
                  type="button"
                  onClick={() => {
                    if (bgOpt.id === 'image') {
                      bgImageInputRef.current?.click();
                    } else if (bgOpt.id === 'video') {
                      bgVideoInputRef.current?.click();
                    } else {
                      onUpdateProjectMeta({
                        background: {
                          ...project.background,
                          type: bgOpt.id,
                          value:
                            bgOpt.id === 'color'
                              ? '#16161d'
                              : bgOpt.id === 'gradient'
                              ? 'linear-gradient(135deg, #1f1f29 0%, #0a0a0e 100%)'
                              : '#000000'
                        }
                      });
                    }
                  }}
                  className={`h-7 px-2 rounded border text-[11px] font-medium cursor-pointer ${
                    project.background.type === bgOpt.id
                      ? 'bg-[#00d4e5]/20 border-[#00d4e5] text-white'
                      : 'bg-[#121215] border-[#282830] text-[#8a8e99] hover:text-white'
                  }`}
                >
                  {bgOpt.label}
                </button>
              ))}
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] text-[#8a8e99]">
                <span>Escurecer fundo</span>
                <span className="font-mono text-white">
                  {project.background.overlayDim}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={90}
                value={project.background.overlayDim}
                onChange={(e) =>
                  onUpdateProjectMeta({
                    background: {
                      ...project.background,
                      overlayDim: parseInt(e.target.value, 10) || 0
                    }
                  })
                }
                className="w-full accent-[#00d4e5]"
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
