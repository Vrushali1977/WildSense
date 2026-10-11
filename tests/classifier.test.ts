import { describe, expect, it } from 'vitest';
import { parsePredictions } from '../src/lib/classifier';

describe('classifier output handling', () => {
  it('preserves real labels and finite model scores', () => {
    expect(parsePredictions([{ label: 'red fox', score: 0.74 }, { label: 'wolf', score: 0.2 }])).toEqual([
      { label: 'red fox', score: 0.74 },
      { label: 'wolf', score: 0.2 },
    ]);
  });

  it('clamps scores to the displayable range', () => {
    expect(parsePredictions([{ label: 'oak', score: 1.4 }, { label: 'fern', score: -0.2 }])).toEqual([
      { label: 'oak', score: 1 },
      { label: 'fern', score: 0 },
    ]);
  });

  it('rejects malformed or missing predictions rather than fabricating a result', () => {
    expect(() => parsePredictions(null)).toThrow(/unexpected response/i);
    expect(() => parsePredictions([{ label: 'not a score', score: Number.NaN }])).toThrow(/no usable predictions/i);
  });
});
