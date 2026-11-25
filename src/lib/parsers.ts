/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LyricBlock,
  LyricStyle,
  SongProject,
  SubtitleFormat,
  DEFAULT_LYRIC_STYLE,
  formatLrcTimestamp,
  formatFullSubtitleTimestamp
} from '../types/lyrics';

/**
 * Helper to parse an SRT or VTT timestamp string into seconds.
 * Supports:
 * - HH:MM:SS,mmm (00:00:14,200)
 * - HH:MM:SS.mmm (00:00:14.200)
 * - MM:SS.mmm (00:14.200)
 * - MM:SS,mmm (00:14,200)
 */
export function parseSubtitleTimeToSeconds(rawTime: string): number | null {
  const cleaned = rawTime.trim();
  const match = cleaned.match(
    /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/
  );
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const mins = parseInt(match[2], 10) || 0;
  const secs = parseInt(match[3], 10) || 0;
  const msRaw = (match[4] || '0').padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msRaw, 10) / 1000;

  return Number((hours * 3600 + mins * 60 + secs + ms).toFixed(3));
}

/**
 * Parses .LRC formatted string into LyricBlock[]
 * Supports configurable fallback duration for the last block or media end duration.
 */
export function parseLrcContent(
  rawLrc: string,
  baseStyle: LyricStyle = DEFAULT_LYRIC_STYLE,
  options?: { lastBlockDuration?: number; mediaTotalDuration?: number }
): LyricBlock[] {
  const lines = rawLrc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedEntries: { startTime: number; text: string }[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)/;

  for (const line of lines) {
    // Ignore metadata tags like [ti:...], [ar:...], [al:...], [by:...]
    if (/^\[(ti|ar|al|by|offset|re|ve):/i.test(line)) continue;

    const match = line.match(timeRegex);
    if (match) {
      const mins = parseInt(match[1], 10) || 0;
      const secs = parseInt(match[2], 10) || 0;
      const fracRaw = match[3] || '0';
      const frac =
        fracRaw.length === 3
          ? parseInt(fracRaw, 10) / 1000
          : parseInt(fracRaw.padEnd(2, '0'), 10) / 100;
      const startTime = Number((mins * 60 + secs + frac).toFixed(3));
      const text = match[4].replace(/\s*\/\s*/g, '\n').trim();
      if (text) {
        parsedEntries.push({ startTime, text });
      }
    }
  }

  parsedEntries.sort((a, b) => a.startTime - b.startTime);

  const lastDur = options?.lastBlockDuration || 6;

  return parsedEntries.map((entry, idx) => {
    const nextEntry = parsedEntries[idx + 1];
    let endTime: number;
    if (nextEntry) {
      endTime = Math.max(
        entry.startTime + 0.4,
        Number((nextEntry.startTime - 0.05).toFixed(3))
      );
    } else if (
      options?.mediaTotalDuration &&
      options.mediaTotalDuration > entry.startTime + 1
    ) {
      endTime = Math.min(
        Number(options.mediaTotalDuration.toFixed(3)),
        Number((entry.startTime + lastDur).toFixed(3))
      );
    } else {
      endTime = Number((entry.startTime + lastDur).toFixed(3));
    }

    return {
      id: `lrc-${Date.now()}-${idx}`,
      sectionLabel: `Frase ${idx + 1}`,
      startTime: entry.startTime,
      endTime,
      text: entry.text,
      style: { ...baseStyle }
    };
  });
}

/**
 * Parses .SRT (SubRip) formatted string into LyricBlock[]
 */
export function parseSrtContent(
  rawSrt: string,
  baseStyle: LyricStyle = DEFAULT_LYRIC_STYLE
): LyricBlock[] {
  const normalized = rawSrt.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
  if (!normalized) return [];

  const blocks: LyricBlock[] = [];
  const rawCues = normalized.split(/\n\s*\n/);

  rawCues.forEach((cueChunk, idx) => {
    const lines = cueChunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const arrowLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowLineIdx === -1) return;

    const timeLine = lines[arrowLineIdx];
    const arrowParts = timeLine.split('-->');
    if (arrowParts.length < 2) return;

    const startRaw = arrowParts[0].trim();
    const endRaw = arrowParts[1].trim().split(/\s+/)[0];

    const startTime = parseSubtitleTimeToSeconds(startRaw);
    const endTime = parseSubtitleTimeToSeconds(endRaw);

    if (startTime === null || endTime === null) return;

    const textLines = lines.slice(arrowLineIdx + 1);
    const rawText = textLines.join('\n').trim();
    if (!rawText) return;

    const cueNumber =
      arrowLineIdx > 0 && /^\d+$/.test(lines[0])
        ? `Legenda #${lines[0]}`
        : `Bloco ${idx + 1}`;

    blocks.push({
      id: `srt-${Date.now()}-${idx}`,
      sectionLabel: cueNumber,
      text: rawText,
      startTime,
      endTime: Math.max(startTime + 0.3, endTime),
      style: { ...baseStyle }
    });
  });

  return blocks.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Parses .VTT (WebVTT) formatted string into LyricBlock[]
 * Automatically ignores WEBVTT, NOTE, Kind, Language, STYLE, REGION headers.
 */
export function parseVttContent(
  rawVtt: string,
  baseStyle: LyricStyle = DEFAULT_LYRIC_STYLE
): LyricBlock[] {
  const normalized = rawVtt.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
  if (!normalized) return [];

  const rawParagraphs = normalized.split(/\n\s*\n/);
  const blocks: LyricBlock[] = [];

  rawParagraphs.forEach((para, idx) => {
    const lines = para
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const firstUpper = lines[0].toUpperCase();
    if (
      firstUpper.startsWith('WEBVTT') ||
      firstUpper.startsWith('NOTE') ||
      firstUpper.startsWith('STYLE') ||
      firstUpper.startsWith('REGION')
    ) {
      const hasArrowInHeader = lines.some((l) => l.includes('-->'));
      if (!hasArrowInHeader) return;
    }

    const arrowLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowLineIdx === -1) return;

    const timeLine = lines[arrowLineIdx];
    const arrowParts = timeLine.split('-->');
    if (arrowParts.length < 2) return;

    const startRaw = arrowParts[0].trim();
    const endRaw = arrowParts[1].trim().split(/\s+/)[0];

    const startTime = parseSubtitleTimeToSeconds(startRaw);
    const endTime = parseSubtitleTimeToSeconds(endRaw);
    if (startTime === null || endTime === null) return;

    const textLines = lines
      .slice(arrowLineIdx + 1)
      .filter((l) => !/^(Kind|Language|Style|Region):/i.test(l));
    const rawText = textLines.join('\n').trim();
    if (!rawText) return;

    blocks.push({
      id: `vtt-${Date.now()}-${idx}`,
      sectionLabel: `Bloco ${blocks.length + 1}`,
      text: rawText,
      startTime,
      endTime: Math.max(startTime + 0.3, endTime),
      style: { ...baseStyle }
    });
  });

  return blocks.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Parses plain .TXT lyrics into blocks
 * Supports splitMode: 'line' (Uma linha por bloco) or 'stanza' (Uma estrofe por bloco)
 */
export function parseTxtContent(
  rawTxt: string,
  baseStyle: LyricStyle = DEFAULT_LYRIC_STYLE,
  splitMode: 'line' | 'stanza' = 'stanza'
): LyricBlock[] {
  const normalized = rawTxt.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks: LyricBlock[] = [];
  let cursorTime = 0;

  if (splitMode === 'line') {
    const lines = normalized
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let currentSection: string | undefined;
    lines.forEach((line, idx) => {
      if (/^\[.*\]$/.test(line)) {
        currentSection = line.replace(/^\[|\]$/g, '');
        return;
      }
      const duration = 4.5;
      blocks.push({
        id: `txt-${Date.now()}-${idx}`,
        sectionLabel: currentSection || `Linha ${blocks.length + 1}`,
        text: line,
        startTime: Number(cursorTime.toFixed(3)),
        endTime: Number((cursorTime + duration).toFixed(3)),
        style: { ...baseStyle }
      });
      cursorTime += duration + 0.3;
    });
    return blocks;
  }

  // 'stanza' mode: split by blank lines
  const rawChunks = normalized.includes('\n\n')
    ? normalized.split(/\n\s*\n/)
    : normalized.split('\n');

  rawChunks.forEach((chunk, idx) => {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    let sectionLabel: string | undefined;
    let bodyLines = lines;

    if (/^\[.*\]$/.test(lines[0])) {
      sectionLabel = lines[0].replace(/^\[|\]$/g, '');
      bodyLines = lines.slice(1);
    }

    const text = bodyLines.join('\n') || sectionLabel || '';
    if (!text) return;

    const duration = 5.5;
    blocks.push({
      id: `txt-${Date.now()}-${idx}`,
      sectionLabel: sectionLabel || `Estrofe ${idx + 1}`,
      text,
      startTime: Number(cursorTime.toFixed(3)),
      endTime: Number((cursorTime + duration).toFixed(3)),
      style: { ...baseStyle }
    });
    cursorTime += duration + 0.4;
  });

  return blocks;
}

// ============================================================================
// SECTION 20: CONVERTER LEGENDA EM LETRA (Com Preview ANTES / DEPOIS)
// ============================================================================

export interface SubtitleCleanOptions {
  removeEmptyLines: boolean;
  removeHtmlTags: boolean;
  removeSoundCues: boolean; // [Música], [Music], [Aplausos], [Applause]
  mergeShortLines: boolean;
  mergeNearbyBlocks: boolean;
  fixBadLineBreaks: boolean;
}

export const DEFAULT_SUBTITLE_CLEAN_OPTIONS: SubtitleCleanOptions = {
  removeEmptyLines: true,
  removeHtmlTags: true,
  removeSoundCues: true,
  mergeShortLines: true,
  mergeNearbyBlocks: true,
  fixBadLineBreaks: true
};

/**
 * Generates a non-destructive preview of cleaned/merged lyric blocks from automatic subtitles.
 * Never mutates the project until the user explicitly confirms [ Aplicar ].
 */
export function convertSubtitleToLyricsPreview(
  originalBlocks: LyricBlock[],
  options: SubtitleCleanOptions
): {
  beforeBlocks: LyricBlock[];
  afterBlocks: LyricBlock[];
  removedCount: number;
  mergedCount: number;
} {
  let working: LyricBlock[] = originalBlocks.map((b) => ({
    ...b,
    style: { ...b.style }
  }));

  let removedCount = 0;
  let mergedCount = 0;

  // Step 1: Clean text inside each block
  working = working
    .map((blk) => {
      let txt = blk.text;

      if (options.removeHtmlTags) {
        txt = txt.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '');
      }

      if (options.removeSoundCues) {
        txt = txt.replace(
          /\[(\s*(m[uú]sica|music|aplausos|applause|risos|laughter|instrumental|sil[eê]ncio)\s*)\]/gi,
          ''
        );
        txt = txt.replace(
          /\((\s*(m[uú]sica|music|aplausos|applause|instrumental)\s*)\)/gi,
          ''
        );
      }

      if (options.removeEmptyLines) {
        txt = txt
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n');
      }

      if (options.fixBadLineBreaks) {
        const lines = txt.split('\n');
        if (lines.length >= 2) {
          const rebuilt: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            const cur = lines[i];
            if (
              rebuilt.length > 0 &&
              (rebuilt[rebuilt.length - 1].length < 18 || cur.length < 14) &&
              rebuilt[rebuilt.length - 1].length + cur.length + 1 <= 44
            ) {
              rebuilt[rebuilt.length - 1] = `${rebuilt[rebuilt.length - 1]} ${cur}`;
            } else {
              rebuilt.push(cur);
            }
          }
          txt = rebuilt.join('\n');
        }
      }

      return { ...blk, text: txt.trim() };
    })
    .filter((blk) => {
      if (!blk.text) {
        removedCount++;
        return false;
      }
      return true;
    });

  // Step 2: Merge nearby blocks or fragmented short words ("Minha" + "esperança" + "está em Ti")
  if (options.mergeNearbyBlocks || options.mergeShortLines) {
    const merged: LyricBlock[] = [];
    for (const blk of working) {
      const prev = merged[merged.length - 1];
      if (!prev) {
        merged.push({ ...blk });
        continue;
      }

      const gap = blk.startTime - prev.endTime;
      const prevFlatLen = prev.text.replace(/\n/g, ' ').length;
      const curFlatLen = blk.text.replace(/\n/g, ' ').length;

      const shouldMergeFragment =
        options.mergeShortLines &&
        gap <= 1.2 &&
        (prevFlatLen <= 16 || curFlatLen <= 16) &&
        prevFlatLen + curFlatLen + 1 <= 56;

      const shouldMergeNearby =
        options.mergeNearbyBlocks &&
        gap <= 0.45 &&
        prevFlatLen + curFlatLen + 1 <= 68;

      if (shouldMergeFragment || shouldMergeNearby) {
        const separator = prevFlatLen + curFlatLen <= 38 ? ' ' : '\n';
        prev.text = `${prev.text}${separator}${blk.text}`.trim();
        prev.endTime = blk.endTime;
        mergedCount++;
      } else {
        merged.push({ ...blk });
      }
    }
    working = merged;
  }

  return {
    beforeBlocks: originalBlocks,
    afterBlocks: working,
    removedCount,
    mergedCount
  };
}

