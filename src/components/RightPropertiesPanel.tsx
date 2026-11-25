/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Type,
  Clock,
  Copy,
  Scissors,
  Merge,
  Trash2,
  CheckCheck,
  Minus,
  Plus
} from 'lucide-react';
import {
  SongProject,
  LyricBlock,
  LyricStyle,
  formatSignedOffset
} from '../types/lyrics';

interface RightPropertiesPanelProps {
  project: SongProject;
  selectedBlock: LyricBlock | null;
  currentTime: number;
  isMobileFullWidth?: boolean;
  onUpdateBlock: (blockId: string, patch: Partial<LyricBlock>) => void;
  onUpdateBlockStyle: (blockId: string, stylePatch: Partial<LyricStyle>) => void;
  onApplyStyleToAllBlocks: (style: LyricStyle) => void;
  onDuplicateBlock: (blockId: string) => void;
  onSplitBlock: (blockId: string) => void;
  onMergeWithNextBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateProjectMeta: (patch: Partial<SongProject>) => void;
}

const FONT_OPTIONS = [
  { label: 'Inter / Sans Moderna', value: 'Inter, Plus Jakarta Sans, sans-serif' },
  { label: 'Montserrat Bold', value: 'Montserrat, Inter, sans-serif' },
  { label: 'Oswald Broadcast', value: 'Oswald, Impact, sans-serif' },
  { label: 'Georgia Clássica', value: 'Georgia, Cambria, serif' },
  { label: 'Monospace', value: 'JetBrains Mono, monospace' }
];

