// Environment configuration. All overridable; defaults pin the live Base
// Sepolia deployment so the gateway works out of the box for the demo.

import { getAddress, type Address } from "viem";

function envAddr(name: string, fallback: string): Address {
  return getAddress(process.env[name] ?? fallback);
}

export const config = {
  // Base Sepolia RPC the gateway reads the L2 records from. Defaults to the
  // public endpoint; override with L2_RPC_URL for a higher-throughput provider.
  l2RpcUrl: process.env.L2_RPC_URL ?? "https://sepolia.base.org",

  // Live Base Sepolia contracts (chain 84532).
  l2RegistryAddress: envAddr(
    "L2_REGISTRY_ADDRESS",
    "0xded674AAbCe67B2cFe724c8c50c928830468E0cC",
  ),
  publisherRegistrarAddress: envAddr(
    "PUBLISHER_REGISTRAR_ADDRESS",
    "0x762CF28bE7502CC99B6286076e9b4Fb71EE84002",
  ),

  // The trusted signer key. The L1 resolver pins only the ADDRESS; this key is
  // a secret (fly secret / local env). REQUIRED — no default.
  signerPrivateKey: process.env.SIGNER_PRIVATE_KEY as `0x${string}` | undefined,

  // Signature TTL in seconds (how long a signed response stays valid).
  ttlSeconds: parseInt(process.env.TTL_SECONDS ?? "300", 10),

  port: parseInt(process.env.PORT ?? "8787", 10),
};
