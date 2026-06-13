// EIP-3668 CCIP-Read HTTP server. Implements both transport forms the spec
// allows so any CCIP-aware client (viem, ethers) works:
//   - GET  /{sender}/{data}.json   (durin/template-style)
//   - POST /                       ({ sender, data } JSON body)
//
// Both forward to the same resolve+sign pipeline and return { data } where
// `data` is the ABI-encoded (result, expires, sig) tuple.

import express, { type Request, type Response } from "express";
import { getAddress, isHex, type Address, type Hex } from "viem";
import { resolveAndSign, signerAddress } from "./resolve.js";

async function handle(sender: string, data: string, res: Response): Promise<void> {
  let resolver: Address;
  try {
    resolver = getAddress(sender);
  } catch {
    res.status(400).json({ message: `invalid sender: ${sender}` });
    return;
  }
  if (!isHex(data)) {
    res.status(400).json({ message: `invalid data: ${data}` });
    return;
  }
  try {
    const { responseData } = await resolveAndSign(resolver, data as Hex);
    // 300s browser/client cache hint mirrors the signature TTL.
    res.setHeader("Cache-Control", "max-age=300");
    res.json({ data: responseData });
  } catch (err) {
    // EIP-3668: a 4xx/5xx with a message lets the client surface the failure.
    res.status(400).json({ message: (err as Error).message });
  }
}

export function makeApp() {
  const app = express();

  // CORS: ENS apps (explorer.ens.dev, the manager, wallets) fetch this gateway
  // straight from the browser during CCIP-Read, so allow any origin. It is a
  // read-only, signature-bearing public endpoint — nothing here is origin-gated.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      service: "immunity-ccip-gateway",
      signer: signerAddress,
      info: "EIP-3668 CCIP-Read gateway for *.immunity.eth",
    });
  });

  // POST form: { sender, data }
  app.post("/", async (req: Request, res: Response) => {
    const { sender, data } = req.body ?? {};
    await handle(sender, data, res);
  });

  // GET form: /{sender}/{data}.json
  app.get("/:sender/:data", async (req: Request, res: Response) => {
    const data = req.params.data.replace(/\.json$/, "");
    await handle(req.params.sender, data, res);
  });

  return app;
}
