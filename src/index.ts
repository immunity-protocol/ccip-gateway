import { config } from "./config.js";
import { makeApp } from "./app.js";
import { signerAddress } from "./resolve.js";

const app = makeApp();
app.listen(config.port, () => {
  console.log(`immunity-ccip-gateway listening on :${config.port}`);
  console.log(`  trusted signer address: ${signerAddress}`);
  console.log(`  L2 RPC:                 ${config.l2RpcUrl}`);
  console.log(`  L2Registry:             ${config.l2RegistryAddress}`);
  console.log(`  PublisherRegistrar:     ${config.publisherRegistrarAddress}`);
  console.log(`  signature TTL:          ${config.ttlSeconds}s`);
});
