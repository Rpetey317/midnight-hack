import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export class PairingAuth {
  readonly code: string;
  private readonly tokens = new Set<string>();

  constructor(code?: string) {
    this.code = code ?? String(randomInt(100_000, 1_000_000));
  }

  pair(candidate: string): string {
    const expected = Buffer.from(this.code);
    const actual = Buffer.from(candidate);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('zkuat: invalid pairing code');
    }
    const token = randomBytes(32).toString('hex');
    this.tokens.add(token);
    return token;
  }

  accepts(header: string | undefined): boolean {
    if (!header?.startsWith('Bearer ')) return false;
    return this.tokens.has(header.slice('Bearer '.length));
  }
}
