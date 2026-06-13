# immunity-ccip-gateway

EIP-3668 (CCIP-Read) gateway that makes `*.immunity.eth` resolve in any ENS app.
It is the off-chain half of a **signed off-chain resolver** (the ENS
`@ensdomains/offchain-resolver` pattern, ported by hand — no Durin):

```
ENS app → ImmunityL1Resolver.resolve()  (Sepolia)
        ↳ reverts OffchainLookup([this gateway], callData, resolveWithProof)
   CCIP client → GET /{sender}/{data}.json   (this service)
        ↳ decode inner ENS query, read the LIVE Base Sepolia ImmunityL2Registry,
          sign (result, expires) with the trusted signer key
   CCIP client → ImmunityL1Resolver.resolveWithProof(response, extraData)
        ↳ recover signer, require == trustedSigner && expires >= now → returns record
```

The gateway signer is **trusted** (same posture as ENS's reference). The L1
resolver pins only the signer **address**; the key lives here as a secret.
Storage-proof trustlessness (Durin/Unruggable) is a later upgrade.

## What it resolves

Against the live Base Sepolia `ImmunityL2Registry`
(`0xded674AAbCe67B2cFe724c8c50c928830468E0cC`):

- `text(node, key)` → `L2Registry.text(node, key)` — the un-forgeable reputation
  mirror (`immunity.reputation`, `immunity.strikes`, plus `description`,
  `avatar`, etc.). **The headline.**
- `addr(node)` → `PublisherRegistrar.publisherOf(node)`
  (`0x762CF28bE7502CC99B6286076e9b4Fb71EE84002`) — the publisher EOA. The subname
  is contract-owned (anti-flight), so `L2Registry.owner(node)` is always the
  registrar; the meaningful address is the publisher.

`node = namehash(fullSubname)` (e.g. `namehash("genesis-1.immunity.eth")`),
which matches the L2 registry's on-chain node derivation exactly.

## Signing scheme (ENS-reference compatible)

The gateway signs the **raw digest** (no eth-message prefix), and the resolver
recovers with `ECDSA.recover(hash, sig)`:

```
hash = keccak256(
  0x1900 ‖ resolverAddress ‖ uint64 expires
        ‖ keccak256(callData) ‖ keccak256(result)
)
```

`callData` is the full `IResolverService.resolve(name, data)` ABI encoding the
client sent. Response body is `abi.encode(bytes result, uint64 expires, bytes sig)`.

## Transport (EIP-3668)

- `GET  /{sender}/{data}.json` — template form (viem/ethers default).
- `POST /` — JSON `{ sender, data }`.

Both return `{ "data": "0x…" }` (the signed response tuple).

## Run locally

```sh
npm install
SIGNER_PRIVATE_KEY=0x… npm start   # serves on :8787
```

Config (env, all optional except the key) — see `.env.example`:
`SIGNER_PRIVATE_KEY` (required), `L2_RPC_URL`, `L2_REGISTRY_ADDRESS`,
`PUBLISHER_REGISTRAR_ADDRESS`, `TTL_SECONDS`, `PORT`.

## Local end-to-end proof

`scripts/e2e-proof.mjs` deploys `ImmunityL1Resolver` to a local hardhat node,
points it at this gateway (which reads the **live** L2), and resolves a real
subname via CCIP-Read — proving the whole mechanism with no Sepolia ETH:

```sh
# 1. start a local L1 node (in immunity-contracts): npx hardhat node
# 2. start this gateway: SIGNER_PRIVATE_KEY=0x… PORT=8787 npm start
# 3. run the proof:
SIGNER_ADDRESS=0x<gateway signer> node scripts/e2e-proof.mjs
```

Expected: `text("immunity.reputation") = "100"` (live from Base Sepolia L2).

## Deploy to fly.io

```sh
fly launch --no-deploy                          # accept the bundled fly.toml
fly secrets set SIGNER_PRIVATE_KEY=0x…          # the trusted signer key
fly deploy
```

The signer ADDRESS must match the `trustedSigner` pinned in the on-chain
`ImmunityL1Resolver`. Override `L2_RPC_URL` etc. via `fly secrets set` if needed.
