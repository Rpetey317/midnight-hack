import { describe, expect, it } from 'vitest';

import { canonicalBytes, canonicalize } from '../canonical.js';
import { evidence } from './helpers.js';

describe('canonicalize', () => {
  it('sorts keys at every depth', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('emits no insignificant whitespace', () => {
    expect(canonicalize({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
  });

  it('preserves array order, which is meaningful', () => {
    expect(canonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  it('is insensitive to the input key order', () => {
    const one = canonicalize({ z: 1, a: 2, m: { y: 3, b: 4 } });
    const two = canonicalize({ a: 2, m: { b: 4, y: 3 }, z: 1 });
    expect(one).toBe(two);
  });

  it('round-trips stably — the property a signature depends on', () => {
    const once = canonicalize(evidence());
    const twice = canonicalize(JSON.parse(once));
    expect(twice).toBe(once);
  });

  it('drops explicitly-undefined properties rather than emitting a hole', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  describe('integers only', () => {
    // The rule that makes coverage percent×100. A float in a signed payload is
    // a signature that verifies on the machine that produced it and nowhere
    // else, because shortest-representation printing differs across languages.
    it('rejects a float', () => {
      expect(() => canonicalize({ coverage: 87.34 })).toThrow(/integers only/);
    });

    it('names the offending path', () => {
      expect(() => canonicalize({ a: { b: [1, 2.5] } })).toThrow(/a\.b\[1\]/);
    });

    it('rejects NaN and Infinity', () => {
      expect(() => canonicalize({ a: Number.NaN })).toThrow(/finite/);
      expect(() => canonicalize({ a: Number.POSITIVE_INFINITY })).toThrow(/finite/);
    });

    it('rejects integers beyond MAX_SAFE_INTEGER', () => {
      expect(() => canonicalize({ a: 2 ** 60 })).toThrow(/MAX_SAFE_INTEGER/);
    });

    it('accepts the real evidence struct, which is integers throughout', () => {
      expect(() => canonicalize(evidence())).not.toThrow();
    });
  });

  it('rejects values with no JSON form', () => {
    expect(() => canonicalize({ a: () => 1 })).toThrow(/no canonical JSON form/);
    expect(() => canonicalize({ a: 1n })).toThrow(/no canonical JSON form/);
  });

  it('canonicalBytes agrees with canonicalize', () => {
    const value = evidence();
    expect(canonicalBytes(value).toString('utf8')).toBe(canonicalize(value));
  });

  it('counts UTF-8 bytes, not UTF-16 units', () => {
    // Relevant because DSSE PAE prefixes the payload with its byte length.
    expect(canonicalBytes({ a: 'é' }).length).toBe(canonicalize({ a: 'é' }).length + 1);
  });
});
