import { afterEach, describe, expect, it, vi } from 'vitest';

import { PairingAuth } from '../src/auth.js';
import { assertSuccessfulCall, queryTransaction } from '../src/chain/indexer.js';

afterEach(() => vi.unstubAllGlobals());

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

describe('queryTransaction', () => {
  it('queries a Midnight.js transaction identifier through the RegularTransaction fragment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      async json() {
        return {
          data: {
            transactions: [
              {
                __typename: 'RegularTransaction',
                hash: 'ab'.repeat(32),
                transactionResult: { status: 'SUCCESS', segments: null },
                contractActions: [],
              },
            ],
          },
        };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const identifier = `00${'cd'.repeat(32)}`;
    const transaction = await queryTransaction('https://indexer.example/graphql', identifier);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      query: string;
      variables: Record<string, string>;
    };

    expect(transaction?.transactionResult?.status).toBe('SUCCESS');
    expect(request.query).toContain('offset: { identifier: $identifier }');
    expect(request.query).toContain('... on RegularTransaction');
    expect(request.variables).toEqual({ identifier });
  });
});
