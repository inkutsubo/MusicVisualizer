import type { LyricCue, LyricDocument, WordToken } from '../types/lyrics';

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const LAST_CUE_TAIL = 5;   // seconds a final cue stays on screen

interface RawWord {
  readonly text: string;
  readonly time: number;   // absolute
}

interface RawCue {
  readonly start: number;
  readonly text: string;
  readonly words: RawWord[];
}

function toSeconds(mm: string, ss: string, frac?: string): number {
  const base = Number(mm) * 60 + Number(ss);
  if (frac === undefined) return base;
  return base + Number(`0.${frac}`);
}

/** Reads one timestamp tag exactly at `index`; returns [seconds, nextIndex] or null. */
function readTag(re: RegExp, text: string, index: number): [number, number] | null {
  re.lastIndex = index;
  const m = re.exec(text);
  if (m === null || m.index !== index) return null;
  return [toSeconds(m[1]!, m[2]!, m[3]), re.lastIndex];
}

function parseLine(line: string): RawCue[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  if (/^\[[a-zA-Z]+:/.test(trimmed)) return [];   // [ar:], [ti:], [offset:] metadata

  const stamps: number[] = [];
  let cursor = 0;
  for (;;) {
    const tag = readTag(TIME_TAG, trimmed, cursor);
    if (tag === null) break;
    stamps.push(tag[0]);
    cursor = tag[1];
  }
  if (stamps.length === 0) return [];

  const body = trimmed.slice(cursor);
  const words: RawWord[] = [];
  let prefix = '';
  let wordTime: number | null = null;
  let lastIndex = 0;

  WORD_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_TAG.exec(body)) !== null) {
    const chunk = body.slice(lastIndex, m.index).trim();
    if (chunk.length > 0) {
      if (wordTime !== null) words.push({ text: chunk, time: wordTime });
      else prefix = prefix.length > 0 ? `${prefix} ${chunk}` : chunk;
    }
    wordTime = toSeconds(m[1]!, m[2]!, m[3]);
    lastIndex = WORD_TAG.lastIndex;
  }
  const tail = body.slice(lastIndex).trim();
  if (tail.length > 0) {
    if (wordTime !== null) words.push({ text: tail, time: wordTime });
    else prefix = prefix.length > 0 ? `${prefix} ${tail}` : tail;
  }

  if (words.length === 0) {
    return prefix.length > 0 ? stamps.map((start) => ({ start, text: prefix, words: [] })) : [];
  }

  const text = prefix.length > 0
    ? `${prefix} ${words.map((w) => w.text).join(' ')}`
    : words.map((w) => w.text).join(' ');

  return stamps.map((start) => ({
    start,
    text,
    words: prefix.length > 0 ? [{ text: prefix, time: start }, ...words] : words,
  }));
}

function splitEvenly(text: string, duration: number): WordToken[] {
  const parts = text.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return [];
  const out: WordToken[] = [];
  for (let i = 0; i < parts.length; i++) {
    out.push({
      text: parts[i]!,
      startTime: (duration * i) / parts.length,
      endTime: (duration * (i + 1)) / parts.length,
    });
  }
  return out;
}

/**
 * Parses standard `[mm:ss.xx]text` and enhanced `[mm:ss.xx]<mm:ss.xx>Word ...` LRC.
 * Multiple leading timestamps duplicate the line at each time. Cues are sorted and their
 * end times are derived from the next cue (final cue gets a 5 s tail).
 */
export function parseLrc(lrcText: string): LyricDocument {
  const raw: RawCue[] = [];
  for (const line of lrcText.split(/\r?\n/)) raw.push(...parseLine(line));
  raw.sort((a, b) => a.start - b.start);

  const cues: LyricCue[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cue = raw[i]!;
    const next = raw[i + 1];
    const end = next !== undefined ? Math.max(next.start, cue.start + 0.1) : cue.start + LAST_CUE_TAIL;
    const duration = end - cue.start;
    let words: WordToken[];
    if (cue.words.length > 0) {
      words = cue.words.map((w, wi) => {
        const rel = Math.min(Math.max(w.time - cue.start, 0), duration);
        const nextAbs = wi + 1 < cue.words.length ? cue.words[wi + 1]!.time : end;
        const relEnd = Math.min(Math.max(nextAbs - cue.start, rel), duration);
        return { text: w.text, startTime: rel, endTime: relEnd };
      });
    } else {
      words = splitEvenly(cue.text, duration);
    }
    cues.push({
      id: `cue-${i}`,
      startTime: cue.start,
      endTime: end,
      text: cue.text,
      words,
      alignment: 'center',
    });
  }

  return { cues };
}

// role: LRC parser — standard and enhanced (A2-style per-word timestamps) into LyricDocument.
// invariants: cues sorted by start; word times relative to their cue; endTime always > startTime;
//             metadata tags ignored; final cue gets a 5 s tail.
// owner milestone: M4
