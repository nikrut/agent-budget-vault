import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  parseEther,
  toFunctionSelector,
  type Address,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { compileContracts, type ContractArtifact } from "../src/compile.js";
import { sepoliaL2 } from "../src/network.js";

type ArtifactName =
  | "AgentBudgetVault"
  | "MockCallTarget"
  | "SelectorOnlyValidator"
  | "SwapIntentValidator";
const artifacts = compileContracts() as Record<ArtifactName, ContractArtifact>;
const swapSelector = toFunctionSelector("swapExactIn(address,uint256,uint256,address,uint256)");
const paySelector = toFunctionSelector("pay()");
const revertSelector = toFunctionSelector("alwaysRevert()");

describe("AgentBudgetVault", () => {
  let provider: any;
  let publicClient: any;
  let walletClient: any;
  let ownerAccount: PrivateKeyAccount;
  let agentAccount: PrivateKeyAccount;
  let outsiderAccount: PrivateKeyAccount;
  let owner: Address;
  let agent: Address;
  let outsider: Address;
  let vault: Address;
  let target: Address;
  let swapValidator: Address;
  let selectorValidator: Address;
  let snapshotId: string;

  async function deploy(artifact: ContractArtifact, args: readonly unknown[]): Promise<Address> {
    const hash = await walletClient.deployContract({ account: ownerAccount, abi: artifact.abi, bytecode: artifact.bytecode, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 });
    return receipt.contractAddress!;
  }

  async function write(
    address: Address,
    artifact: ContractArtifact,
    functionName: string,
    args: readonly unknown[],
    account: PrivateKeyAccount = ownerAccount,
  ) {
    const hash = await walletClient.writeContract({ account, address, abi: artifact.abi, functionName, args });
    return publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 });
  }

  async function configure(
    maxValuePerCall = 0n,
    maxValuePerDay = 0n,
    maxCallsPerDay = 5,
    validUntil = 0,
  ) {
    await write(vault, artifacts.AgentBudgetVault, "configureAgent", [agent, {
      maxValuePerCall,
      maxValuePerDay,
      maxCallsPerDay,
      validUntil,
      enabled: true,
    }]);
  }

  async function permit(selector: `0x${string}`, validator = selectorValidator) {
    await write(vault, artifacts.AgentBudgetVault, "setCallPermission", [agent, target, selector, validator]);
  }

  beforeAll(async () => {
    provider = ganache.provider({
      logging: { quiet: true },
      wallet: { totalAccounts: 4, defaultBalance: 1_000 },
      chain: { chainId: sepoliaL2.id },
    });
    const accounts = Object.values(provider.getInitialAccounts()) as Array<{ secretKey: string }>;
    ownerAccount = privateKeyToAccount(accounts[0]!.secretKey as `0x${string}`);
    agentAccount = privateKeyToAccount(accounts[1]!.secretKey as `0x${string}`);
    outsiderAccount = privateKeyToAccount(accounts[2]!.secretKey as `0x${string}`);
    owner = ownerAccount.address;
    agent = agentAccount.address;
    outsider = outsiderAccount.address;
    publicClient = createPublicClient({ chain: sepoliaL2, pollingInterval: 10, transport: custom(provider as any) });
    walletClient = createWalletClient({ account: ownerAccount, chain: sepoliaL2, transport: custom(provider as any) });
    vault = await deploy(artifacts.AgentBudgetVault, [owner]);
    target = await deploy(artifacts.MockCallTarget, []);
    swapValidator = await deploy(artifacts.SwapIntentValidator, [owner, vault, 300]);
    selectorValidator = await deploy(artifacts.SelectorOnlyValidator, []);
    const fundingHash = await walletClient.sendTransaction({ account: ownerAccount, to: vault, value: parseEther("5") });
    await publicClient.waitForTransactionReceipt({ hash: fundingHash, pollingInterval: 10 });
  });

  beforeEach(async () => {
    snapshotId = await provider.request({ method: "evm_snapshot", params: [] }) as string;
  });

  afterEach(async () => {
    await provider.request({ method: "evm_revert", params: [snapshotId] });
  });

  it("executes a validated swap intent and forces proceeds back to the vault", async () => {
    await configure();
    await write(swapValidator, artifacts.SwapIntentValidator, "setMaxAmountIn", [outsider, 1_000n]);
    await permit(swapSelector, swapValidator);
    const block = await publicClient.getBlock();
    const data = encodeFunctionData({
      abi: artifacts.MockCallTarget.abi,
      functionName: "swapExactIn",
      args: [outsider, 500n, 400n, vault, block.timestamp + 60n],
    });
    await write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, data], agentAccount);
    const [recipient, amount, usage] = await Promise.all([
      publicClient.readContract({ address: target, abi: artifacts.MockCallTarget.abi, functionName: "lastRecipient" }),
      publicClient.readContract({ address: target, abi: artifacts.MockCallTarget.abi, functionName: "lastAmountIn" }),
      publicClient.readContract({ address: vault, abi: artifacts.AgentBudgetVault.abi, functionName: "dailyUsage", args: [agent] }),
    ]);
    expect((recipient as string).toLowerCase()).toBe(vault.toLowerCase());
    expect(amount).toBe(500n);
    expect((usage as readonly unknown[])[1]).toBe(1);
  });

  it("rejects unsafe swap calldata", async () => {
    await configure();
    await write(swapValidator, artifacts.SwapIntentValidator, "setMaxAmountIn", [outsider, 1_000n]);
    await permit(swapSelector, swapValidator);
    const block = await publicClient.getBlock();
    for (const args of [
      [outsider, 1_001n, 400n, vault, block.timestamp + 60n],
      [outsider, 500n, 0n, vault, block.timestamp + 60n],
      [outsider, 500n, 400n, outsider, block.timestamp + 60n],
      [outsider, 500n, 400n, vault, block.timestamp + 301n],
    ] as const) {
      const data = encodeFunctionData({ abi: artifacts.MockCallTarget.abi, functionName: "swapExactIn", args });
      await expect(write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, data], agentAccount)).rejects.toThrow();
    }
  });

  it("rejects disabled agents and selectors without an explicit validator", async () => {
    const data = encodeFunctionData({ abi: artifacts.MockCallTarget.abi, functionName: "pay" });
    await expect(
      write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, data], agentAccount),
    ).rejects.toThrow();
    await configure();
    await expect(
      write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, data], agentAccount),
    ).rejects.toThrow();
  });

  it("enforces per-call, daily-value and daily-call budgets", async () => {
    await configure(parseEther("0.6"), parseEther("1"), 2);
    await permit(paySelector);
    const data = encodeFunctionData({ abi: artifacts.MockCallTarget.abi, functionName: "pay" });
    await write(vault, artifacts.AgentBudgetVault, "execute", [target, parseEther("0.5"), data], agentAccount);
    await write(vault, artifacts.AgentBudgetVault, "execute", [target, parseEther("0.5"), data], agentAccount);
    await expect(write(vault, artifacts.AgentBudgetVault, "execute", [target, 1n, data], agentAccount)).rejects.toThrow();
    await expect(write(vault, artifacts.AgentBudgetVault, "execute", [target, parseEther("0.7"), data], agentAccount)).rejects.toThrow();
    const received = await publicClient.readContract({ address: target, abi: artifacts.MockCallTarget.abi, functionName: "receivedValue" });
    expect(received).toBe(parseEther("1"));
  });

  it("rolls usage back when the target call fails", async () => {
    await configure(0n, 0n, 1);
    await permit(revertSelector);
    await permit(paySelector);
    const failing = encodeFunctionData({ abi: artifacts.MockCallTarget.abi, functionName: "alwaysRevert" });
    await expect(write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, failing], agentAccount)).rejects.toThrow();
    const pay = encodeFunctionData({ abi: artifacts.MockCallTarget.abi, functionName: "pay" });
    await write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, pay], agentAccount);
    const usage = await publicClient.readContract({ address: vault, abi: artifacts.AgentBudgetVault.abi, functionName: "dailyUsage", args: [agent] });
    expect((usage as readonly unknown[])[1]).toBe(1);
  });

  it("supports emergency pause and expiring agent authority", async () => {
    const block = await publicClient.getBlock();
    await configure(0n, 0n, 2, Number(block.timestamp + 10n));
    await permit(paySelector);
    const data = encodeFunctionData({ abi: artifacts.MockCallTarget.abi, functionName: "pay" });
    await write(vault, artifacts.AgentBudgetVault, "setPaused", [true]);
    await expect(write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, data], agentAccount)).rejects.toThrow();
    await write(vault, artifacts.AgentBudgetVault, "setPaused", [false]);
    await provider.request({ method: "evm_increaseTime", params: [11] });
    await provider.request({ method: "evm_mine", params: [] });
    await expect(write(vault, artifacts.AgentBudgetVault, "execute", [target, 0n, data], agentAccount)).rejects.toThrow();
  });

  it("restricts administration and uses two-step ownership transfer", async () => {
    await expect(write(vault, artifacts.AgentBudgetVault, "setPaused", [true], outsiderAccount)).rejects.toThrow();
    await write(vault, artifacts.AgentBudgetVault, "transferOwnership", [outsider]);
    await expect(write(vault, artifacts.AgentBudgetVault, "acceptOwnership", [], agentAccount)).rejects.toThrow();
    await write(vault, artifacts.AgentBudgetVault, "acceptOwnership", [], outsiderAccount);
    const newOwner = await publicClient.readContract({ address: vault, abi: artifacts.AgentBudgetVault.abi, functionName: "owner" });
    expect(newOwner).toBe(outsider);
  });

  it("also protects validator ownership with two-step transfer", async () => {
    await write(swapValidator, artifacts.SwapIntentValidator, "transferOwnership", [outsider]);
    await expect(write(swapValidator, artifacts.SwapIntentValidator, "acceptOwnership", [], agentAccount)).rejects.toThrow();
    await write(swapValidator, artifacts.SwapIntentValidator, "acceptOwnership", [], outsiderAccount);
    const newOwner = await publicClient.readContract({
      address: swapValidator,
      abi: artifacts.SwapIntentValidator.abi,
      functionName: "owner",
    });
    expect(newOwner).toBe(outsider);
  });
});
