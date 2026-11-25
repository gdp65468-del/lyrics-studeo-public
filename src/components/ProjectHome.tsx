/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import {
  Plus,
  FolderOpen,
  Music,
  Film,
  Trash2,
  Clock,
  CheckCircle2,
  Package,
  Sparkles
} from 'lucide-react';
import {
  SongProject,
  formatDurationShort,
  formatSignedOffset
} from '../types/lyrics';

interface ProjectHomeProps {
  recentProjects: SongProject[];
  onCreateNewProject: () => void;
  onOpenProject: (project: SongProject) => void;
  onOpenMdsongFile: (file: File) => void;
  onDeleteProject: (projectId: string, e: React.MouseEvent) => void;
}

export const ProjectHome: React.FC<ProjectHomeProps> = ({
  recentProjects,
  onCreateNewProject,
  onOpenProject,
  onOpenMdsongFile,
  onDeleteProject
}) => {
  const mdsongInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="min-h-screen bg-[#121215] text-[#f3f3f6] flex flex-col">
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

      {/* Top Header */}
      <header className="min-h-[54px] px-4 sm:px-6 py-2 bg-[#18181c] border-b border-[#2b2b33] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-[#00d4e5] grid place-items-center font-extrabold text-zinc-950 text-sm tracking-tight shrink-0">
            LS
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold tracking-wide text-white uppercase truncate">
                LYRICS STUDIO
              </h1>
              <span className="hidden xs:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00d4e5]/15 border border-[#00d4e5]/35 text-[#00d4e5]">
                .mdsong v1
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-[#8a8e99] truncate">
              Editor Web de Louvor para MediaDeck
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => mdsongInputRef.current?.click()}
            className="min-h-[36px] bg-[#25252c] hover:bg-[#30303a] text-[#f3f3f6] border border-[#34343e] rounded-md py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#00d4e5]" />
            <span className="hidden sm:inline">Abrir .mdsong</span>
            <span className="sm:hidden">Abrir</span>
          </button>

          <button
            type="button"
            onClick={onCreateNewProject}
            className="min-h-[36px] bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 rounded-md py-1.5 px-3.5 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo Projeto</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col gap-6">
        {/* Hero / Quick Actions Bar */}
        <section className="bg-[#18181c] border border-[#2b2b33] rounded-xl p-4 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[#00d4e5]">
              <Sparkles className="w-3.5 h-3.5" />
              Plugin Web Independente para MediaDeck
            </div>
            <h2 className="text-base sm:text-xl font-bold text-white leading-snug">
              Crie, sincronize e empacote músicas em um único arquivo{' '}
              <span className="font-mono text-[#00d4e5]">.mdsong</span>
            </h2>
            <p className="text-xs text-[#9ca0ab] leading-relaxed">
              Vincule Playback, Cantado, Instrumental e Vídeos a uma única letra sincronizada com offsets independentes por mídia, waveform real via Web Audio API, capa e background.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={onCreateNewProject}
              className="min-h-[42px] justify-center bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 rounded-lg py-2 px-4 text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Projeto
            </button>

            <button
              type="button"
              onClick={() => mdsongInputRef.current?.click()}
              className="min-h-[42px] justify-center bg-[#25252c] hover:bg-[#30303a] text-[#f3f3f6] border border-[#34343e] rounded-lg py-2 px-4 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Package className="w-4 h-4 text-[#00d4e5]" />
              Abrir .mdsong
            </button>
          </div>
        </section>

        {/* Recent Projects List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#2b2b33] pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#9ca0ab] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#00d4e5]" />
              Projetos Recentes ({recentProjects.length})
            </h3>
            <span className="text-[11px] text-[#8a8e99]">
              Salvos localmente
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map((proj) => {
              const audioCount = proj.sources.filter((s) => s.mediaType === 'audio').length;
              const videoCount = proj.sources.filter((s) => s.mediaType === 'video').length;

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj)}
                  className="group bg-[#18181c] hover:bg-[#202026] border border-[#2b2b33] hover:border-[#00d4e5] rounded-lg overflow-hidden cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Cover Header */}
                    <div
                      className="h-28 relative flex items-end p-3.5 border-b border-[#2b2b33]"
                      style={{ background: proj.cover.gradientFallback }}
                    >
                      {proj.cover.imageUrl && (
                        <img
                          src={proj.cover.imageUrl}
                          alt={proj.title}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:scale-[1.02] transition-transform"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#121215] via-[#121215]/35 to-transparent" />

                      <div className="relative z-10 w-full flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">
                            {proj.title}
                          </h4>
                          {proj.artist && (
                            <p className="text-[11px] text-[#d4d4dd] truncate">
                              {proj.artist}
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-[#d4d4dd] bg-black/65 px-2 py-0.5 rounded">
                          {formatDurationShort(proj.duration)}
                        </span>
                      </div>
                    </div>

                    {/* Project Summary Details */}
                    <div className="p-3.5 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="inline-flex items-center gap-1 text-[#00d4b2] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {proj.blocks.length} blocos sincronizados
                        </span>
                        <span className="text-[#8a8e99] font-mono">
                          {audioCount} áudio(s) · {videoCount} vídeo(s)
                        </span>
                      </div>

                      {/* Linked Sources Preview */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {proj.sources.slice(0, 4).map((src) => (
                          <span
                            key={src.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#121215] border border-[#2b2b33] text-[10px] text-[#d4d4dd]"
                          >
                            {src.mediaType === 'video' ? (
                              <Film className="w-2.5 h-2.5 text-[#00d4e5]" />
                            ) : (
                              <Music className="w-2.5 h-2.5 text-[#00d4b2]" />
                            )}
                            <span>{src.name}</span>
                            <span className="font-mono text-[#8a8e99]">
                              ({formatSignedOffset(src.offset)})
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="px-3.5 py-2.5 bg-[#141418] border-t border-[#2b2b33] flex items-center justify-between text-[11px]">
                    <span className="text-[#00d4e5] font-semibold group-hover:underline">
                      Abrir no Editor →
                    </span>
                    <button
                      type="button"
                      onClick={(e) => onDeleteProject(proj.id, e)}
                      title="Excluir projeto local"
                      className="p-1 rounded text-[#8a8e99] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};
