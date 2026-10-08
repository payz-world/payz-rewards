# Security notes

## Current limitations

- The contract has not been independently audited.
- The Solidity source shown by this repository has not been verified against
  the deployed Ethereum Mainnet bytecode on Etherscan. The deployment address
  and transaction are recorded in
  [`deployments/ethereum-mainnet.json`](deployments/ethereum-mainnet.json), but
  source-to-bytecode equivalence is not established.
- There is no active off-chain points distributor or reward fulfillment
  service in this repository. An emitted `RewardRedemptionRequested` event
  records a request only; it does not show that a voucher or other reward was
  delivered.
- Redeemed points are held by the contract. The source has no refund,
  withdrawal, or release function for those escrowed points.

## Owner and off-chain calculation assumptions

The contract's `owner()` value was read from Ethereum Mainnet during the
read-only deployment check and was
`0x18f4939f0e7b8a39faa0afdb205ceb21fa7060c5`. The owner can:

- submit holder allocations with `mintBatch`, within the hourly aggregate cap;
- configure reward IDs, point costs, and enabled status; and
- transfer ownership through the two-step ownership flow.

The contract does not prove the accuracy or fairness of an off-chain holder
snapshot or pro-rata calculation. The owner is trusted to submit appropriate
allocations and reward configurations. Disabling ownership renunciation does
not remove these owner privileges.

## Public-chain visibility

Issuance and redemption transactions are public. A redemption exposes the
holder address, reward ID, claim ID, and amount escrowed. Opaque identifiers do
not make the transaction private, and this contract does not provide
anonymity or unlinkability guarantees.

## Reporting

No dedicated security contact is specified in this draft. If the repository is
published, security issues should be reported privately to the project
maintainers rather than posted with exploit details in a public issue.
