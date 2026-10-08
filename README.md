# payz-rewards

`payz-rewards` contains the Solidity source and local EVM test for the Payz
Rewards Points contract.

## Scope and status

`PayzRewardsPoints` is a non-transferable ERC-20 points ledger with the symbol
`PAYZP`. It is not the PAYZ token, a reward vault, or a complete rewards
program.

The contract records point issuance and redemption requests. It does not
calculate the off-chain pro-rata allocation, transfer a reward asset, deliver a
voucher, or prove that a purchase qualified for points. There is currently no
active points distributor or reward fulfillment service in this repository.
An on-chain redemption event is a request record, not evidence that a reward
was delivered.

The supplied source declares Apache-2.0. The build in this repository pins its
compiler and dependencies; that reproducible build does not, by itself, prove
that this source matches the deployed mainnet bytecode. See
[`deployments/ethereum-mainnet.json`](deployments/ethereum-mainnet.json).

## Contract behavior

- Points use 18 decimals; `POINT_UNIT` is `1e18`.
- `POINTS_PER_USD` is set to 1,000 for the allocation model. It is not a market
  price, cash value, or promise of a USD-denominated payout.
- `MAX_USD_PER_EPOCH` is set to 5, so the contract caps owner-issued
  allocations at 5,000 whole points per UTC-aligned hourly epoch.
- The owner supplies the holder addresses and point amounts to `mintBatch`.
  The contract validates the batch and cap, but does not verify a holder
  snapshot or independently calculate pro-rata shares.
- Ordinary transfers, `transferFrom`, and approvals are disabled.
- The owner configures reward IDs, point costs, and whether each reward is
  enabled.
- `redeem` marks a claim ID and moves the configured points into the contract.
  Those points are escrowed, not burned. The contract contains no refund or
  withdrawal path and does not deliver the configured reward.

## Mainnet deployment reference

The deployed contract is on Ethereum Mainnet (chain ID `1`):

- Contract: [`0xe5940671cb6728f120006c35c067811f5f8864ec`](https://etherscan.io/address/0xe5940671cb6728f120006c35c067811f5f8864ec)
- Creation transaction: [`0x9a6ebf9b6e6d2446e57fff135ef0a8a24e053b602d8f956fa880327eef42a0af`](https://etherscan.io/tx/0x9a6ebf9b6e6d2446e57fff135ef0a8a24e053b602d8f956fa880327eef42a0af)
- Deployment block: `26146293`
- Current `owner()` value observed during the read-only check: `0x18f4939f0e7b8a39faa0afdb205ceb21fa7060c5`

The explorer does not show verified Solidity source for this address. This
repository therefore does **not** claim that its source has been matched to the
deployed bytecode. The deployment manifest records the observed chain details
and verification limitation.

## Compile and test

Requirements: Node.js 20 or newer and pnpm.

```sh
pnpm install
pnpm compile
pnpm test
```

`pnpm test` compiles the contract, starts an in-memory Ganache chain with chain
ID `31337`, and runs the tests in
[`tests/rewards-points.local-evm.test.mjs`](tests/rewards-points.local-evm.test.mjs).
The test does not connect to Ethereum Mainnet or require an RPC URL, wallet,
secret, or private key.

The compile command uses Solidity `0.8.28`, OpenZeppelin Contracts `5.6.1`,
optimizer disabled, and the Shanghai EVM target for compatibility with the
pinned local Ganache EVM. The generated integration ABI is
[`abi/PayzRewardsPoints.json`](abi/PayzRewardsPoints.json); rerun `pnpm compile`
after changing the contract.

## Security and licensing

Read [`SECURITY.md`](SECURITY.md) before relying on points or redemption events.
This contract has not received an independent security audit.

The project source is licensed under Apache-2.0. The pinned OpenZeppelin
Contracts dependency is licensed under MIT; see [`NOTICE`](NOTICE).
