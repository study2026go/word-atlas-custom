import { useSyncExternalStore } from "react";

/**
 * Step 2 (word-atlas-custom): 书房 (Study Room) data + progress.
 *
 * Data files live under public/read/ and are fetched at runtime, like the
 * atlas index. NOTHING here copies the live site's passages or book text:
 * - public/read/passages.json — 12 ORIGINAL graded passages written for
 *   this app (CC BY 4.0). The live site's 732 passages are not in the
 *   public repo and are not bundled.
 * - public/read/little-prince.json — a SIMPLIFIED RETELLING in the app's
 *   own A2 English (12 chapters), NOT Saint-Exupéry's text and NOT the
 *   Katherine Woods translation. The original book is still under
 *   copyright in the United States until 1 Jan 2039, so its full text is
 *   deliberately not bundled. See DATA_SOURCES.md.
 *
 * Audio: there is NO native recording for any 书房 text. All sentence
 * playback is the device's own speech synthesis, always labelled
 * 设备朗读 — never presented as a native recording.
 */

export interface ReadSentence {
  en: string;
  zh: string;
}

export interface PassageQuestion {
  q: string;
  qZh: string;
  answer: "true" | "false" | "not given";
  why: string;
}

export interface Passage {
  id: string;
  level: string;
  title: string;
  titleZh: string;
  topic: string;
  minutes: number;
  sentences: ReadSentence[];
  keywords: string[];
  questions: PassageQuestion[];
}

export interface PassageFile {
  version: number;
  kind: string;
  passages: Passage[];
}

export interface BookChapter {
  n: number;
  title: string;
  titleZh: string;
  keywords: string[];
  sentences: ReadSentence[];
}

export interface BookFile {
  version: number;
  kind: string;
  title: string;
  titleZh: string;
  note: string;
  chapters: BookChapter[];
}

/** BASE_URL is only read inside the loaders, never at module load, so the
 *  pure helpers in this file stay usable under plain node (tests). */
