// The EIP-3668 resolution core: decode the inner ENS query, resolve it against
// the live L2, and sign the response with the trusted signer using the EXACT
// scheme ImmunityL1Resolver verifies.

import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  encodePacked,
  keccak256,
  namehash,
  toHex,
  hexToBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sign as signDigest, serializeSignature } from "viem/accounts";
import { config } from "./config.js";
import { ensRecordAbi } from "./abi.js";
import { readText, readAddr } from "./l2.js";

if (!config.signerPrivateKey) {
  throw new Error("SIGNER_PRIVATE_KEY is required");
}
const account = privateKeyToAccount(config.signerPrivateKey);
export const signerAddress: Address = account.address;

/// Decode a DNS-encoded name (EIP-3668 / ENSIP-10) back to a dotted name.
/// e.g. 0x0a67656e...0365746800 -> "genesis-1.immunity.eth"
export function dnsDecode(dnsName: Hex): string {
  const bytes = hexToBytes(dnsName);
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i];
    if (len === 0) break;
    labels.push(new TextDecoder().decode(bytes.slice(i + 1, i + 1 + len)));
    i += 1 + len;
  }
  return labels.join(".");
}

/// Resolve the inner ENS query against the live L2 and return the ABI-encoded
/// result exactly as the requested function returns it.
async function resolveRecord(name: string, data: Hex): Promise<Hex> {
  const node = namehash(name);
  const decoded = decodeFunctionData({ abi: ensRecordAbi, data });

  switch (decoded.functionName) {
    case "text": {
      const [argNode, key] = decoded.args as [Hex, string];
      assertNode(argNode, node, name);
      const value = await readText(node, key);
      return encodeFunctionResult({
        abi: ensRecordAbi,
        functionName: "text",
        result: value,
      });
    }
    case "addr": {
      // addr(bytes32) — the publisher EOA from the PublisherRegistrar.
      const [argNode] = decoded.args as [Hex, ...unknown[]];
      assertNode(argNode, node, name);
      // Only the legacy ETH addr(bytes32) form is supported; the
      // addr(bytes32,uint256) coin-type form would need bytes-encoding.
      if (decoded.args.length !== 1) {
        throw new Error("addr(bytes32,uint256) coin-type form not supported");
      }
      const publisher = await readAddr(node);
      return encodeFunctionResult({
        abi: ensRecordAbi,
        functionName: "addr",
        result: publisher,
      } as never);
    }
    default:
      throw new Error(`unsupported record function: ${decoded.functionName}`);
  }
}

function assertNode(arg: Hex, expected: Hex, name: string): void {
  if (arg.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `namehash mismatch for ${name}: query node ${arg} != namehash ${expected}`,
    );
  }
}

/// The exact hash ImmunityL1Resolver.makeSignatureHash produces:
///   keccak256(0x1900 ‖ resolver ‖ uint64 expires ‖ keccak256(callData) ‖ keccak256(result))
/// `callData` here is the full abi-encoded IResolverService.resolve(name,data)
/// the client sent — passed through as `request`.
export function makeSignatureHash(
  resolver: Address,
  expires: bigint,
  request: Hex,
  result: Hex,
): Hex {
  return keccak256(
    encodePacked(
      ["bytes2", "address", "uint64", "bytes32", "bytes32"],
      ["0x1900", resolver, expires, keccak256(request), keccak256(result)],
    ),
  );
}

export interface SignedResponse {
  result: Hex;
  expires: bigint;
  sig: Hex;
  /// ABI-encoded (bytes result, uint64 expires, bytes sig) — the EIP-3668
  /// response body the resolveWithProof callback decodes.
  responseData: Hex;
}

/// Full pipeline: given the EIP-3668 `(resolver, callData)` the client sent,
/// resolve + sign.
/// - `resolver` is the L1 resolver address (the OffchainLookup `sender`); the
///   signature is bound to it.
/// - `request` is the full IResolverService.resolve(name, data) calldata.
export async function resolveAndSign(
  resolver: Address,
  request: Hex,
): Promise<SignedResponse> {
  // Decode the inner ENS query the resolver wrapped for us.
  const { args } = decodeFunctionData({
    abi: [
      {
        type: "function",
        name: "resolve",
        stateMutability: "view",
        inputs: [
          { name: "name", type: "bytes" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
      },
    ],
    data: request,
  });
  const [dnsName, data] = args as [Hex, Hex];
  const name = dnsDecode(dnsName);

  const result = await resolveRecord(name, data);
  const expires = BigInt(Math.floor(Date.now() / 1000) + config.ttlSeconds);

  const hash = makeSignatureHash(resolver, expires, request, result);
  // Sign the raw digest (no eth-message prefix) — matches the contract's
  // ECDSA.recover(hash, sig).
  const signature = await signDigest({ hash, privateKey: config.signerPrivateKey! });
  const sig = serializeSignature(signature);

  const responseData = encodeAbiParameters(
    [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    [result, expires, sig],
  );

  return { result, expires, sig, responseData };
}

export { toHex };
