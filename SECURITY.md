# Security policy

## Status

Unaudited testnet software. Do not use this vault with mainnet assets or a wallet that has ever held real funds.

## Security boundaries

- The vault, not the strategy process, holds assets.
- Agents can call only configured contract/selector pairs.
- Every allowed pair requires an onchain calldata validator.
- Usage is updated before external calls and rolled back if a call fails.
- All execution and asset-management entry points use a reentrancy guard where external calls occur.
- The owner retains custody powers and must be secured independently.

## Critical configuration rules

- Never use `SelectorOnlyValidator` for ERC-20 approvals, transfers, NFT transfers, arbitrary routers or functions with a user-controlled recipient.
- Keep agent validity periods short and budgets minimal.
- Set token allowances to exact operational amounts and reset them to zero when a session ends.
- Pause the vault before changing multiple interdependent policies.
- Validators are part of the trusted computing base; review them like the vault itself.

## Known limitations

- Daily windows use `block.timestamp / 1 days`, not a rolling 24-hour window.
- Native-value limits do not measure ERC-20 notional value; validators must enforce token amounts.
- A malicious or incorrectly written validator can approve unsafe calldata.
- The owner can withdraw assets and change policies.
- No multisig, timelock, upgrade mechanism or oracle conversion is included.
- No independent smart-contract audit has been performed.

## Key handling

- Use a dedicated test-only wallet.
- Keep `.env` ignored with permissions `0600`.
- Never paste private keys into prompts, issues, logs or screenshots.
- Prefer a hardware-backed or policy wallet before any future production design.

## Reporting

Report non-sensitive issues publicly. Send sensitive details privately to the repository owner without including live secrets.
