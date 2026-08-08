import { describe, expect, it } from 'vitest';

import { PairingAuth } from '../src/auth.js';
import { assertSuccessfulCall } from '../src/chain/indexer.js';

describe('PairingAuth', () => {
  it('issues and validates a bearer token for the displayed code', () => {
    const auth = new PairingAuth('123456');
    const token = auth.pair('123456');
    expect(auth.accepts(`Bearer ${token}`)).toBe(true);
    expect(auth.accepts('Bearer wrong')).toBe(false);
    expect(() => auth.pair('000000')).toThrow('invalid pairing code');
  });
});

describe('assertSuccessfulCall', () => {
  it('accepts only a successful call to the configured entry point', () => {
    expect(() =>
      assertSuccessfulCall(
        {
          hash: 'tx',
          transactionResult: { status: 'SucceedEntirely', segments: [{ success: true }] },
          contractActions: [
            { __typename: 'ContractCall', address: 'abcd', entryPoint: 'proveCompliance' },
          ],
        },
        'abcd',
        'proveCompliance',
      ),
    ).not.toThrow();
  });

  it('rejects a failed or unrelated transaction', () => {
    expect(() =>
      assertSuccessfulCall(
        { hash: 'tx', transactionResult: { status: 'FAILURE' }, contractActions: [] },
        'abcd',
        'proveCompliance',
      ),
    ).toThrow('status');
  });
});
