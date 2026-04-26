import { create } from "zustand";

// ========================
// Types
// ========================

export interface NoteMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface NotepadState {
  notes: NoteMeta[];
  activeNoteId: string | null;
  contents: Record<string, string>;

  // Actions
  setActiveNote(id: string): void;
  createNote(): string;
  deleteNote(id: string): void;
  updateTitle(id: string, title: string): void;
  updateContent(id: string, content: string): void;
  saveToStorage(): void;
  loadFromStorage(): void;
}

// ========================
// Helpers
// ========================

const STORAGE_KEY = "zssh:notepad";

function newId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ========================
// Store
// ========================

export const useNotepadStore = create<NotepadState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  contents: {},

  setActiveNote(id) {
    set({ activeNoteId: id });
  },

  createNote() {
    const id = newId();
    const now = Date.now();
    const note: NoteMeta = {
      id,
      title: `${formatNow()}`,
      createdAt: now,
      updatedAt: now,
    };
    const contents = { ...get().contents, [id]: "" };
    set({
      notes: [note, ...get().notes],
      activeNoteId: id,
      contents,
    });
    // Auto-save
    saveToLocalStorage(get().notes, contents);
    return id;
  },

  deleteNote(id) {
    const notes = get().notes.filter((n) => n.id !== id);
    const contents = { ...get().contents };
    delete contents[id];
    const activeNoteId = get().activeNoteId === id ? (notes[0]?.id ?? null) : get().activeNoteId;
    set({ notes, activeNoteId, contents });
    saveToLocalStorage(notes, contents);
  },

  updateTitle(id, title) {
    const notes = get().notes.map((n) =>
      n.id === id ? { ...n, title, updatedAt: Date.now() } : n,
    );
    set({ notes });
    // Debounced save via timeout
    const state = get();
    saveToLocalStorage(notes, state.contents);
  },

  updateContent(id, content) {
    const contents = { ...get().contents, [id]: content };
    const notes = get().notes.map((n) =>
      n.id === id ? { ...n, updatedAt: Date.now() } : n,
    );
    set({ contents, notes });
    // Auto-save on content change
    saveToLocalStorage(notes, contents);
  },

  saveToStorage() {
    const state = get();
    saveToLocalStorage(state.notes, state.contents);
  },

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Create a default note
        const id = newId();
        const now = Date.now();
        const note: NoteMeta = { id, title: formatNow(), createdAt: now, updatedAt: now };
        set({ notes: [note], activeNoteId: id, contents: { [id]: "" } });
        return;
      }
      const data = JSON.parse(raw);
      const notes: NoteMeta[] = data.notes ?? [];
      const contents: Record<string, string> = data.contents ?? {};
      set({
        notes,
        activeNoteId: notes[0]?.id ?? null,
        contents,
      });
    } catch {
      // Corrupted data, start fresh
      const id = newId();
      const now = Date.now();
      const note: NoteMeta = { id, title: formatNow(), createdAt: now, updatedAt: now };
      set({ notes: [note], activeNoteId: id, contents: { [id]: "" } });
    }
  },
}));

// ========================
// LocalStorage persistence
// ========================

function saveToLocalStorage(notes: NoteMeta[], contents: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes, contents }));
  } catch {
    // Storage quota exceeded - silently fail
  }
}