const readUrl = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/read/${p}`;

let passagesPromise: Promise<PassageFile> | null = null;
export function loadPassages(): Promise<PassageFile> {
  if (!passagesPromise)
    passagesPromise = fetch(readUrl("passages.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`短文加载失败（${r.status}）`);
        return r.json() as Promise<PassageFile>;
      })
      .then((f) => {
        if (!Array.isArray(f.passages)) throw new Error("短文数据格式不对。");
        return f;
      });
  return passagesPromise;
}

let bookPromise: Promise<BookFile> | null = null;
export function loadBook(): Promise<BookFile> {
  if (!bookPromise)
    bookPromise = fetch(readUrl("little-prince.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`小王子加载失败（${r.status}）`);
        return r.json() as Promise<BookFile>;
      })
      .then((f) => {
        if (!Array.isArray(f.chapters)) throw new Error("小王子数据格式不对。");
        return f;
      });
  return bookPromise;
}

/* ---------- sentence helpers ---------- */

/** Split pasted text (the user's own book) into sentences. Nothing is
 *  uploaded: the text stays in this browser's localStorage only. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const t = para.trim();
    if (!t) continue;
    const m = t.match(/[^.!?]+[.!?]+["”')\]]?/g);
    if (m) out.push(...m.map((s) => s.trim()).filter(Boolean));
    else out.push(t);
  }
  return out;
}

export function estimateMinutes(sentences: ReadSentence[] | string[]): number {
  const words = sentences.reduce((n, s) => n + (typeof s === "string" ? s : s.en).split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 110));
}

/** Dictation comparison: ignore case, punctuation and extra spaces. */
export function normalizeDictation(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()\-—]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreTFNG(questions: PassageQuestion[], answers: Record<number, string>): number {
  return questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
}

/* ---------- device reading ---------- */

/** Sentence playback lives in ./read-audio.ts (it imports the audio
 *  module, which needs Vite's import.meta.env). This file stays free of
 *  that import so its pure helpers can run under plain node (tests). */

/* ---------- 书房 progress (localStorage only) ---------- */

export interface ReadPrefs {
  /** Playback speed for sentence reading. */
  rate: 0.8 | 1 | 1.2;
  /** Show Chinese translations under English sentences. */
  bilingual: boolean;
  /** Hide sentence text until it has been listened to. */
  listenFirst: boolean;
  /** Device-reading language: English sentences, or Chinese translations. */
  narration: "en" | "zh";
  /** Font size step for reading: 0 small, 1 normal, 2 large. */
  font: 0 | 1 | 2;
}

export interface PassageState {
  done: boolean;
  answers: Record<string, string>;
  score: number;
}

export interface ReadProgress {
  version: 1;
  passages: Record<string, PassageState>;
  /** Finished Little Prince chapters (chapter numbers). */
  bookDone: number[];
  /** Last sentence index listened to, per chapter ("ch:3" -> index). */
  bookListened: Record<string, number>;
  /** The user's own pasted book (their own legally obtained text). */
  ownBook: { title: string; text: string } | null;
  prefs: ReadPrefs;
}

export const READ_KEY = "word-atlas:read";
const OWN_BOOK_MAX = 200_000;

const defaultPrefs: ReadPrefs = { rate: 1, bilingual: true, listenFirst: true, narration: "en", font: 1 };

export function emptyReadProgress(): ReadProgress {
  return { version: 1, passages: {}, bookDone: [], bookListened: {}, ownBook: null, prefs: { ...defaultPrefs } };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, lo = -Infinity, hi = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

export function sanitizeReadProgress(v: unknown): ReadProgress {
  const out = emptyReadProgress();
  if (!isObj(v) || v.version !== 1) return out;
  if (isObj(v.passages))
    for (const [k, s] of Object.entries(v.passages)) {
      if (!/^[a-z0-9-]+$/.test(k) || !isObj(s)) continue;
      const answers: Record<string, string> = {};
      if (isObj(s.answers))
        for (const [qi, a] of Object.entries(s.answers))
          if (/^\d+$/.test(qi) && typeof a === "string") answers[qi] = a;
      out.passages[k] = { done: s.done === true, answers, score: num(s.score, 0, 100) ? (s.score as number) : 0 };
    }
  if (Array.isArray(v.bookDone))
    out.bookDone = v.bookDone.filter((n): n is number => num(n, 1, 99)).slice(0, 100);
  if (isObj(v.bookListened))
    for (const [k, n] of Object.entries(v.bookListened))
      if (/^ch:\d+$/.test(k) && num(n, 0, 10000)) out.bookListened[k] = n as number;
  if (isObj(v.ownBook) && typeof v.ownBook.title === "string" && typeof v.ownBook.text === "string")
    out.ownBook = { title: v.ownBook.title.slice(0, 100), text: v.ownBook.text.slice(0, OWN_BOOK_MAX) };
  if (isObj(v.prefs)) {
    const p = v.prefs;
    if (p.rate === 0.8 || p.rate === 1 || p.rate === 1.2) out.prefs.rate = p.rate;
    if (typeof p.bilingual === "boolean") out.prefs.bilingual = p.bilingual;
    if (typeof p.listenFirst === "boolean") out.prefs.listenFirst = p.listenFirst;
    if (p.narration === "en" || p.narration === "zh") out.prefs.narration = p.narration;
    if (p.font === 0 || p.font === 1 || p.font === 2) out.prefs.font = p.font;
  }
  return out;
}

function readStored(): ReadProgress {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? sanitizeReadProgress(JSON.parse(raw)) : emptyReadProgress();
  } catch {
    return emptyReadProgress();
  }
}

let readState: ReadProgress = typeof window === "undefined" ? emptyReadProgress() : readStored();
const readListeners = new Set<() => void>();
const emitRead = () => readListeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== READ_KEY || !e.newValue) return;
    try {
      readState = sanitizeReadProgress(JSON.parse(e.newValue));
      emitRead();
    } catch {
      /* ignore malformed writes */
    }
  });
}

export function useReadProgress<T>(select: (s: ReadProgress) => T): T {
  return useSyncExternalStore(
    (f) => {
      readListeners.add(f);
      return () => readListeners.delete(f);
    },
    () => select(readState),
    () => select(readState),
  );
}

/** Update 书房 progress and save it to localStorage immediately. */
export function updateRead(fn: (p: ReadProgress) => ReadProgress) {
  readState = fn(readState);
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(readState));
  } catch {
    /* storage full or private mode — progress for this session is kept in memory */
  }
  emitRead();
}

export function setReadPrefs(patch: Partial<ReadPrefs>) {
  updateRead((p) => ({ ...p, prefs: { ...p.prefs, ...patch } }));
}
