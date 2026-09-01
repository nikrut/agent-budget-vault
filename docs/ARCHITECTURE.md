# Architecture

## Execution flow

```text
strategy -> TradeIntent -> offchain risk engine -> agent signer
                                                  |
                                                  v
                                         AgentBudgetVault
                                           |          |
                                     budget check   validator
                                           |          |
                                           +----+-----+
                                                v
                                          approved target
```

The LLM or strategy process proposes intent. Deterministic offchain checks reject obviously invalid work before gas is spent. The vault then provides the final onchain boundary: identity, expiry, call count, native-value budget, selector permission and calldata validation.

## Why validators are mandatory

A selector identifies a function but not whether its arguments are safe. For example, a swap can be allowlisted while still sending proceeds to an attacker. A validator receives the complete call and must approve its semantics before the vault executes it.

`SwapIntentValidator` is the first concrete policy module. It binds proceeds to the vault and constrains token, amount, minimum output and deadline. Additional modules can validate lending, prediction-market or x402 payment calls without expanding the vault core.

## Trust model

- Vault owner: trusted administrator and custodian.
- Agent: untrusted within explicit budgets.
- Validator: trusted policy code.
- Target: untrusted external contract approved for a specific selector.
- Strategy/LLM: untrusted intent producer with no vault owner key.

## Integration with the DEX lab

The owner gives the DEX pool a bounded token allowance, configures `SwapIntentValidator`, then permits only the pool's `swapExactIn` selector. The agent cannot change the recipient away from the vault or exceed the configured input amount and deadline window.
