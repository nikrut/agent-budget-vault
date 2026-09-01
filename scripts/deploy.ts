import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileContracts } from "../src/compile.js";
import { sepoliaL2 } from "../src/network.js";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte development-only private key.");
}
const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL must contain the HTTPS endpoint for chain 84532.");
if (new URL(rpcUrl).protocol !== "https:") throw new Error("SEPOLIA_RPC_URL must use HTTPS.");

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepoliaL2, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: sepoliaL2, transport: http(rpcUrl) });
const connectedChainId = await publicClient.getChainId();
if (connectedChainId !== sepoliaL2.id) {
  throw new Error(`RPC chain mismatch: expected ${sepoliaL2.id}, received ${connectedChainId}.`);
}
const artifacts = compileContracts();

async function deploy(name: string, args: readonly unknown[]) {
  const artifact = artifacts[name];
  if (!artifact) throw new Error(`Missing artifact: ${name}`);
  const hash = await walletClient.deployContract({ account, abi: artifact.abi, bytecode: artifact.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} deployment did not return an address.`);
  console.log(`${name}: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

const vault = await deploy("AgentBudgetVault", [account.address]);
const swapValidator = await deploy("SwapIntentValidator", [account.address, vault, 300]);
const selectorOnlyValidator = await deploy("SelectorOnlyValidator", []);
const deployment = {
  chainId: sepoliaL2.id,
  deployer: account.address,
  contracts: { vault, swapValidator, selectorOnlyValidator },
  createdAt: new Date().toISOString(),
};
mkdirSync(join(process.cwd(), "deployments"), { recursive: true });
writeFileSync(
  join(process.cwd(), "deployments", "sepolia-l2.json"),
  `${JSON.stringify(deployment, null, 2)}\n`,
);
