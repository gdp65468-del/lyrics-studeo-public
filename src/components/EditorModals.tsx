/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  Wand2,
  Film,
  Music,
  Image as ImageIcon,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle
} from 'lucide-react';
import {
  SongProject,
  LyricBlock,
  DEFAULT_LYRIC_STYLE,
  formatMillisTimestamp
} from '../types/lyrics';
import {
  SubtitleCleanOptions,
  DEFAULT_SUBTITLE_CLEAN_OPTIONS,
  convertSubtitleToLyricsPreview
} from '../lib/parsers';
import {
  Mp4ExportConfig,
  Mp4ExportStage,
  exportProjectToVideoFile
} from '../lib/mp4Exporter';
import { canExportVideoThroughHost, exportMdsongVideoThroughHost } from '../lib/hostBridge';

// ============================================================================
// 1. NEW PROJECT MODAL (Section 4)
// ============================================================================

export interface NewProjectFormValues {
  title: string;
  artist: string;
  album: string;
  year: string;
  category: string;
  notes: string;
  coverFile: File | null;
  audioPlaybackFile: File | null;
  audioCantadoFile: File | null;
  videoPlaybackFile: File | null;
  videoCantadoFile: File | null;
  lyricFile: File | null;
}

interface NewProjectModalProps {
  onClose: () => void;
  onCreate: (values: NewProjectFormValues) => Promise<void>;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  onClose,
  onCreate
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('Louvor Jovem 2026');
  const [year, setYear] = useState('2026');
  const [category, setCategory] = useState('Adoração / Jovem');
  const [notes, setNotes] = useState('');

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [audioPlaybackFile, setAudioPlaybackFile] = useState<File | null>(null);
  const [audioCantadoFile, setAudioCantadoFile] = useState<File | null>(null);
  const [videoPlaybackFile, setVideoPlaybackFile] = useState<File | null>(null);
  const [videoCantadoFile, setVideoCantadoFile] = useState<File | null>(null);
  const [lyricFile, setLyricFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      await onCreate({
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        year: year.trim(),
        category: category.trim(),
        notes: notes.trim(),
        coverFile,
        audioPlaybackFile,
        audioCantadoFile,
        videoPlaybackFile,
        videoCantadoFile,
        lyricFile
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#18181c] border border-[#2b2b33] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#1f1f25] border-b border-[#2b2b33] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00d4e5]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              NOVO PROJETO DE MÚSICA
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8a8e99] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                Título da música *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Minha Esperança"
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                Artista / Ministério
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ex: Ministério Jovem"
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                Álbum / Coletânea
              </label>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Ex: Louvor Jovem 2026"
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                  Ano
                </label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2026"
                  className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                  Categoria
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Adoração"
                  className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-[#9ca0ab]">
              Observações
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tom original, andamento ou instruções de projeção..."
              className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
            />
          </div>

          {/* Optional Initial Files */}
          <div className="pt-2 border-t border-[#2b2b33] space-y-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#00d4e5]">
              Arquivos Iniciais (Opcionais — podem ser adicionados depois no editor)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              <label className="flex items-center justify-between bg-[#121215] border border-[#2e2e38] hover:border-[#00d4e5] rounded px-3 py-2 cursor-pointer">
                <span className="flex items-center gap-2 truncate text-[#d4d4dd]">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {coverFile ? coverFile.name : 'Capa (JPG, PNG, WEBP)'}
                  </span>
                </span>
                <span className="text-[10px] text-[#00d4e5] font-semibold ml-2 shrink-0">
                  Selecionar
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-between bg-[#121215] border border-[#2e2e38] hover:border-[#00d4e5] rounded px-3 py-2 cursor-pointer">
                <span className="flex items-center gap-2 truncate text-[#d4d4dd]">
                  <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">
                    {lyricFile ? lyricFile.name : 'Letra / Legenda (.LRC, .SRT, .VTT, .TXT)'}
                  </span>
                </span>
                <span className="text-[10px] text-[#00d4e5] font-semibold ml-2 shrink-0">
                  Selecionar
                </span>
                <input
                  type="file"
                  accept=".lrc,.srt,.vtt,.txt,text/plain"
                  onChange={(e) => setLyricFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-between bg-[#121215] border border-[#2e2e38] hover:border-[#00d4e5] rounded px-3 py-2 cursor-pointer">
                <span className="flex items-center gap-2 truncate text-[#d4d4dd]">
                  <Music className="w-3.5 h-3.5 text-[#00d4b2] shrink-0" />
                  <span className="truncate">
                    {audioPlaybackFile ? audioPlaybackFile.name : 'Áudio Playback (MP3, WAV)'}
                  </span>
                </span>
                <span className="text-[10px] text-[#00d4e5] font-semibold ml-2 shrink-0">
                  Selecionar
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudioPlaybackFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-between bg-[#121215] border border-[#2e2e38] hover:border-[#00d4e5] rounded px-3 py-2 cursor-pointer">
                <span className="flex items-center gap-2 truncate text-[#d4d4dd]">
                  <Music className="w-3.5 h-3.5 text-[#00d4e5] shrink-0" />
                  <span className="truncate">
                    {audioCantadoFile ? audioCantadoFile.name : 'Áudio Cantado (MP3, WAV)'}
                  </span>
                </span>
                <span className="text-[10px] text-[#00d4e5] font-semibold ml-2 shrink-0">
                  Selecionar
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudioCantadoFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-between bg-[#121215] border border-[#2e2e38] hover:border-[#00d4e5] rounded px-3 py-2 cursor-pointer">
                <span className="flex items-center gap-2 truncate text-[#d4d4dd]">
                  <Film className="w-3.5 h-3.5 text-[#00d4e5] shrink-0" />
                  <span className="truncate">
                    {videoPlaybackFile ? videoPlaybackFile.name : 'Vídeo Playback (MP4, WEBM)'}
                  </span>
                </span>
                <span className="text-[10px] text-[#00d4e5] font-semibold ml-2 shrink-0">
                  Selecionar
                </span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoPlaybackFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-between bg-[#121215] border border-[#2e2e38] hover:border-[#00d4e5] rounded px-3 py-2 cursor-pointer">
                <span className="flex items-center gap-2 truncate text-[#d4d4dd]">
                  <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">
                    {videoCantadoFile ? videoCantadoFile.name : 'Vídeo Cantado (MP4, WEBM)'}
                  </span>
                </span>
                <span className="text-[10px] text-[#00d4e5] font-semibold ml-2 shrink-0">
                  Selecionar
                </span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoCantadoFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#2b2b33]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-[#25252c] hover:bg-[#30303a] text-xs font-semibold text-[#d4d4dd] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isCreating}
              className="px-5 py-2 rounded bg-[#00d4e5] hover:bg-[#00bfe0] disabled:opacity-50 text-xs font-extrabold text-zinc-950 flex items-center gap-2 cursor-pointer"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Criar Projeto
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 2. TXT IMPORT MODAL (Section 18)
// ============================================================================

interface TxtImportModalProps {
  fileName: string;
  rawText: string;
  onCancel: () => void;
  onConfirm: (splitMode: 'line' | 'stanza', editedText: string) => void;
}

export const TxtImportModal: React.FC<TxtImportModalProps> = ({
  fileName,
  rawText,
  onCancel,
  onConfirm
}) => {
  const [splitMode, setSplitMode] = useState<'line' | 'stanza'>('stanza');
  const [textValue, setTextValue] = useState(rawText);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#18181c] border border-[#2b2b33] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#1f1f25] border-b border-[#2b2b33] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            IMPORTAR LETRA .TXT ({fileName})
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#8a8e99] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <div className="space-y-2">
            <span className="block text-[11px] font-semibold text-[#9ca0ab]">
              Como deseja dividir os blocos de letra?
            </span>

            <label className="flex items-center gap-2.5 p-2.5 rounded bg-[#121215] border border-[#2e2e38] cursor-pointer">
              <input
                type="radio"
                name="txtSplitMode"
                checked={splitMode === 'stanza'}
                onChange={() => setSplitMode('stanza')}
              />
              <div>
                <div className="font-semibold text-white">Uma estrofe por bloco</div>
                <div className="text-[11px] text-[#8a8e99]">
                  Divide usando linhas em branco entre estrofes (ideal para projeção em telão)
                </div>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded bg-[#121215] border border-[#2e2e38] cursor-pointer">
              <input
                type="radio"
                name="txtSplitMode"
                checked={splitMode === 'line'}
                onChange={() => setSplitMode('line')}
              />
              <div>
                <div className="font-semibold text-white">Uma linha por bloco</div>
                <div className="text-[11px] text-[#8a8e99]">
                  Cada linha de texto vira um bloco individual na timeline
                </div>
              </div>
            </label>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-[#9ca0ab]">
              Texto a importar (você pode revisar antes de gerar os blocos):
            </label>
            <textarea
              rows={7}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              className="w-full bg-[#121215] border border-[#2e2e38] rounded p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00d4e5]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#2b2b33]">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-1.5 rounded bg-[#25252c] text-[#d4d4dd] font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(splitMode, textValue)}
              className="px-4 py-1.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] text-zinc-950 font-extrabold cursor-pointer"
            >
              Gerar Blocos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. CONVERTER LEGENDA EM LETRA MODAL (Section 20)
// ============================================================================

interface SubtitleConverterModalProps {
  blocks: LyricBlock[];
  onCancel: () => void;
  onApply: (convertedBlocks: LyricBlock[]) => void;
}

export const SubtitleConverterModal: React.FC<SubtitleConverterModalProps> = ({
  blocks,
  onCancel,
  onApply
}) => {
  const [options, setOptions] = useState<SubtitleCleanOptions>(
    DEFAULT_SUBTITLE_CLEAN_OPTIONS
  );

  const preview = useMemo(
    () => convertSubtitleToLyricsPreview(blocks, options),
    [blocks, options]
  );

  const toggleOpt = (key: keyof SubtitleCleanOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#18181c] border border-[#2b2b33] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-5 py-3.5 bg-[#1f1f25] border-b border-[#2b2b33] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-[#00d4e5]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              CONVERTER LEGENDA EM LETRA
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#8a8e99] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Checkboxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 bg-[#121215] border border-[#2b2b33] rounded p-3">
            <label className="flex items-center gap-2 cursor-pointer text-[#e4e4ea]">
              <input
                type="checkbox"
                checked={options.removeEmptyLines}
                onChange={() => toggleOpt('removeEmptyLines')}
              />
              <span>Remover linhas vazias</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-[#e4e4ea]">
              <input
                type="checkbox"
                checked={options.removeHtmlTags}
                onChange={() => toggleOpt('removeHtmlTags')}
              />
              <span>Remover tags HTML (&lt;i&gt;, &lt;b&gt;)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-[#e4e4ea]">
              <input
                type="checkbox"
                checked={options.removeSoundCues}
                onChange={() => toggleOpt('removeSoundCues')}
              />
              <span>Remover [Música], [Aplausos]</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-[#e4e4ea]">
              <input
                type="checkbox"
                checked={options.mergeShortLines}
                onChange={() => toggleOpt('mergeShortLines')}
              />
              <span>Unir linhas curtas fragmentadas</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-[#e4e4ea]">
              <input
                type="checkbox"
                checked={options.mergeNearbyBlocks}
                onChange={() => toggleOpt('mergeNearbyBlocks')}
              />
              <span>Unir blocos próximos</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-[#e4e4ea]">
              <input
                type="checkbox"
                checked={options.fixBadLineBreaks}
                onChange={() => toggleOpt('fixBadLineBreaks')}
              />
              <span>Corrigir quebras ruins</span>
            </label>
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between text-[11px] text-[#9ca0ab] px-1">
            <span>
              Original: <strong className="text-white">{preview.beforeBlocks.length}</strong>{' '}
              blocos → Resultado:{' '}
              <strong className="text-[#00d4b2]">{preview.afterBlocks.length}</strong>{' '}
              blocos
            </span>
            <span className="font-mono text-[#00d4e5]">
              {preview.mergedCount} unidos · {preview.removedCount} vazios/ruídos removidos
            </span>
          </div>

          {/* Side-by-side ANTES / DEPOIS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[#121215] border border-[#2b2b33] rounded p-3 flex flex-col h-64">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2 pb-1.5 border-b border-[#2b2b33]">
                ANTES ({preview.beforeBlocks.length} blocos)
              </div>
              <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                {preview.beforeBlocks.map((b, i) => (
                  <div
                    key={b.id || i}
                    className="p-2 rounded bg-[#18181c] border border-[#2b2b33] text-[11px]"
                  >
                    <div className="font-mono text-[10px] text-[#8a8e99] mb-0.5">
                      #{i + 1} · {formatMillisTimestamp(b.startTime)} →{' '}
                      {formatMillisTimestamp(b.endTime)}
                    </div>
                    <div className="text-[#e4e4ea] whitespace-pre-line">{b.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#121215] border border-[#00d4b2]/35 rounded p-3 flex flex-col h-64">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#00d4b2] mb-2 pb-1.5 border-b border-[#2b2b33]">
                DEPOIS ({preview.afterBlocks.length} blocos)
              </div>
              <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                {preview.afterBlocks.map((b, i) => (
                  <div
                    key={b.id || i}
                    className="p-2 rounded bg-[#18181c] border border-[#00d4b2]/30 text-[11px]"
                  >
                    <div className="font-mono text-[10px] text-[#00d4b2] mb-0.5">
                      #{i + 1} · {formatMillisTimestamp(b.startTime)} →{' '}
                      {formatMillisTimestamp(b.endTime)}
                    </div>
                    <div className="text-white font-medium whitespace-pre-line">
                      {b.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-[#1f1f25] border-t border-[#2b2b33] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded bg-[#25252c] hover:bg-[#30303a] text-xs font-semibold text-[#d4d4dd] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onApply(preview.afterBlocks)}
            className="px-4 py-1.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] text-xs font-extrabold text-zinc-950 flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. EXPORTAR VÍDEO MP4 MODAL (Sections 39 & 40)
// ============================================================================

interface Mp4ExportModalProps {
  project: SongProject;
  onClose: () => void;
}

export const Mp4ExportModal: React.FC<Mp4ExportModalProps> = ({
  project,
  onClose
}) => {
  const [sourceId, setSourceId] = useState<string | null>(
    project.activePreviewSourceId ||
      project.referenceSourceId ||
      project.sources[0]?.id ||
      null
  );
  const [resolution, setResolution] = useState<'1920x1080' | '1280x720'>('1920x1080');
  const [quality, setQuality] = useState<'high' | 'medium' | 'compact'>('high');
  const [renderDurationMode, setRenderDurationMode] = useState<'preview12' | 'full'>(
    'preview12'
  );

  const [isExporting, setIsExporting] = useState(false);
  const [stage, setStage] = useState<Mp4ExportStage>('Preparando');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [abortRef] = useState<{ cancelled: boolean }>({ cancelled: false });

  const handleStartExport = async () => {
    setErrorMsg(null);
    setIsExporting(true);
    abortRef.cancelled = false;

    const config: Mp4ExportConfig = {
      sourceId,
      resolution,
      fps: 30,
      quality,
      maxRenderSeconds: renderDurationMode === 'preview12' ? 12 : project.duration || 180
    };

    try {
      if (await canExportVideoThroughHost()) {
        await exportMdsongVideoThroughHost(project, config, (_, pct) => {
          setStage(pct < 90 ? 'Processando mídia' : 'Codificando');
          setProgress(pct);
        }, abortRef);
        setIsExporting(false);
        onClose();
        return;
      }
      const result = await exportProjectToVideoFile(
        project,
        config,
        (st, pct) => {
          setStage(st);
          setProgress(pct);
        },
        abortRef
      );

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsExporting(false);
      onClose();
    } catch (err) {
      setIsExporting(false);
      setErrorMsg(err instanceof Error ? err.message : 'Falha na exportação de vídeo.');
    }
  };

  const handleCancel = () => {
    if (isExporting) {
      abortRef.cancelled = true;
      setIsExporting(false);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#18181c] border border-[#2b2b33] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#1f1f25] border-b border-[#2b2b33] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-[#00d4e5]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              EXPORTAR VÍDEO
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-[#8a8e99] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-[11px] text-[#9ca0ab]">No MediaDeck, o FFmpeg gera MP4 completo. Fora do aplicativo, a exportação do navegador é experimental e pode gerar WebM.</p>
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-[#9ca0ab]">
              Fonte de áudio/vídeo:
            </label>
            <select
              disabled={isExporting}
              value={sourceId || ''}
              onChange={(e) => setSourceId(e.target.value || null)}
              className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white"
            >
              {project.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.fileName})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                Resolução:
              </label>
              <select
                disabled={isExporting}
                value={resolution}
                onChange={(e) =>
                  setResolution(e.target.value as '1920x1080' | '1280x720')
                }
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white"
              >
                <option value="1920x1080">1920x1080 (Full HD)</option>
                <option value="1280x720">1280x720 (HD)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                FPS:
              </label>
              <input
                type="text"
                disabled
                value="30 fps"
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-[#8a8e99]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                Qualidade:
              </label>
              <select
                disabled={isExporting}
                value={quality}
                onChange={(e) =>
                  setQuality(e.target.value as 'high' | 'medium' | 'compact')
                }
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white"
              >
                <option value="high">Alta (6 Mbps)</option>
                <option value="medium">Média (3.2 Mbps)</option>
                <option value="compact">Compacta (1.5 Mbps)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#9ca0ab]">
                Trecho de Renderização:
              </label>
              <select
                disabled={isExporting}
                value={renderDurationMode}
                onChange={(e) =>
                  setRenderDurationMode(e.target.value as 'preview12' | 'full')
                }
                className="w-full bg-[#121215] border border-[#2e2e38] rounded px-3 py-2 text-xs text-white"
              >
                <option value="preview12">Primeiros 12s (Rápido)</option>
                <option value="full">Música Completa (Tempo real)</option>
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isExporting && (
            <div className="p-3 rounded bg-[#121215] border border-[#2b2b33] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#00d4e5] font-semibold flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {stage}...
                </span>
                <span className="font-mono text-white">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#25252c] overflow-hidden">
                <div
                  className="h-full bg-[#00d4e5] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2b2b33]">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-1.5 rounded bg-[#25252c] hover:bg-[#30303a] text-xs font-semibold text-[#d4d4dd] cursor-pointer"
            >
              Cancelar
            </button>
            {!isExporting && (
              <button
                type="button"
                onClick={handleStartExport}
                className="px-4 py-1.5 rounded bg-[#00d4e5] hover:bg-[#00bfe0] text-xs font-extrabold text-zinc-950 cursor-pointer"
              >
                Exportar vídeo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