// ============================================================================
// EXPORTERS (.LRC, .SRT, .VTT)
// ============================================================================

export function exportProjectToLrc(project: SongProject): string {
  const header = [
    `[ti:${project.title}]`,
    project.artist ? `[ar:${project.artist}]` : null,
    project.album ? `[al:${project.album}]` : null,
    `[by:Lyrics Studio — MediaDeck]`
  ].filter(Boolean);

  const offset = project.globalOffset || 0;
  const body = [...project.blocks]
    .sort((a, b) => a.startTime - b.startTime)
    .map((b) => {
      const effectiveStart = Math.max(0, b.startTime + offset);
      return `[${formatLrcTimestamp(effectiveStart)}]${b.text.replace(/\n/g, ' / ')}`;
    });

  return [...header, '', ...body].join('\n');
}

export function exportProjectToSrt(project: SongProject): string {
  const offset = project.globalOffset || 0;
  return [...project.blocks]
    .sort((a, b) => a.startTime - b.startTime)
    .map((b, idx) => {
      const start = formatFullSubtitleTimestamp(Math.max(0, b.startTime + offset), ',');
      const end = formatFullSubtitleTimestamp(
        Math.max(0.2, b.endTime + offset),
        ','
      );
      return `${idx + 1}\n${start} --> ${end}\n${b.text}`;
    })
    .join('\n\n');
}

