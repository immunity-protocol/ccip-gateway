// Live CCIP-Read demo for the ENS team.
//
// Resolves Immunity publisher names through the REAL deployed stack:
//   ImmunityL1Resolver (Sepolia) --OffchainLookup--> this gateway (fly)
//     --reads--> ImmunityL2Registry (Base Sepolia) --signs--> resolveWithProof
//
// It calls the resolver's resolve(name, data) directly with CCIP-Read enabled
// (viem follows the EIP-3668 OffchainLookup automatically), so it works even
// though the name's records live on an L2 and are served by our own gateway.
//
// Run:  node scripts/demo.mjs
// Override:  SEPOLIA_RPC=… RESOLVER=… node scripts/demo.mjs
//
// Requires only `viem` (already a dependency).

import {
  createPublicClient,
  http,
  namehash,
  encodeFunctionData,
  decodeFunctionResult,
  toHex,
} from "viem";
import { sepolia } from "viem/chains";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
// ImmunityL1Resolver on Sepolia (the name's resolver; reverts OffchainLookup).
const RESOLVER = process.env.RESOLVER ?? "0xad42167258579733c571c1d41cc7058caac0c9b7";
// The publisher names to resolve (any *.immunity.eth works — wildcard).
const NAMES = (process.env.NAMES ?? "genesis-1.immunity.eth,genesis-2.immunity.eth").split(",");

const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

const resolverAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ type: "bytes" }],
  },
];
const recordAbi = [
  { type: "function", name: "text", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "string" }], outputs: [{ type: "string" }] },
  { type: "function", name: "addr", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] },
];

// DNS-wire encode a name: each label is length-prefixed, terminated by 0x00.
function dnsEncode(name) {
  const out = [];
  for (const label of name.split(".")) {
    const l = new TextEncoder().encode(label);
    out.push(l.length, ...l);
  }
  out.push(0);
  return toHex(new Uint8Array(out));
}

// Resolve one record through the resolver via CCIP-Read.
async function resolve(name, fn, args) {
  const node = namehash(name);
  const inner = encodeFunctionData({ abi: recordAbi, functionName: fn, args: [node, ...args] });
  const res = await client.readContract({
    address: RESOLVER,
    abi: resolverAbi,
    functionName: "resolve",
    args: [dnsEncode(name), inner],
  });
  return decodeFunctionResult({ abi: recordAbi, functionName: fn, data: res });
}

console.log("\n  Immunity x ENS — live CCIP-Read resolution");
console.log("  Sepolia resolver " + RESOLVER);
console.log("  resolving publisher reputation served from Base Sepolia via our gateway\n");

for (const name of NAMES) {
  try {
    const [reputation, strikes, tier, description, address] = await Promise.all([
      resolve(name, "text", ["immunity.reputation"]),
      resolve(name, "text", ["immunity.strikes"]),
      resolve(name, "text", ["immunity.tier"]),
      resolve(name, "text", ["description"]),
      resolve(name, "addr", []),
    ]);
    console.log("  ◈ " + name);
    console.log("      reputation : " + (reputation || "-"));
    console.log("      strikes    : " + (strikes || "-"));
    if (tier) console.log("      tier       : " + tier);
    if (description) console.log("      about      : " + description);
    console.log("      address    : " + address);
    console.log("");
  } catch (e) {
    console.error("  ✗ " + name + "  " + (e.shortMessage ?? e.message));
  }
}

console.log("  Each value above was read from Base Sepolia by the gateway, signed,");
console.log("  and verified on-chain by the Sepolia resolver. No Durin, no indexer.\n");
