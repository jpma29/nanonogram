/**
 * The corpus's cell notation, shared by the generator and the runner (and to be
 * reimplemented in Go). See README.md.
 *
 *   `.`     empty
 *   `-`     cross
 *   `?`     dot
 *   `1`-`9` filled with that palette colour index
 */

import { CROSS, DOT, EMPTY, colorIndexOf, filledCell, isFilled } from '@nanonogram/core';

export function parseLine(notation: string): number[] {
  return [...notation].map((ch, i) => {
    if (ch === '.') return EMPTY;
    if (ch === '-') return CROSS;
    if (ch === '?') return DOT;
    if (ch >= '1' && ch <= '9') return filledCell(ch.charCodeAt(0) - 48);
    throw new Error(`unknown cell character ${JSON.stringify(ch)} at ${i} in ${notation}`);
  });
}

export function formatLine(cells: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < cells.length; i++) {
    const value = cells[i]!;
    if (value === EMPTY) out += '.';
    else if (value === CROSS) out += '-';
    else if (value === DOT) out += '?';
    else if (isFilled(value)) out += String(colorIndexOf(value));
    else throw new Error(`cannot format cell value ${value}`);
  }
  return out;
}

/** A clue as stored in the corpus: colour by index, not by palette key. */
export interface CorpusClue {
  count: number;
  color: number;
}

export function toEngineClues(
  clues: readonly CorpusClue[],
): { count: number; colorIndex: number }[] {
  return clues.map((clue) => ({ count: clue.count, colorIndex: clue.color }));
}

export function fromEngineClues(
  clues: readonly { count: number; colorIndex: number }[],
): CorpusClue[] {
  return clues.map((clue) => ({ count: clue.count, color: clue.colorIndex }));
}
