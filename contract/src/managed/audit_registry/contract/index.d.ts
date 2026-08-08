import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  localSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getEvidence(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { vendorId: Uint8Array,
                                                                            productId: Uint8Array,
                                                                            artifactDigest: Uint8Array,
                                                                            commitId: Uint8Array,
                                                                            generatedAt: bigint,
                                                                            validUntil: bigint,
                                                                            criticals: bigint,
                                                                            highs: bigint,
                                                                            vulnDeps: bigint,
                                                                            lintPassed: boolean,
                                                                            buildPassed: boolean
                                                                          }];
  getSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                        path: { sibling: { field: bigint
                                                                                         },
                                                                                goes_left: boolean
                                                                              }[]
                                                                      }];
}

export type ImpureCircuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  registerPolicy(context: __compactRuntime.CircuitContext<PS>,
                 policyId_0: Uint8Array,
                 policy_0: { version: bigint,
                             issuer: Uint8Array,
                             maxCriticals: bigint,
                             maxHighs: bigint,
                             maxVulnDeps: bigint,
                             requireLint: boolean,
                             requireBuild: boolean,
                             maxAgeSeconds: bigint
                           }): __compactRuntime.CircuitResults<PS, []>;
  proveCompliance(context: __compactRuntime.CircuitContext<PS>,
                  vendorId_0: Uint8Array,
                  productId_0: Uint8Array,
                  artifactDigest_0: Uint8Array,
                  policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  registerPolicy(context: __compactRuntime.CircuitContext<PS>,
                 policyId_0: Uint8Array,
                 policy_0: { version: bigint,
                             issuer: Uint8Array,
                             maxCriticals: bigint,
                             maxHighs: bigint,
                             maxVulnDeps: bigint,
                             requireLint: boolean,
                             requireBuild: boolean,
                             maxAgeSeconds: bigint
                           }): __compactRuntime.CircuitResults<PS, []>;
  proveCompliance(context: __compactRuntime.CircuitContext<PS>,
                  vendorId_0: Uint8Array,
                  productId_0: Uint8Array,
                  artifactDigest_0: Uint8Array,
                  policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
  leafOf(ev_0: { vendorId: Uint8Array,
                 productId: Uint8Array,
                 artifactDigest: Uint8Array,
                 commitId: Uint8Array,
                 generatedAt: bigint,
                 validUntil: bigint,
                 criticals: bigint,
                 highs: bigint,
                 vulnDeps: bigint,
                 lintPassed: boolean,
                 buildPassed: boolean
               },
         salt_0: Uint8Array): Uint8Array;
  nullifierOf(leaf_0: Uint8Array, policyId_0: Uint8Array): Uint8Array;
  recordKeyOf(artifactDigest_0: Uint8Array, policyId_0: Uint8Array): Uint8Array;
  stringIdOf(s_0: Uint8Array): Uint8Array;
  anchorIdOf(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  leafOf(context: __compactRuntime.CircuitContext<PS>,
         ev_0: { vendorId: Uint8Array,
                 productId: Uint8Array,
                 artifactDigest: Uint8Array,
                 commitId: Uint8Array,
                 generatedAt: bigint,
                 validUntil: bigint,
                 criticals: bigint,
                 highs: bigint,
                 vulnDeps: bigint,
                 lintPassed: boolean,
                 buildPassed: boolean
               },
         salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  nullifierOf(context: __compactRuntime.CircuitContext<PS>,
              leaf_0: Uint8Array,
              policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  recordKeyOf(context: __compactRuntime.CircuitContext<PS>,
              artifactDigest_0: Uint8Array,
              policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  stringIdOf(context: __compactRuntime.CircuitContext<PS>, s_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  anchorIdOf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  attest(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  registerPolicy(context: __compactRuntime.CircuitContext<PS>,
                 policyId_0: Uint8Array,
                 policy_0: { version: bigint,
                             issuer: Uint8Array,
                             maxCriticals: bigint,
                             maxHighs: bigint,
                             maxVulnDeps: bigint,
                             requireLint: boolean,
                             requireBuild: boolean,
                             maxAgeSeconds: bigint
                           }): __compactRuntime.CircuitResults<PS, []>;
  proveCompliance(context: __compactRuntime.CircuitContext<PS>,
                  vendorId_0: Uint8Array,
                  productId_0: Uint8Array,
                  artifactDigest_0: Uint8Array,
                  policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  attestations: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  policies: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { version: bigint,
                                 issuer: Uint8Array,
                                 maxCriticals: bigint,
                                 maxHighs: bigint,
                                 maxVulnDeps: bigint,
                                 requireLint: boolean,
                                 requireBuild: boolean,
                                 maxAgeSeconds: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { version: bigint,
  issuer: Uint8Array,
  maxCriticals: bigint,
  maxHighs: bigint,
  maxVulnDeps: bigint,
  requireLint: boolean,
  requireBuild: boolean,
  maxAgeSeconds: bigint
}]>
  };
  claimed: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  records: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { vendorId: Uint8Array,
                                 productId: Uint8Array,
                                 artifactDigest: Uint8Array,
                                 policyId: Uint8Array,
                                 policyVersion: bigint,
                                 provenAt: bigint,
                                 validUntil: bigint,
                                 compliant: boolean
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { vendorId: Uint8Array,
  productId: Uint8Array,
  artifactDigest: Uint8Array,
  policyId: Uint8Array,
  policyVersion: bigint,
  provenAt: bigint,
  validUntil: bigint,
  compliant: boolean
}]>
  };
  history: {
    isEmpty(): boolean;
    length(): bigint;
    head(): { is_some: boolean,
              value: { vendorId: Uint8Array,
                       productId: Uint8Array,
                       artifactDigest: Uint8Array,
                       policyId: Uint8Array,
                       policyVersion: bigint,
                       provenAt: bigint,
                       validUntil: bigint,
                       compliant: boolean
                     }
            };
    [Symbol.iterator](): Iterator<{ vendorId: Uint8Array,
  productId: Uint8Array,
  artifactDigest: Uint8Array,
  policyId: Uint8Array,
  policyVersion: bigint,
  provenAt: bigint,
  validUntil: bigint,
  compliant: boolean
}>
  };
  readonly anchor: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
