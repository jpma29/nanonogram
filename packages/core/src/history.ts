/**
 * Unlimited undo/redo for a puzzle session (RF-GRID-4).
 *
 * The unit of undo is the **stroke**, not the cell: dragging across twelve
 * cells is one entry, so one undo puts the board back where it was before the
 * drag started. `game.ts` groups changes into strokes; this module only stores
 * them.
 *
 * The stack is persisted with the local session but never synchronised
 * (04-modelo-de-datos §4) — it is a device-local convenience, not shared state.
 */

/** One cell's transition within a stroke. */
export interface CellChange {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

/** A group of cell changes applied together, undone together. */
export type Stroke = readonly CellChange[];

/** Serialisable history state. */
export interface HistoryState {
  readonly past: Stroke[];
  readonly future: Stroke[];
}

export class History {
  #past: Stroke[];
  #future: Stroke[];

  constructor(state?: Partial<HistoryState>) {
    this.#past = state?.past ? state.past.map((s) => [...s]) : [];
    this.#future = state?.future ? state.future.map((s) => [...s]) : [];
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  get depth(): number {
    return this.#past.length;
  }

  /**
   * Record a stroke. Empty strokes are dropped — a drag that changed nothing
   * should not cost the player an undo. Recording invalidates the redo branch.
   */
  push(changes: Stroke): void {
    const effective = changes.filter((c) => c.from !== c.to);
    if (effective.length === 0) return;
    this.#past.push(effective);
    this.#future.length = 0;
  }

  /** Pop the last stroke and move it to the redo branch. */
  undo(): Stroke | null {
    const stroke = this.#past.pop();
    if (!stroke) return null;
    this.#future.push(stroke);
    return stroke;
  }

  /** Move the most recently undone stroke back onto the undo stack. */
  redo(): Stroke | null {
    const stroke = this.#future.pop();
    if (!stroke) return null;
    this.#past.push(stroke);
    return stroke;
  }

  clear(): void {
    this.#past.length = 0;
    this.#future.length = 0;
  }

  serialize(): HistoryState {
    return {
      past: this.#past.map((s) => [...s]),
      future: this.#future.map((s) => [...s]),
    };
  }
}

/** Reverse a stroke, for applying an undo. */
export function invertStroke(stroke: Stroke): CellChange[] {
  return stroke.map((c) => ({ index: c.index, from: c.to, to: c.from }));
}
