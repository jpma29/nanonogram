import { describe, expect, it } from 'vitest';
import { History, invertStroke } from '../src/index.js';

const stroke = (...pairs: [number, number, number][]) =>
  pairs.map(([index, from, to]) => ({ index, from, to }));

describe('History (RF-GRID-4)', () => {
  it('starts empty', () => {
    const history = new History();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('treats a whole stroke as one entry', () => {
    const history = new History();
    history.push(stroke([0, 0, 3], [1, 0, 3], [2, 0, 3]));
    expect(history.depth).toBe(1);
    const undone = history.undo();
    expect(undone).toHaveLength(3);
    expect(history.canUndo).toBe(false);
  });

  it('drops strokes that changed nothing', () => {
    const history = new History();
    history.push(stroke([0, 3, 3]));
    history.push([]);
    expect(history.canUndo).toBe(false);
  });

  it('keeps only the cells a stroke actually changed', () => {
    const history = new History();
    history.push(stroke([0, 0, 3], [1, 3, 3], [2, 0, 3]));
    expect(history.undo()).toEqual(stroke([0, 0, 3], [2, 0, 3]));
  });

  it('is unlimited', () => {
    const history = new History();
    for (let i = 0; i < 5000; i++) history.push(stroke([i, 0, 3]));
    expect(history.depth).toBe(5000);
    for (let i = 0; i < 5000; i++) expect(history.undo()).not.toBeNull();
    expect(history.undo()).toBeNull();
  });

  it('redo follows undo, and a new stroke discards the redo branch', () => {
    const history = new History();
    history.push(stroke([0, 0, 3]));
    history.push(stroke([1, 0, 1]));
    history.undo();
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toEqual(stroke([1, 0, 1]));

    history.undo();
    history.push(stroke([2, 0, 2]));
    expect(history.canRedo).toBe(false);
  });

  it('clears', () => {
    const history = new History();
    history.push(stroke([0, 0, 3]));
    history.undo();
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('round-trips through serialisation', () => {
    const history = new History();
    history.push(stroke([0, 0, 3]));
    history.push(stroke([1, 0, 3]));
    history.undo();

    const restored = new History(history.serialize());
    expect(restored.canUndo).toBe(true);
    expect(restored.canRedo).toBe(true);
    expect(restored.redo()).toEqual(stroke([1, 0, 3]));
  });

  it('serialisation is a deep copy', () => {
    const history = new History();
    history.push(stroke([0, 0, 3]));
    const state = history.serialize();
    state.past.length = 0;
    expect(history.canUndo).toBe(true);
  });
});

describe('invertStroke', () => {
  it('swaps from and to', () => {
    expect(invertStroke(stroke([7, 0, 3]))).toEqual(stroke([7, 3, 0]));
  });
});
