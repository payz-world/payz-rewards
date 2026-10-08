import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ganache from "ganache";
import {
  decodeFunctionResult,
  encodeFunctionData,
  toEventSelector,
} from "viem";

const artifactDirectory = fileURLToPath(new URL("../build/", import.meta.url));
const abi = JSON.parse(
  await readFile(`${artifactDirectory}PayzRewardsPoints.abi`, "utf8"),
);
const bytecode = (await readFile(
  `${artifactDirectory}PayzRewardsPoints.bin`,
  "utf8",
)).trim();
const point = 10n ** 18n;
const rewardId = `0x${"a1".repeat(32)}`;
const claimId = `0x${"b2".repeat(32)}`;
const anotherClaimId = `0x${"c3".repeat(32)}`;
const zeroBytes32 = `0x${"00".repeat(32)}`;

test("PayzRewardsPoints caps issuance, blocks peer transfers, and escrows redemptions without burning", async () => {
  const provider = ganache.provider({
    chain: { chainId: 31337, hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { totalAccounts: 4, defaultBalance: 100 },
  });

  const rpc = (method, params = []) => provider.request({ method, params });
  const encode = (functionName, args = []) =>
    encodeFunctionData({ abi, functionName, args });
  const hasRevert = (error) =>
    /revert|vm exception/i.test(
      `${error?.message ?? ""} ${error?.shortMessage ?? ""} ${error?.data ?? ""}`,
    );

  try {
    const accounts = await rpc("eth_accounts");
    const [owner, holder, secondHolder, unauthorized] = accounts;
    assert.ok(owner && holder && secondHolder && unauthorized);

    const deploymentHash = await rpc("eth_sendTransaction", [
      {
        from: owner,
        data: `0x${bytecode}${owner.slice(2).toLowerCase().padStart(64, "0")}`,
        gas: "0x989680",
      },
    ]);
    const deploymentReceipt = await rpc("eth_getTransactionReceipt", [deploymentHash]);
    assert.equal(deploymentReceipt.status, "0x1");
    const contractAddress = deploymentReceipt.contractAddress;
    assert.ok(contractAddress);

    const call = (from, functionName, args = []) =>
      rpc("eth_call", [
        {
          from,
          to: contractAddress,
          data: encode(functionName, args),
        },
        "latest",
      ]);
    const read = async (from, functionName, args = []) =>
      decodeFunctionResult({
        abi,
        functionName,
        data: await call(from, functionName, args),
      });
    const send = async (from, functionName, args = []) => {
      const hash = await rpc("eth_sendTransaction", [
        {
          from,
          to: contractAddress,
          data: encode(functionName, args),
          gas: "0x989680",
        },
      ]);
      return rpc("eth_getTransactionReceipt", [hash]);
    };

    assert.equal(await read(owner, "name"), "Payz Rewards Points");
    assert.equal(await read(owner, "symbol"), "PAYZP");
    assert.equal(await read(owner, "decimals"), 18);
    assert.equal(await read(owner, "POINTS_PER_USD"), 1_000n);
    assert.equal(await read(owner, "MAX_USD_PER_EPOCH"), 5n);
    assert.equal(await read(owner, "EPOCH_DURATION_SECONDS"), 3_600n);
    assert.equal(await read(owner, "MAX_POINTS_PER_EPOCH"), 5_000n * point);

    const latestBlock = await rpc("eth_getBlockByNumber", ["latest", false]);
    const epoch = BigInt(latestBlock.timestamp) / 3_600n;
    const firstAllocation = 3_000n * point;
    const secondAllocation = 2_000n * point;
    const issuanceReceipt = await send(owner, "mintBatch", [
      epoch,
      [holder, secondHolder],
      [firstAllocation, secondAllocation],
    ]);
    assert.equal(issuanceReceipt.status, "0x1");
    assert.equal(await read(owner, "balanceOf", [holder]), firstAllocation);
    assert.equal(await read(owner, "balanceOf", [secondHolder]), secondAllocation);
    assert.equal(await read(owner, "totalSupply"), 5_000n * point);
    assert.equal(await read(owner, "issuedInEpoch", [epoch]), 5_000n * point);

    await assert.rejects(
      call(unauthorized, "mintBatch", [epoch, [unauthorized], [point]]),
      hasRevert,
      "only the platform owner may issue holder points",
    );
    await assert.rejects(
      call(owner, "mintBatch", [epoch, [unauthorized], [point]]),
      hasRevert,
      "total issuance for one epoch cannot exceed 5,000 points",
    );
    await assert.rejects(
      call(holder, "transfer", [secondHolder, point]),
      hasRevert,
      "points cannot be transferred to another holder",
    );
    await assert.rejects(
      call(holder, "approve", [secondHolder, point]),
      hasRevert,
      "points cannot be approved for third-party transfer",
    );

    const redemptionCost = 2_000n * point;
    const configureReceipt = await send(owner, "configureReward", [
      rewardId,
      redemptionCost,
      true,
    ]);
    assert.equal(configureReceipt.status, "0x1");
    const redemptionReceipt = await send(holder, "redeem", [rewardId, claimId]);
    assert.equal(redemptionReceipt.status, "0x1");
    assert.equal(redemptionReceipt.logs.length, 2);
    assert.equal(
      redemptionReceipt.logs[0].topics[0].toLowerCase(),
      toEventSelector("Transfer(address,address,uint256)").toLowerCase(),
    );
    assert.equal(
      redemptionReceipt.logs[1].topics[0].toLowerCase(),
      toEventSelector(
        "RewardRedemptionRequested(address,bytes32,bytes32,uint256)",
      ).toLowerCase(),
    );
    assert.equal(
      redemptionReceipt.logs[1].topics[1].toLowerCase(),
      `0x${holder.slice(2).toLowerCase().padStart(64, "0")}`,
    );
    assert.equal(await read(owner, "balanceOf", [holder]), 1_000n * point);
    assert.equal(await read(owner, "balanceOf", [contractAddress]), redemptionCost);
    assert.equal(await read(owner, "totalSupply"), 5_000n * point);
    assert.equal(await read(owner, "redemptionProcessed", [claimId]), true);

    await assert.rejects(
      call(holder, "redeem", [rewardId, claimId]),
      hasRevert,
      "a claim id can be processed only once",
    );
    await assert.rejects(
      call(holder, "redeem", [rewardId, anotherClaimId]),
      hasRevert,
      "a holder without enough points cannot redeem",
    );
    await assert.rejects(
      call(holder, "redeem", [rewardId, zeroBytes32]),
      hasRevert,
      "a zero claim id is invalid",
    );
    await assert.rejects(
      call(unauthorized, "configureReward", [rewardId, point, true]),
      hasRevert,
      "only the platform owner may configure reward costs",
    );

    await provider.request({ method: "evm_increaseTime", params: [3_601] });
    await provider.request({ method: "evm_mine", params: [] });
    const nextBlock = await rpc("eth_getBlockByNumber", ["latest", false]);
    const nextEpoch = BigInt(nextBlock.timestamp) / 3_600n;
    assert.ok(nextEpoch > epoch);
    const nextEpochReceipt = await send(owner, "mintBatch", [
      nextEpoch,
      [unauthorized],
      [5_000n * point],
    ]);
    assert.equal(nextEpochReceipt.status, "0x1");
    assert.equal(await read(owner, "balanceOf", [unauthorized]), 5_000n * point);

    const disabledReceipt = await send(owner, "configureReward", [
      rewardId,
      redemptionCost,
      false,
    ]);
    assert.equal(disabledReceipt.status, "0x1");
    await assert.rejects(
      call(holder, "redeem", [rewardId, anotherClaimId]),
      hasRevert,
      "disabled rewards cannot be redeemed",
    );
  } finally {
    await provider.disconnect();
  }
});