export const RightPropertiesPanel: React.FC<RightPropertiesPanelProps> = ({
  project,
  selectedBlock,
  currentTime,
  isMobileFullWidth = false,
  onUpdateBlock,
  onUpdateBlockStyle,
  onApplyStyleToAllBlocks,
  onDuplicateBlock,
  onSplitBlock,
  onMergeWithNextBlock,
  onDeleteBlock,
  onUpdateProjectMeta
}) => {
  const [activeTab, setActiveTab] = useState<'block' | 'style'>('block');
  const activeStyle = selectedBlock?.style || project.defaultStyle;

  const handleStyleChange = (patch: Partial<LyricStyle>) => {
    if (selectedBlock) {
      onUpdateBlockStyle(selectedBlock.id, patch);
    } else {
      onUpdateProjectMeta({
        defaultStyle: { ...project.defaultStyle, ...patch }
      });
    }
  };

  const changeFontSizeBy = (delta: number, applyAll = false) => {
    const nextSize = Math.max(12, Math.min(130, (activeStyle.fontSize || 64) + delta));
    const nextStyle = { ...activeStyle, fontSize: nextSize };
    if (applyAll) {
      onApplyStyleToAllBlocks(nextStyle);
    } else {
      handleStyleChange({ fontSize: nextSize });
    }
  };

  return (
    <aside
      className={`${
        isMobileFullWidth
          ? 'w-full flex-1'
          : 'w-[268px] shrink-0 border-l border-[#2b2b33]'
      } bg-[#18181c] flex flex-col select-none overflow-hidden`}
    >
      {/* Clean 2-Tab Header: Bloco | Estilo & Letra */}
      <div className="grid grid-cols-2 border-b border-[#2b2b33] bg-[#131316] p-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('block')}
          className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
            activeTab === 'block'
              ? 'bg-[#00d4e5] text-zinc-950'
              : 'text-[#8a8e99] hover:text-white'
          }`}
        >
          Bloco & Tempo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('style')}
          className={`h-8 rounded text-[11px] font-bold transition-colors cursor-pointer ${
            activeTab === 'style'
              ? 'bg-[#00d4e5] text-zinc-950'
              : 'text-[#8a8e99] hover:text-white'
          }`}
        >
          Estilo & Letra
        </button>
      </div>

      {/* ================================================================== */}
      {/* TAB 1: BLOCO & TEMPO                                               */}
      {/* ================================================================== */}
      {activeTab === 'block' ? (
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-3 text-xs">
          {/* Quick Touch Font Size Control always accessible right at top */}
          <div className="bg-[#131316] border border-[#2b2b33] rounded-md p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#d4d4dd]">
                Tamanho da Letra no Telão
              </span>
              <button
                type="button"
                onClick={() => onApplyStyleToAllBlocks(activeStyle)}
                className="text-[10px] text-[#00d4e5] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                title="Aplicar este tamanho de letra a todos os blocos"
              >
                <CheckCheck className="w-3 h-3" />
                Aplicar em Todos
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => changeFontSizeBy(-4)}
                className="h-8 px-2.5 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                title="Diminuir Letra"
              >
                <Minus className="w-3 h-3" />
                <span>A-</span>
              </button>

              <input
                type="range"
                min={12}
                max={120}
                value={activeStyle.fontSize}
                onChange={(e) =>
                  handleStyleChange({
                    fontSize: Math.max(12, Math.min(120, parseInt(e.target.value, 10) || 48))
                  })
                }
                className="flex-1 accent-[#00d4e5] h-5 cursor-pointer"
              />

              <span className="font-mono text-[11px] text-[#00d4e5] font-bold w-9 text-center shrink-0">
                {activeStyle.fontSize}px
              </span>

              <button
                type="button"
                onClick={() => changeFontSizeBy(4)}
                className="h-8 px-2.5 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                title="Aumentar Letra"
              >
                <span>A+</span>
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {selectedBlock ? (
            <>
              {/* Lyric Text */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#d4d4dd]">
                    Texto do Bloco
                  </label>
                  <span className="text-[10px] font-mono text-[#00d4e5]">
                    Duração: {(selectedBlock.endTime - selectedBlock.startTime).toFixed(1)}s
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={selectedBlock.text}
                  onChange={(e) =>
                    onUpdateBlock(selectedBlock.id, { text: e.target.value })
                  }
                  placeholder="Digite a letra deste bloco..."
                  className="w-full bg-[#121215] border border-[#2e2e38] rounded-md p-2 text-xs text-white leading-snug focus:outline-none focus:border-[#00d4e5]"
                />
              </div>

              {/* Touch-Friendly Start & End Time controls */}
              <div className="grid grid-cols-2 gap-2">
                {/* Início */}
                <div className="bg-[#131316] border border-[#282830] rounded-md p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-[#8a8e99]">
                    <span className="font-semibold text-[#d4d4dd]">Início (s)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const now = Number(currentTime.toFixed(2));
                        onUpdateBlock(selectedBlock.id, {
                          startTime: now,
                          endTime: Math.max(now + 1.0, selectedBlock.endTime)
                        });
                      }}
                      className="px-1.5 py-0.5 rounded bg-[#00d4e5]/15 text-[#00d4e5] font-semibold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Clock className="w-2.5 h-2.5" />
                      Aqui
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const next = Math.max(0, Number((selectedBlock.startTime - 0.1).toFixed(2)));
                        onUpdateBlock(selectedBlock.id, { startTime: next });
                      }}
                      className="h-7 w-7 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-mono text-xs grid place-items-center cursor-pointer shrink-0"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      value={Number(selectedBlock.startTime.toFixed(2))}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        onUpdateBlock(selectedBlock.id, {
                          startTime: val,
                          endTime: Math.max(val + 0.4, selectedBlock.endTime)
                        });
                      }}
                      className="w-full min-w-0 bg-[#18181c] border border-[#34343e] rounded px-1 py-1 font-mono text-[11px] text-center text-white focus:outline-none focus:border-[#00d4e5]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = Number((selectedBlock.startTime + 0.1).toFixed(2));
                        onUpdateBlock(selectedBlock.id, {
                          startTime: next,
                          endTime: Math.max(next + 0.4, selectedBlock.endTime)
                        });
                      }}
                      className="h-7 w-7 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-mono text-xs grid place-items-center cursor-pointer shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Fim */}
                <div className="bg-[#131316] border border-[#282830] rounded-md p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-[#8a8e99]">
                    <span className="font-semibold text-[#d4d4dd]">Fim (s)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const now = Math.max(
                          selectedBlock.startTime + 0.4,
                          Number(currentTime.toFixed(2))
                        );
                        onUpdateBlock(selectedBlock.id, { endTime: now });
                      }}
                      className="px-1.5 py-0.5 rounded bg-[#00d4e5]/15 text-[#00d4e5] font-semibold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Clock className="w-2.5 h-2.5" />
                      Aqui
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const next = Math.max(
                          selectedBlock.startTime + 0.4,
                          Number((selectedBlock.endTime - 0.1).toFixed(2))
                        );
                        onUpdateBlock(selectedBlock.id, { endTime: next });
                      }}
                      className="h-7 w-7 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-mono text-xs grid place-items-center cursor-pointer shrink-0"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.1"
                      min={0.4}
                      value={Number(selectedBlock.endTime.toFixed(2))}
                      onChange={(e) => {
                        const val = Math.max(
                          selectedBlock.startTime + 0.4,
                          parseFloat(e.target.value) || 0.5
                        );
                        onUpdateBlock(selectedBlock.id, { endTime: val });
                      }}
                      className="w-full min-w-0 bg-[#18181c] border border-[#34343e] rounded px-1 py-1 font-mono text-[11px] text-center text-white focus:outline-none focus:border-[#00d4e5]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = Number((selectedBlock.endTime + 0.1).toFixed(2));
                        onUpdateBlock(selectedBlock.id, { endTime: next });
                      }}
                      className="h-7 w-7 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-mono text-xs grid place-items-center cursor-pointer shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional Section Label */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[#8a8e99] shrink-0">
                  Seção:
                </label>
                <input
                  type="text"
                  value={selectedBlock.sectionLabel || ''}
                  onChange={(e) =>
                    onUpdateBlock(selectedBlock.id, { sectionLabel: e.target.value })
                  }
                  placeholder="Ex: Refrão, Estrofe 1..."
                  className="flex-1 bg-[#121215] border border-[#2e2e38] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00d4e5]"
                />
              </div>

              {/* Clean Quick Actions */}
              <div className="pt-1.5 border-t border-[#2b2b33] grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => onDuplicateBlock(selectedBlock.id)}
                  className="h-8 rounded bg-[#25252c] hover:bg-[#30303a] text-[10px] text-[#d4d4dd] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-[#00d4e5]" />
                  <span>Duplicar</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSplitBlock(selectedBlock.id)}
                  className="h-8 rounded bg-[#25252c] hover:bg-[#30303a] text-[10px] text-[#d4d4dd] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Scissors className="w-3 h-3 text-[#00d4e5]" />
                  <span>Dividir</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMergeWithNextBlock(selectedBlock.id)}
                  className="h-8 rounded bg-[#25252c] hover:bg-[#30303a] text-[10px] text-[#d4d4dd] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Merge className="w-3 h-3 text-[#00d4e5]" />
                  <span>Unir</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteBlock(selectedBlock.id)}
                  className="h-8 rounded bg-[#25252c] hover:bg-red-500/20 text-[10px] text-[#d4d4dd] hover:text-red-300 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                  <span>Excluir</span>
                </button>
              </div>
            </>
          ) : (
            <div className="p-2.5 rounded bg-[#131316] border border-[#282830] text-[11px] text-[#8a8e99]">
              Toque em qualquer bloco de letra para editar texto e tempo.
            </div>
          )}

          {/* Global Offset at bottom of Timing tab */}
          <div className="pt-2 border-t border-[#2b2b33] space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#8a8e99]">Offset Global da Letra</span>
              <span className="font-mono text-amber-300">
                {formatSignedOffset(project.globalOffset)}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: '-0.5s', delta: -0.5 },
                { label: '-0.1s', delta: -0.1 },
                { label: 'Zerar', delta: 0 },
                { label: '+0.1s', delta: 0.1 },
                { label: '+0.5s', delta: 0.5 }
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() =>
                    onUpdateProjectMeta({
                      globalOffset:
                        btn.delta === 0
                          ? 0
                          : Number((project.globalOffset + btn.delta).toFixed(3))
                    })
                  }
                  className="h-7 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 font-mono text-[10px] text-[#e4e4ea] cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* TAB 2: ESTILO & LETRA                                              */
        /* ================================================================== */
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#d4d4dd]">
              Aparência da Letra
            </span>
            <button
              type="button"
              onClick={() => onApplyStyleToAllBlocks(activeStyle)}
              className="px-2 py-1 rounded bg-[#00d4e5] text-[10px] text-zinc-950 font-bold flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3 h-3" />
              Aplicar a Todos os Blocos
            </button>
          </div>

          {/* Touch Font Size Slider + A- / A+ */}
          <div className="bg-[#131316] border border-[#282830] rounded-md p-2.5 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#8a8e99]">Tamanho da Fonte</span>
              <span className="font-mono font-bold text-[#00d4e5]">
                {activeStyle.fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeFontSizeBy(-4)}
                className="h-8 px-3 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-bold text-xs cursor-pointer"
              >
                A-
              </button>
              <input
                type="range"
                min={12}
                max={120}
                value={activeStyle.fontSize}
                onChange={(e) =>
                  handleStyleChange({
                    fontSize: Math.max(12, Math.min(120, parseInt(e.target.value, 10) || 48))
                  })
                }
                className="flex-1 accent-[#00d4e5] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => changeFontSizeBy(4)}
                className="h-8 px-3 rounded bg-[#25252c] active:bg-[#00d4e5] active:text-zinc-950 text-white font-bold text-xs cursor-pointer"
              >
                A+
              </button>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-[10px] text-[#8a8e99] mb-1">Fonte</label>
            <select
              value={activeStyle.fontFamily}
              onChange={(e) => handleStyleChange({ fontFamily: e.target.value })}
              className="w-full h-8 bg-[#121215] border border-[#2e2e38] rounded px-2 text-xs text-white"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Formatting & Alignment */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-[#131316] p-1 rounded border border-[#282830]">
              <button
                type="button"
                onClick={() => handleStyleChange({ bold: !activeStyle.bold })}
                className={`h-7 w-8 grid place-items-center rounded cursor-pointer ${
                  activeStyle.bold
                    ? 'bg-[#00d4e5] text-zinc-950'
                    : 'text-[#8a8e99] hover:text-white'
                }`}
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStyleChange({ italic: !activeStyle.italic })}
                className={`h-7 w-8 grid place-items-center rounded cursor-pointer ${
                  activeStyle.italic
                    ? 'bg-[#00d4e5] text-zinc-950'
                    : 'text-[#8a8e99] hover:text-white'
                }`}
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  handleStyleChange({ uppercase: !activeStyle.uppercase })
                }
                className={`h-7 w-8 grid place-items-center rounded cursor-pointer ${
                  activeStyle.uppercase
                    ? 'bg-[#00d4e5] text-zinc-950'
                    : 'text-[#8a8e99] hover:text-white'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-[#131316] p-1 rounded border border-[#282830]">
              <button
                type="button"
                onClick={() => handleStyleChange({ align: 'left' })}
                className={`h-7 w-8 grid place-items-center rounded cursor-pointer ${
                  activeStyle.align === 'left'
                    ? 'bg-[#00d4e5] text-zinc-950'
                    : 'text-[#8a8e99] hover:text-white'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStyleChange({ align: 'center' })}
                className={`h-7 w-8 grid place-items-center rounded cursor-pointer ${
                  activeStyle.align === 'center'
                    ? 'bg-[#00d4e5] text-zinc-950'
                    : 'text-[#8a8e99] hover:text-white'
                }`}
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStyleChange({ align: 'right' })}
                className={`h-7 w-8 grid place-items-center rounded cursor-pointer ${
                  activeStyle.align === 'right'
                    ? 'bg-[#00d4e5] text-zinc-950'
                    : 'text-[#8a8e99] hover:text-white'
                }`}
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-3 gap-2 bg-[#131316] border border-[#282830] rounded-md p-2">
            <label className="space-y-1 cursor-pointer">
              <span className="block text-[10px] text-[#8a8e99]">Cor Texto</span>
              <input
                type="color"
                value={activeStyle.textColor}
                onChange={(e) => handleStyleChange({ textColor: e.target.value })}
                className="w-full h-6 bg-transparent border-0 cursor-pointer"
              />
            </label>

            <label className="space-y-1 cursor-pointer">
              <span className="block text-[10px] text-[#8a8e99]">Tarja</span>
              <input
                type="color"
                value={activeStyle.backgroundColor}
                onChange={(e) =>
                  handleStyleChange({ backgroundColor: e.target.value })
                }
                className="w-full h-6 bg-transparent border-0 cursor-pointer"
              />
            </label>

            <label className="space-y-1 cursor-pointer">
              <span className="block text-[10px] text-[#8a8e99]">Contorno</span>
              <input
                type="color"
                value={activeStyle.outlineColor}
                onChange={(e) => handleStyleChange({ outlineColor: e.target.value })}
                className="w-full h-6 bg-transparent border-0 cursor-pointer"
              />
            </label>
          </div>

          {/* Sliders */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[10px] text-[#8a8e99]">
                <span>Opacidade da Tarja</span>
                <span className="font-mono text-white">
                  {activeStyle.backgroundOpacity}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={activeStyle.backgroundOpacity}
                onChange={(e) =>
                  handleStyleChange({
                    backgroundOpacity: parseInt(e.target.value, 10) || 0
                  })
                }
                className="w-full accent-[#00d4e5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-[10px] text-[#8a8e99]">
                  <span>Contorno</span>
                  <span className="font-mono text-white">
                    {activeStyle.outlineWidth}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.5}
                  value={activeStyle.outlineWidth}
                  onChange={(e) =>
                    handleStyleChange({
                      outlineWidth: parseFloat(e.target.value) || 0
                    })
                  }
                  className="w-full accent-[#00d4e5]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-[#8a8e99]">
                  <span>Sombra</span>
                  <span className="font-mono text-white">
                    {activeStyle.shadowBlur}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={activeStyle.shadowBlur}
                  onChange={(e) =>
                    handleStyleChange({
                      shadowBlur: parseInt(e.target.value, 10) || 0
                    })
                  }
                  className="w-full accent-[#00d4e5]"
                />
              </div>
            </div>
          </div>

          {/* Position */}
          <div className="space-y-1.5 pt-2 border-t border-[#2b2b33]">
            <span className="block text-[10px] text-[#8a8e99]">
              Posição Vertical no Telão
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'top', label: 'Topo' },
                  { id: 'center', label: 'Centro' },
                  { id: 'bottom', label: 'Rodapé' }
                ] as const
              ).map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() =>
                    handleStyleChange({
                      positionPreset: pos.id,
                      offsetX: 0,
                      offsetY: 0
                    })
                  }
                  className={`h-7 rounded border text-[10px] font-medium cursor-pointer ${
                    activeStyle.positionPreset === pos.id
                      ? 'bg-[#00d4e5]/20 border-[#00d4e5] text-white'
                      : 'bg-[#121215] border-[#282830] text-[#8a8e99] hover:text-white'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            <label className="flex items-center justify-between pt-1.5 text-[11px] text-[#8a8e99] cursor-pointer">
              <span>Mostrar guia de área segura</span>
              <input
                type="checkbox"
                checked={project.showSafeAreaGuide}
                onChange={(e) =>
                  onUpdateProjectMeta({ showSafeAreaGuide: e.target.checked })
                }
              />
            </label>
          </div>
        </div>
      )}
    </aside>
  );
};
