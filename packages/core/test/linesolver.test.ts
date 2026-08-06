import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_BIT,
  analyzeLine,
  colorBit,
  domainSize,
  fullDomain,
  singletonColor,
} from '../src/index.js';
import { lineDomains } from '../src/crossout.js';
import { cells, clues, colorClues } from './helpers.js';

/** Render an analysis's domains as a readable string for monochrome lines. */
function render(domains: Uint32Array): string {
  return [...domains]
    .map((mask) => {
      if (mask === BACKGROUND_BIT) return 'x';
      if (mask === colorBit(1)) return '#';
      return '?';
    })
    .join('');
}

function analyze(clueList: ReturnType<typeof clues>, notation: string, colors = 2) {
  return analyzeLine(clueList, lineDomains(cells(notation), colors), colors);
}

describe('domain helpers', () => {
  it('counts and identifies singletons', () => {
    expect(domainSize(0)).toBe(0);
    expect(domainSize(fullDomain(1))).toBe(2);
    expect(domainSize(fullDomain(3))).toBe(4);
    expect(singletonColor(colorBit(2))).toBe(2);
    expect(singletonColor(BACKGROUND_BIT)).toBe(0);
    expect(singletonColor(fullDomain(1))).toBe(-1);
    expect(singletonColor(0)).toBe(-1);
  });

  it('refuses more colours than the mask can hold', () => {
    expect(() => fullDomain(31)).toThrow(/too many colours/);
  });

  it('stays an unsigned mask at the top of the palette range', () => {
    // 1 << 31 wraps negative in int32; the mask must not.
    expect(fullDomain(29)).toBe(0x3fffffff);
    expect(fullDomain(30)).toBe(0x7fffffff);
    expect(fullDomain(30)).toBeGreaterThan(0);
    expect(fullDomain(30)).toBe(new Uint32Array([fullDomain(30)])[0]);
    expect(domainSize(fullDomain(30))).toBe(31);
  });
});

describe('line solver — monochrome deductions', () => {
  it('fills a line whose clue spans it entirely', () => {
    const result = analyze(clues(5), '.....');
    expect(result.feasible).toBe(true);
    expect(render(result.domains)).toBe('#####');
  });

  it('leaves an empty line all background', () => {
    const result = analyze(clues(), '.....');
    expect(render(result.domains)).toBe('xxxxx');
  });

  it('finds the classic overlap', () => {
    // A clue of 4 in a line of 5 must cover the middle three cells.
    const result = analyze(clues(4), '.....');
    expect(render(result.domains)).toBe('?###?');
  });

  it('finds overlaps across several clues', () => {
    // 3+1+3 = 7 in 9 cells, so each block has two cells of slack and only its
    // middle cell is forced. Cell 4 stays open: the first block can reach it.
    const result = analyze(clues(3, 3), '.........');
    expect(render(result.domains)).toBe('??#???#??');
  });

  it('forces the separator when the slack is gone', () => {
    const result = analyze(clues(3, 3), '.......');
    expect(render(result.domains)).toBe('###x###');
  });

  it('deduces nothing when the clue is loose', () => {
    const result = analyze(clues(1), '.....');
    expect(render(result.domains)).toBe('?????');
  });

  it('uses the player marks to narrow the line', () => {
    // With cell 0 crossed out, the 4-block can only sit at 1..4.
    const result = analyze(clues(4), 'x....');
    expect(render(result.domains)).toBe('x####');
  });

  it('propagates from a single filled cell', () => {
    const result = analyze(clues(3), '#....');
    expect(render(result.domains)).toBe('###xx');
  });

  it('treats dots as unknown, not as marks', () => {
    expect(render(analyze(clues(3), '?????').domains)).toBe(
      render(analyze(clues(3), '.....').domains),
    );
  });

  it('reports infeasible lines', () => {
    expect(analyze(clues(3), 'xxxxx').feasible).toBe(false);
    expect(analyze(clues(2, 2), '#x#x#').feasible).toBe(false);
    expect(analyze(clues(6), '.....').feasible).toBe(false);
  });

  it('requires a gap between same-colour clues', () => {
    // 1,1 in three cells: only "#x#" works.
    expect(render(analyze(clues(1, 1), '...').domains)).toBe('#x#');
  });
});

describe('line solver — clue start marginals', () => {
  it('pins a clue that can only sit in one place', () => {
    const result = analyze(clues(5), '.....');
    expect([...result.startCount]).toEqual([1]);
    expect([...result.firstStart]).toEqual([0]);
  });

  it('reports every start position of a loose clue', () => {
    const result = analyze(clues(2), '....');
    expect(result.startCount[0]).toBe(3);
    expect(result.firstStart[0]).toBe(0);
  });

  it('separates two identical clues that are individually ambiguous', () => {
    // "1,1" in five cells: the first 1 can start at 0, 1 or 2.
    const result = analyze(clues(1, 1), '.....');
    expect(result.startCount[0]).toBe(3);
    expect(result.startCount[1]).toBe(3);
  });

  it('pins both clues once the board forces them', () => {
    const result = analyze(clues(1, 1), '#x#xx');
    expect([...result.startCount]).toEqual([1, 1]);
    expect([...result.firstStart]).toEqual([0, 2]);
  });

  it('pins only the clue that is actually determined', () => {
    // The first 1 is nailed to cell 0; the second can still sit at 2 or 3.
    const result = analyze(clues(1, 1), '#x..x');
    expect([...result.startCount]).toEqual([1, 2]);
    expect(result.firstStart[0]).toBe(0);
  });
});

describe('line solver — colour', () => {
  it('allows adjacent blocks of different colours with no gap', () => {
    // Colours 1 and 2, clue 2 then 2, in exactly four cells.
    const colors = 3;
    const result = analyzeLine(
      colorClues([2, 1], [2, 2]),
      lineDomains(cells('....'), colors),
      colors,
    );
    expect(result.feasible).toBe(true);
    expect([...result.domains]).toEqual([colorBit(1), colorBit(1), colorBit(2), colorBit(2)]);
  });

  it('still requires a gap between same-colour blocks', () => {
    const colors = 3;
    // 2 of colour 1, then 2 of colour 1, needs 5 cells; 4 is infeasible.
    expect(
      analyzeLine(colorClues([2, 1], [2, 1]), lineDomains(cells('....'), colors), colors).feasible,
    ).toBe(false);
  });

  it('rejects a clue referencing a colour outside the palette', () => {
    expect(() => analyzeLine(colorClues([1, 5]), new Uint32Array(3).fill(7), 3)).toThrow(
      /colour index 5/,
    );
  });

  it('rejects a non-positive clue count', () => {
    expect(() => analyzeLine([{ count: 0, colorIndex: 1 }], new Uint32Array(3).fill(3), 2)).toThrow(
      /non-positive/,
    );
  });
});
