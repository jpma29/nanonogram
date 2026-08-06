import { describe, expect, it } from 'vitest';
import { GameClock, formatDuration } from '../src/index.js';
import { ticker } from './helpers.js';

describe('GameClock', () => {
  it('accumulates only while running', () => {
    const t = ticker(1000);
    const clock = new GameClock();
    expect(clock.running).toBe(false);
    expect(clock.activeMs(t.now())).toBe(0);

    clock.resume(t.now());
    t.advance(5000);
    expect(clock.activeMs(t.now())).toBe(5000);

    clock.pause(t.now());
    t.advance(60_000);
    expect(clock.activeMs(t.now())).toBe(5000);

    clock.resume(t.now());
    t.advance(2000);
    expect(clock.activeMs(t.now())).toBe(7000);
  });

  it('survives many pause/resume cycles exactly', () => {
    const t = ticker();
    const clock = new GameClock();
    for (let i = 0; i < 50; i++) {
      clock.resume(t.now());
      t.advance(100);
      clock.pause(t.now());
      t.advance(900); // time spent in the pause menu
    }
    expect(clock.activeMs(t.now())).toBe(5000);
  });

  it('ignores redundant pause and resume calls', () => {
    const t = ticker();
    const clock = new GameClock();
    clock.resume(t.now());
    clock.resume(t.now()); // e.g. focus event racing a visibilitychange
    t.advance(1000);
    clock.pause(t.now());
    clock.pause(t.now());
    t.advance(1000);
    expect(clock.activeMs(t.now())).toBe(1000);
  });

  /**
   * RF-TIME-1: the clock is fed monotonic marks, never wall-clock time. Even so,
   * a tick that goes backwards must not subtract time.
   */
  it('never runs backwards', () => {
    const clock = new GameClock();
    clock.resume(10_000);
    expect(clock.activeMs(5_000)).toBe(0);
    clock.pause(5_000);
    expect(clock.activeMs(99_000)).toBe(0);
  });

  it('keeps penalties separate from active time (RF-TIME-3)', () => {
    const t = ticker();
    const clock = new GameClock();
    clock.resume(t.now());
    t.advance(120_000);
    clock.addPenalty(30_000);
    clock.addPenalty(60_000);
    expect(clock.activeMs(t.now())).toBe(120_000);
    expect(clock.penaltyMs).toBe(90_000);
    expect(clock.totalMs(t.now())).toBe(210_000);
  });

  it('rejects nonsensical penalties and state', () => {
    const clock = new GameClock();
    expect(() => clock.addPenalty(-1)).toThrow(RangeError);
    expect(() => clock.addPenalty(Number.NaN)).toThrow(RangeError);
    expect(() => new GameClock({ activeMs: -1 })).toThrow(RangeError);
  });

  it('serialises the run in progress, not just the accumulator', () => {
    const t = ticker();
    const clock = new GameClock();
    clock.resume(t.now());
    t.advance(4321);
    const state = clock.serialize(t.now());
    expect(state).toEqual({ activeMs: 4321, penaltyMs: 0 });

    const restored = new GameClock(state);
    expect(restored.running).toBe(false);
    expect(restored.activeMs()).toBe(4321);
  });

  it('resets to zero', () => {
    const clock = new GameClock({ activeMs: 500, penaltyMs: 100 });
    clock.reset();
    expect(clock.totalMs()).toBe(0);
    expect(clock.running).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(872_000)).toBe('14:32');
  });

  it('adds an hour field past sixty minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('clamps negatives', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});
