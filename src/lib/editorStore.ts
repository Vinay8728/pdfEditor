'use client';

import { create } from 'zustand';
import type { EditorObject } from './pdf/annotations';
import { uid } from './utils';

export type EditorTool =
  | 'select'
  | 'text'
  | 'image'
  | 'signature'
  | 'draw'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'highlight'
  | 'redact'
  | 'link'
  | 'formfield';

export interface PageGeometry {
  /** Visual page size in points, after the page's own rotation. */
  width: number;
  height: number;
  rotation: number;
}

interface HistoryEntry {
  objects: EditorObject[];
  redactions: RedactionRect[];
}

export interface RedactionRect {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorState {
  // Document
  fileName: string | null;
  bytes: Uint8Array | null;
  password?: string;
  pageCount: number;
  geometry: PageGeometry[];

  // Canvas state
  objects: EditorObject[];
  redactions: RedactionRect[];
  selectedId: string | null;
  activeTool: EditorTool;
  currentPage: number;
  zoom: number;

  // Style defaults the toolbar edits and new objects inherit
  style: {
    color: string;
    fill: string;
    stroke: string;
    strokeWidth: number;
    fontSize: number;
    fontFamily: 'Helvetica' | 'Times' | 'Courier';
    bold: boolean;
    italic: boolean;
    opacity: number;
  };

  // History
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Actions
  setDocument: (input: {
    fileName: string;
    bytes: Uint8Array;
    pageCount: number;
    geometry: PageGeometry[];
    password?: string;
  }) => void;
  closeDocument: () => void;

  setTool: (tool: EditorTool) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setStyle: (patch: Partial<EditorState['style']>) => void;

  addObject: (object: Omit<EditorObject, 'id'> & { id?: string }) => string;
  updateObject: (id: string, patch: Partial<EditorObject>, options?: { commit?: boolean }) => void;
  removeObject: (id: string) => void;
  select: (id: string | null) => void;
  duplicateSelected: () => void;

  addRedaction: (rect: Omit<RedactionRect, 'id'>) => void;
  removeRedaction: (id: string) => void;

  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearAll: () => void;
}

const HISTORY_LIMIT = 60;

function snapshot(state: EditorState): HistoryEntry {
  return { objects: state.objects, redactions: state.redactions };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  fileName: null,
  bytes: null,
  password: undefined,
  pageCount: 0,
  geometry: [],

  objects: [],
  redactions: [],
  selectedId: null,
  activeTool: 'select',
  currentPage: 0,
  zoom: 1,

  style: {
    color: '#111827',
    fill: '#fde047',
    stroke: '#dc2626',
    strokeWidth: 2,
    fontSize: 14,
    fontFamily: 'Helvetica',
    bold: false,
    italic: false,
    opacity: 1,
  },

  past: [],
  future: [],

  setDocument: ({ fileName, bytes, pageCount, geometry, password }) =>
    set({
      fileName,
      bytes,
      pageCount,
      geometry,
      password,
      objects: [],
      redactions: [],
      selectedId: null,
      currentPage: 0,
      past: [],
      future: [],
    }),

  closeDocument: () =>
    set({
      fileName: null,
      bytes: null,
      password: undefined,
      pageCount: 0,
      geometry: [],
      objects: [],
      redactions: [],
      selectedId: null,
      currentPage: 0,
      past: [],
      future: [],
    }),

  setTool: (activeTool) => set({ activeTool, selectedId: activeTool === 'select' ? get().selectedId : null }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.2, zoom)) }),
  setStyle: (patch) => set((state) => ({ style: { ...state.style, ...patch } })),

  addObject: (object) => {
    const id = object.id ?? uid('obj');
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      objects: [...state.objects, { ...object, id } as EditorObject],
      selectedId: id,
    }));
    return id;
  },

  /**
   * `commit: false` is used while dragging — the object updates live but only
   * one history entry is pushed, when the drag ends.
   */
  updateObject: (id, patch, options) => {
    const commit = options?.commit ?? true;
    set((state) => ({
      past: commit ? [...state.past, snapshot(state)].slice(-HISTORY_LIMIT) : state.past,
      future: commit ? [] : state.future,
      objects: state.objects.map((object) =>
        object.id === id ? ({ ...object, ...patch } as EditorObject) : object,
      ),
    }));
  },

  removeObject: (id) =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      objects: state.objects.filter((object) => object.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  select: (selectedId) => set({ selectedId }),

  duplicateSelected: () => {
    const { selectedId, objects } = get();
    const original = objects.find((object) => object.id === selectedId);
    if (!original) return;

    const copy = { ...original, id: uid('obj') } as EditorObject;
    if ('x' in copy && 'y' in copy) {
      copy.x += 12;
      copy.y += 12;
    }
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      objects: [...state.objects, copy],
      selectedId: copy.id,
    }));
  },

  addRedaction: (rect) =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      redactions: [...state.redactions, { ...rect, id: uid('red') }],
    })),

  removeRedaction: (id) =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      redactions: state.redactions.filter((rect) => rect.id !== id),
    })),

  commit: () =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
        objects: previous.objects,
        redactions: previous.redactions,
        selectedId: null,
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        objects: next.objects,
        redactions: next.redactions,
        selectedId: null,
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clearAll: () =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      objects: [],
      redactions: [],
      selectedId: null,
    })),
}));
