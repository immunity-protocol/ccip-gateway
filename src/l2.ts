// Reads records from the live Base Sepolia ImmunityL2Registry (+ the
// PublisherRegistrar for addr). This is the un-forgeable source the gateway
// signs over.

import { createPublicClient, http, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { config } from "./config.js";
import { l2RegistryAbi, publisherRegistrarAbi } from "./abi.js";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(config.l2RpcUrl),
});

/// text(node, key) → the L2 record (the reputation mirror — the headline).
export async function readText(node: Hex, key: string): Promise<string> {
  return (await client.readContract({
    address: config.l2RegistryAddress,
    abi: l2RegistryAbi,
    functionName: "text",
    args: [node, key],
  })) as string;
}

/// addr(node) → the publisher EOA.
///
/// Source order:
///   1. PublisherRegistrar.publisherOf(node) — the publisher EOA. This is the
///      meaningful address: the subname is CONTRACT-owned (anti-flight), so
///      L2Registry.owner(node) is always the registrar contract, not a person.
///   2. Fall back to the zero address if the node is unknown (ENS convention
///      for "no addr record").
export async function readAddr(node: Hex): Promise<Address> {
  const publisher = (await client.readContract({
    address: config.publisherRegistrarAddress,
    abi: publisherRegistrarAbi,
    functionName: "publisherOf",
    args: [node],
  })) as Address;
  return publisher;
}
