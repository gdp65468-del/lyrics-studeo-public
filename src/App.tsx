/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  SongProject,
  MediaSourceItem,
  MediaSourceRole,
  DEFAULT_LYRIC_STYLE,
  getRoleLabel
} from './types/lyrics';
import {
  loadAllProjectsFromIndexedDb,
  saveProjectToIndexedDb,
  deleteProjectFromIndexedDb,
  createBlankSongProject
} from './lib/storage';
import { unpackMdsongPackage } from './lib/mdsong';
import { detectAndParseSubtitle } from './lib/parsers';
import {
  computeWaveformPeaksFromBlob,
  probeMediaDuration
} from './lib/waveform';
import { ProjectHome } from './components/ProjectHome';
import { LyricEditor } from './components/LyricEditor';
import { LiveLyricPresenter } from './components/LiveLyricPresenter';
import { NewProjectModal, NewProjectFormValues } from './components/EditorModals';
import { AlertCircle, X } from 'lucide-react';

export default function App() {
  const [recentProjects, setRecentProjects] = useState<SongProject[]>([]);
  const [activeProject, setActiveProject] = useState<SongProject | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [showLivePresenter, setShowLivePresenter] = useState<boolean>(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAllProjectsFromIndexedDb()
      .then((list) => { if (mounted) setRecentProjects(list); })
      .catch((error) => { if (mounted) setErrorModalMessage(String(error)); });
    return () => {
      mounted = false;
    };
  }, []);

  const handleProjectUpdate = (updated: SongProject) => {
    setActiveProject(updated);
    setRecentProjects((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      const next = exists
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...prev];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
    saveProjectToIndexedDb(updated).catch(() => {
      setErrorModalMessage('O projeto não foi salvo. Exporte uma cópia .mdsong antes de fechar o editor.');
    });
  };

  const handleOpenMdsongFile = async (file: File) => {
    try {
      const unpacked = await unpackMdsongPackage(file);
      await saveProjectToIndexedDb(unpacked);
      setRecentProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== unpacked.id);
        return [unpacked, ...filtered];
      });
      setActiveProject(unpacked);
    } catch (err) {
      setErrorModalMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível abrir o arquivo .mdsong selecionado.'
      );
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await deleteProjectFromIndexedDb(projectId); }
    catch { setErrorModalMessage('Não foi possível remover o projeto local.'); return; }
    setRecentProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProject?.id === projectId) {
      setActiveProject(null);
    }
  };

  const buildMediaSourceFromFile = async (
    role: MediaSourceRole,
    file: File
  ): Promise<MediaSourceItem> => {
    const objectUrl = URL.createObjectURL(file);
    const mediaType: 'audio' | 'video' =
      file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)
        ? 'video'
        : 'audio';

    let duration = await probeMediaDuration(objectUrl, mediaType);
    let peaks: number[] = [];
    try {
      const wf = await computeWaveformPeaksFromBlob(file, 160);
      peaks = wf.peaks;
      if (wf.duration > 0) duration = wf.duration;
    } catch {
      peaks = Array.from({ length: 120 }, (_, i) => 22 + ((i * 19) % 58));
    }

    return {
      id: `src-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: getRoleLabel(role),
      role,
      mediaType,
      fileName: file.name,
      duration,
      offset: 0,
      volume: 100,
      blob: file,
      objectUrl,
      waveformPeaks: peaks,
      fileMissing: false
    };
  };

  const handleCreateNewProject = async (values: NewProjectFormValues) => {
    const base = createBlankSongProject(values.title);
    base.artist = values.artist;
    base.album = values.album;
    base.year = values.year;
    base.category = values.category;
    base.notes = values.notes;

    if (values.coverFile) {
      base.cover = {
        ...base.cover,
        imageUrl: URL.createObjectURL(values.coverFile),
        fileName: values.coverFile.name,
        blob: values.coverFile
      };
    }

    const createdSources: MediaSourceItem[] = [];

    if (values.audioPlaybackFile) {
      createdSources.push(
        await buildMediaSourceFromFile('playback', values.audioPlaybackFile)
      );
    }
    if (values.audioCantadoFile) {
      createdSources.push(
        await buildMediaSourceFromFile('cantado', values.audioCantadoFile)
      );
    }
    if (values.videoPlaybackFile) {
      createdSources.push(
        await buildMediaSourceFromFile('video-playback', values.videoPlaybackFile)
      );
    }
    if (values.videoCantadoFile) {
      createdSources.push(
        await buildMediaSourceFromFile('video-cantado', values.videoCantadoFile)
      );
    }

    base.sources = createdSources;
    base.referenceSourceId = createdSources[0]?.id || null;
    base.activePreviewSourceId = createdSources[0]?.id || null;
    base.duration = createdSources[0]?.duration || 180;

    if (values.lyricFile) {
      const rawText = await values.lyricFile.text();
      const ext = values.lyricFile.name.split('.').pop()?.toLowerCase();
      const hint =
        ext === 'srt' || ext === 'vtt' || ext === 'lrc' || ext === 'txt'
          ? ext
          : undefined;
      const parsed = detectAndParseSubtitle(rawText, hint, DEFAULT_LYRIC_STYLE);
      if (parsed.blocks.length > 0) {
        base.blocks = parsed.blocks;
      }
    }

    try { await saveProjectToIndexedDb(base); }
    catch { setErrorModalMessage('Não foi possível salvar o projeto local. Verifique o espaço disponível.'); return; }
    setRecentProjects((prev) => [base, ...prev]);
    setShowNewProjectModal(false);
    setActiveProject(base);
  };

  return (
    <>
      {activeProject ? (
        <LyricEditor
          project={activeProject}
          onChangeProject={handleProjectUpdate}
          onBackToHome={() => setActiveProject(null)}
          onOpenNewProjectModal={() => setShowNewProjectModal(true)}
          onOpenMdsongFile={handleOpenMdsongFile}
          onOpenLivePresenter={() => setShowLivePresenter(true)}
        />
      ) : (
        <ProjectHome
          recentProjects={recentProjects}
          onCreateNewProject={() => setShowNewProjectModal(true)}
          onOpenProject={(proj) => setActiveProject(proj)}
          onOpenMdsongFile={handleOpenMdsongFile}
          onDeleteProject={handleDeleteProject}
        />
      )}

      {showNewProjectModal && (
        <NewProjectModal
          onClose={() => setShowNewProjectModal(false)}
          onCreate={handleCreateNewProject}
        />
      )}

      {showLivePresenter && activeProject && (
        <LiveLyricPresenter
          project={activeProject}
          initialSourceId={
            activeProject.activePreviewSourceId ||
            activeProject.referenceSourceId
          }
          onClose={() => setShowLivePresenter(false)}
        />
      )}

      {errorModalMessage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0d1626] border border-red-500/40 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/30 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                Aviso do Pacote .mdsong
              </span>
              <button
                type="button"
                onClick={() => setErrorModalMessage(null)}
                className="text-[#8ea0b9] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-xs text-[#dde6f4] leading-relaxed">
              {errorModalMessage}
            </div>
            <div className="px-4 py-2.5 bg-[#09101c] border-t border-[#1f2d46] flex justify-end">
              <button
                type="button"
                onClick={() => setErrorModalMessage(null)}
                className="px-4 py-1.5 rounded bg-[#1484ff] text-white text-xs font-bold cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
