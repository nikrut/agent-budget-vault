# Agent Budget Vault

An onchain execution boundary for autonomous agents on a Sepolia L2 testnet. The vault holds assets while agents receive narrowly scoped, revocable authority instead of unrestricted wallet access.

The target deployment network is chain ID `84532`. This repository is testnet-only and does not custody production funds.

## What it enforces

- Per-agent enable/disable and optional expiration.
- Maximum native value per call and per UTC day.
- Maximum call count per UTC day.
- Allowlisted target contract and function selector pairs.
- A validator contract for every allowed call.
- Emergency pause and two-step ownership transfer.
- Calldata and return-data hashes in execution events.
- Owner-only token allowances, token rescue and native withdrawal.

## Validator model

Selector allowlists alone are not enough: an allowed swap function can still contain an unsafe recipient, amount or deadline. `AgentBudgetVault` therefore requires a validator contract for each permission.

`SwapIntentValidator` supports the DEX lab signature:

```solidity
swapExactIn(address tokenIn, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline)
```

It enforces an allowlisted input token, maximum input amount, nonzero minimum output, bounded deadline, zero native value and `recipient == vault`.

`SelectorOnlyValidator` is intentionally permissive and should be used only for functions whose arguments cannot move or redirect assets. It exists for simple fixtures and must not be attached to generic token approvals, transfers or arbitrary routers.

## Quick start

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm security:audit
```

The integration suite runs on an isolated in-memory chain configured with chain ID `84532`.

## Deployment

1. Run `pnpm wallet:create` or copy `.env.example` to `.env`.
2. Set an HTTPS `SEPOLIA_RPC_URL` for chain `84532`.
3. Use a dedicated test-only private key and fund it only with test ETH.
4. Run `pnpm deploy:sepolia`.

The deployer verifies the RPC chain ID before signing. Addresses are written to `deployments/sepolia-l2.json`; `.env` remains ignored.

## Safe operating sequence

1. Deploy the vault and a call validator.
2. Transfer only mock/test assets to the vault.
3. Configure validator-specific token and calldata limits.
4. Configure the agent's daily and per-call budget.
5. Allow a specific target, selector and validator combination.
6. Give the agent only the vault address and its own signer.
7. Revoke or pause before changing policy.

See [SECURITY.md](SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT
