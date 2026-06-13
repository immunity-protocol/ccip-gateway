// Minimal ABIs the gateway needs.

// The off-chain resolution service the L1 resolver calls into. The L1 resolver
// encodes `resolve(bytes name, bytes data)` against this selector into the
// EIP-3668 `callData`; the gateway decodes it and returns
// `(bytes result, uint64 expires, bytes sig)`.
export const resolverServiceAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "result", type: "bytes" },
      { name: "expires", type: "uint64" },
      { name: "sig", type: "bytes" },
    ],
  },
] as const;

// The inner ENS record-resolution functions we support (ENSIP-10). The L1
// resolver forwards the original `data` calldata; we decode it against these.
export const ensRecordAbi = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "coinType", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

// Base Sepolia ImmunityL2Registry — the un-forgeable record source.
export const l2RegistryAbi = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// PublisherRegistrar — node → publisher EOA (the clean addr source).
export const publisherRegistrarAbi = [
  {
    type: "function",
    name: "publisherOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
