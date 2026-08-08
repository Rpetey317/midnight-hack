import {
  ContractState,
  indexerPublicDataProvider,
  ledger as ledgerSdk,
} from '@zkuat/contract/sdk';

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
}

export async function graphql<T>(
  url: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`zkuat: indexer HTTP ${response.status}`);
  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new Error(`zkuat: indexer ${body.errors.map((error) => error.message).join('; ')}`);
  }
  if (!body.data) throw new Error('zkuat: indexer returned no data');
  return body.data;
}

/** Hosted indexers reject the SDK's explicit offset:null latest-state query. */
export function createPublicDataProvider(indexer: string, indexerWS: string): any {
  const base: any = indexerPublicDataProvider(indexer, indexerWS);
  return {
    ...base,
    async queryContractState(contractAddress: string, config?: unknown) {
      if (config) return base.queryContractState(contractAddress, config);
      const data = await graphql<{ contractAction: { state: string } | null }>(
        indexer,
        `query LatestState($address: HexEncoded!) {
          contractAction(address: $address) { state }
        }`,
        { address: contractAddress },
      );
      return data.contractAction
        ? ContractState.deserialize(fromHex(data.contractAction.state))
        : null;
    },
    async queryZSwapAndContractState(contractAddress: string, config?: unknown) {
      if (config) return base.queryZSwapAndContractState(contractAddress, config);
      const data = await graphql<{
        contractAction: {
          state: string;
          zswapState: string | null;
          transaction?: { block?: { ledgerParameters?: string | null } | null } | null;
        } | null;
      }>(
        indexer,
        `query LatestState($address: HexEncoded!) {
          contractAction(address: $address) {
            state
            zswapState
            transaction { block { ledgerParameters } }
          }
        }`,
        { address: contractAddress },
      );
      const action = data.contractAction;
      if (!action?.zswapState) return null;
      return [
        ledgerSdk.ZswapChainState.deserialize(fromHex(action.zswapState)),
        ContractState.deserialize(fromHex(action.state)),
        action.transaction?.block?.ledgerParameters
          ? ledgerSdk.LedgerParameters.deserialize(fromHex(action.transaction.block.ledgerParameters))
          : ledgerSdk.LedgerParameters.initialParameters(),
      ];
    },
    async queryUnshieldedBalances(contractAddress: string, config?: unknown) {
      if (config) return base.queryUnshieldedBalances(contractAddress, config);
      const data = await graphql<{
        contractAction: { unshieldedBalances?: Array<{ tokenType: string; amount: string }> } | null;
      }>(
        indexer,
        `query LatestBalances($address: HexEncoded!) {
          contractAction(address: $address) {
            ... on ContractDeploy { unshieldedBalances { tokenType amount } }
            ... on ContractCall { unshieldedBalances { tokenType amount } }
            ... on ContractUpdate { unshieldedBalances { tokenType amount } }
          }
        }`,
        { address: contractAddress },
      );
      if (!data.contractAction) return null;
      return (data.contractAction.unshieldedBalances ?? []).map((balance) => ({
        tokenType: balance.tokenType,
        balance: BigInt(balance.amount),
      }));
    },
  };
}

export interface IndexedTransaction {
  hash: string;
  transactionResult?: {
    status?: string;
    segments?: Array<{ success?: boolean }>;
  } | null;
  contractActions?: Array<{
    __typename?: string;
    address?: string;
    entryPoint?: string;
  }>;
}

export async function queryTransaction(
  indexer: string,
  txId: string,
): Promise<IndexedTransaction | null> {
  const data = await graphql<{ transactions: IndexedTransaction[] }>(
    indexer,
    `query Transaction($hash: HexEncoded!) {
      transactions(offset: { hash: $hash }) {
        hash
        transactionResult { status segments { success } }
        contractActions {
          __typename
          address
          ... on ContractCall { entryPoint }
        }
      }
    }`,
    { hash: txId },
  );
  return data.transactions[0] ?? null;
}

export function assertSuccessfulCall(
  transaction: IndexedTransaction,
  contractAddress: string,
  entryPoint: string,
): void {
  const status = transaction.transactionResult?.status;
  const successStatuses = new Set(['SUCCESS', 'SucceedEntirely', 'SUCCEED_ENTIRELY']);
  if (!status || !successStatuses.has(status)) {
    throw new Error(`zkuat: transaction ${transaction.hash} has status ${status ?? 'unknown'}`);
  }
  if (transaction.transactionResult?.segments?.some((segment) => segment.success === false)) {
    throw new Error(`zkuat: transaction ${transaction.hash} contains a failed segment`);
  }
  const matched = transaction.contractActions?.some(
    (action) =>
      action.__typename === 'ContractCall' &&
      action.address?.toLowerCase() === contractAddress.toLowerCase() &&
      action.entryPoint === entryPoint,
  );
  if (!matched) {
    throw new Error(`zkuat: transaction ${transaction.hash} is not ${entryPoint} on the configured contract`);
  }
}