export function exportProjectToVtt(project: SongProject): string {
  const offset = project.globalOffset || 0;
  const cues = [...project.blocks]
    .sort((a, b) => a.startTime - b.startTime)
    .map((b) => {
      const start = formatFullSubtitleTimestamp(Math.max(0, b.startTime + offset), '.');
      const end = formatFullSubtitleTimestamp(
        Math.max(0.2, b.endTime + offset),
        '.'
      );
      return `${start} --> ${end}\n${b.text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${cues}`;
}

export function detectAndParseSubtitle(
  rawContent: string,
  formatHint?: SubtitleFormat,
  baseStyle: LyricStyle = DEFAULT_LYRIC_STYLE
): { blocks: LyricBlock[]; format: SubtitleFormat } {
  const trimmed = rawContent.trim();
  if (formatHint === 'srt') {
    return { blocks: parseSrtContent(trimmed, baseStyle), format: 'srt' };
  }
  if (formatHint === 'vtt') {
    return { blocks: parseVttContent(trimmed, baseStyle), format: 'vtt' };
  }
  if (formatHint === 'lrc') {
    return { blocks: parseLrcContent(trimmed, baseStyle), format: 'lrc' };
  }
  if (formatHint === 'txt') {
    return { blocks: parseTxtContent(trimmed, baseStyle, 'stanza'), format: 'txt' };
  }

  if (/^WEBVTT/i.test(trimmed)) {
    return { blocks: parseVttContent(trimmed, baseStyle), format: 'vtt' };
  }
  if (/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(trimmed)) {
    const isVtt = trimmed.includes('.') && !trimmed.includes(',');
    return {
      blocks: isVtt
        ? parseVttContent(trimmed, baseStyle)
        : parseSrtContent(trimmed, baseStyle),
      format: isVtt ? 'vtt' : 'srt'
    };
  }
  if (/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/.test(trimmed)) {
    return { blocks: parseLrcContent(trimmed, baseStyle), format: 'lrc' };
  }
  return { blocks: parseTxtContent(trimmed, baseStyle, 'stanza'), format: 'txt' };
}
