// Local end-to-end CCIP-Read proof (Work Package §E).
//
// Proves the WHOLE mechanism with no Sepolia ETH and no fly:
//   1. Deploy ImmunityL1Resolver to a LOCAL hardhat node (gatewayUrls = local
//      gateway, trustedSigner = the gateway's signer address).
//   2. The gateway runs LOCALLY pointed at the LIVE Base Sepolia L2 (real data).
//   3. Resolve `genesis-1.immunity.eth` text("immunity.reputation") via viem
//      with CCIP-Read enabled:
//        resolve() reverts OffchainLookup → viem calls the gateway →
//        gateway reads the live L2 + signs → viem calls resolveWithProof →
//        the verified live-L2 value comes back.
//
// Env:
//   L1_RPC          local hardhat node RPC (default http://127.0.0.1:8545)
//   GATEWAY_URL     local gateway base (default http://127.0.0.1:8787)
//   SIGNER_ADDRESS  the gateway's trusted signer address (required)
//   DEPLOYER_PK     a funded local key (default hardhat account 0)

import { readFileSync } from "node:fs";
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionResult,
  namehash,
  toHex,
  numberToHex,
  stringToBytes,
  concat,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const L1_RPC = process.env.L1_RPC ?? "http://127.0.0.1:8545";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787";
const SIGNER_ADDRESS = getAddress(process.env.SIGNER_ADDRESS);
// Hardhat node default account 0.
const DEPLOYER_PK =
  process.env.DEPLOYER_PK ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const ARTIFACT = JSON.parse(
  readFileSync(
    new URL(
      "../../immunity-contracts/artifacts/contracts/ImmunityL1Resolver.sol/ImmunityL1Resolver.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const localChain = {
  id: 31337,
  name: "hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [L1_RPC] } },
};

// DNS-encode a name (ENSIP-10): length-prefixed labels, null-terminated.
function dnsEncode(name) {
  const parts = name.split(".").map((l) => {
    const b = stringToBytes(l);
    return concat([numberToHex(b.length, { size: 1 }), toHex(b)]);
  });
  return concat([...parts, "0x00"]);
}

const ensRecordAbi = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
];

async function main() {
  const account = privateKeyToAccount(DEPLOYER_PK);
  const wallet = createWalletClient({ account, chain: localChain, transport: http(L1_RPC) });
  // ccipRead defaults to enabled; be explicit.
  const pub = createPublicClient({ chain: localChain, transport: http(L1_RPC), ccipRead: undefined });

  const gatewayTemplate = `${GATEWAY_URL}/{sender}/{data}.json`;
  console.log("=== Local end-to-end CCIP-Read proof ===");
  console.log(`L1 node:        ${L1_RPC}`);
  console.log(`gateway:        ${gatewayTemplate}  (live Base Sepolia L2 behind it)`);
  console.log(`trusted signer: ${SIGNER_ADDRESS}\n`);

  // 1. Deploy the resolver to the local node.
  const deployHash = await wallet.deployContract({
    abi: ARTIFACT.abi,
    bytecode: ARTIFACT.bytecode,
    args: [[gatewayTemplate], SIGNER_ADDRESS],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const resolver = receipt.contractAddress;
  console.log(`[1] deployed ImmunityL1Resolver → ${resolver}`);

  // sanity: ENSIP-10 + ERC165
  const isExt = await pub.readContract({ address: resolver, abi: ARTIFACT.abi, functionName: "supportsInterface", args: ["0x9061b923"] });
  console.log(`    supportsInterface(IExtendedResolver 0x9061b923) = ${isExt}\n`);

  // 2. Resolve genesis-1.immunity.eth text("immunity.reputation") via CCIP-Read.
  const name = "genesis-1.immunity.eth";
  const node = namehash(name);
  const innerData = encodeFunctionData({ abi: ensRecordAbi, functionName: "text", args: [node, "immunity.reputation"] });
  const dnsName = dnsEncode(name);

  console.log(`[2] resolve("${name}", text(node,"immunity.reputation")) via CCIP-Read…`);
  console.log(`    dnsEncode(name) = ${dnsName}`);
  console.log(`    namehash(name)  = ${node}`);

  // viem follows the OffchainLookup revert -> gateway -> resolveWithProof.
  const wrapped = await pub.readContract({
    address: resolver,
    abi: ARTIFACT.abi,
    functionName: "resolve",
    args: [dnsName, innerData],
  });
  const value = decodeFunctionResult({ abi: ensRecordAbi, functionName: "text", data: wrapped });
  console.log(`\n[3] round trip complete. resolveWithProof verified the signature.`);
  console.log(`    → text("immunity.reputation") = "${value}"  (LIVE from Base Sepolia L2)\n`);

  // Also prove addr(node) → publisher EOA.
  const addrData = encodeFunctionData({ abi: ensRecordAbi, functionName: "addr", args: [node] });
  const wrappedAddr = await pub.readContract({
    address: resolver,
    abi: ARTIFACT.abi,
    functionName: "resolve",
    args: [dnsName, addrData],
  });
  const addr = decodeFunctionResult({ abi: ensRecordAbi, functionName: "addr", data: wrappedAddr });
  console.log(`    → addr(node) = ${addr}  (publisher EOA from PublisherRegistrar)\n`);

  // Second name for good measure.
  const name2 = "genesis-2.immunity.eth";
  const node2 = namehash(name2);
  for (const key of ["immunity.reputation", "immunity.strikes", "description"]) {
    const d = encodeFunctionData({ abi: ensRecordAbi, functionName: "text", args: [node2, key] });
    const w = await pub.readContract({ address: resolver, abi: ARTIFACT.abi, functionName: "resolve", args: [dnsEncode(name2), d] });
    const v = decodeFunctionResult({ abi: ensRecordAbi, functionName: "text", data: w });
    console.log(`    ${name2} text("${key}") = "${v}"`);
  }

  if (value !== "100") {
    throw new Error(`PROOF FAILED: expected "100", got "${value}"`);
  }
  console.log("\n✅ PROOF PASSED — full EIP-3668 round trip returned the live L2 value.");
}

main().catch((e) => {
  console.error("PROOF ERROR:", e.shortMessage ?? e.message ?? e);
  process.exit(1);
});
