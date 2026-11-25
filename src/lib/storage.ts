/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SongProject, DEFAULT_LYRIC_STYLE } from '../types/lyrics';

const DB_NAME = 'LyricsStudioDB_v1';
const STORE_NAME = 'projects';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Persist actual media Blobs, never transient object URLs. */
export async function saveProjectToIndexedDb(project: SongProject): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const cleanProject: SongProject = {
      ...project,
      updatedAt: Date.now(),
      sources: project.sources.map(source => ({
        ...source, objectUrl: undefined, isDecodingWaveform: false
      })),
      cover: { ...project.cover, imageUrl: project.cover.blob ? undefined : project.cover.imageUrl },
      background: { ...project.background,
        value: project.background.blob ? '' : project.background.value }
    };
    tx.objectStore(STORE_NAME).put(cleanProject);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function loadAllProjectsFromIndexedDb(): Promise<SongProject[]> {
  try {
    const db = await openDatabase();
    const projects = await new Promise<SongProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as SongProject[]) || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return projects.map(hydrateProjectUrls).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    throw new Error('Não foi possível abrir os projetos locais. Verifique o armazenamento do navegador.');
  }
}

export async function deleteProjectFromIndexedDb(projectId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(projectId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

function hydrateProjectUrls(project: SongProject): SongProject {
  return {
    ...project,
    sources: (project.sources || []).map(source => source.blob instanceof Blob
      ? { ...source, objectUrl: URL.createObjectURL(source.blob), fileMissing: false }
      : { ...source, objectUrl: undefined, fileMissing: true }),
    cover: { ...project.cover, imageUrl: project.cover?.blob instanceof Blob
      ? URL.createObjectURL(project.cover.blob) : project.cover?.imageUrl },
    background: { ...project.background, value: project.background?.blob instanceof Blob
      ? URL.createObjectURL(project.background.blob) : project.background?.value || '#0b1320' }
  };
}

/** New projects start empty; bundled demonstrations never enter real projects. */
export function createBlankSongProject(customTitle = 'Novo Projeto'): SongProject {
  return {
    id: `song-${crypto.randomUUID()}`,
    title: customTitle,
    artist: '', album: '', year: '', category: '', notes: '',
    duration: 180, globalOffset: 0,
    referenceSourceId: null, activePreviewSourceId: null,
    sources: [], blocks: [], defaultStyle: { ...DEFAULT_LYRIC_STYLE },
    safeAreaMargin: 8, showSafeAreaGuide: false,
    useVideoSourceAsBackground: true,
    cover: { gradientFallback: 'linear-gradient(135deg, #1d3557, #457b9d)' },
    background: { type: 'color', value: '#0b1320', overlayDim: 50 },
    updatedAt: Date.now()
  };
}
