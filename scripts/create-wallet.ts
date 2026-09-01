import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
const envPath = join(process.cwd(), ".env");
const contents = [
  "# Development-only wallet. Never fund it with mainnet assets.",
  "SEPOLIA_RPC_URL=",
  `DEPLOYER_PRIVATE_KEY=${privateKey}`,
  "",
].join("\n");

try {
  writeFileSync(envPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
} catch (error: any) {
  if (error?.code === "EEXIST") {
    throw new Error(".env already exists; refusing to overwrite a possible wallet secret.");
  }
  throw error;
}

console.log(`Created development wallet ${account.address}`);
console.log("The private key is stored only in the ignored .env file (mode 0600).");
console.log("Set SEPOLIA_RPC_URL to an HTTPS endpoint for chain 84532 before deployment.");
