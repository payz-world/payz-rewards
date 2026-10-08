// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title payz Rewards Points
/// @notice Non-transferable holder points that can only be moved into this
///         contract as part of a redemption request.
/// @dev The authorized owner supplies off-chain, pro-rata holder allocations.
///      Every hourly epoch is capped on-chain at 5,000 whole points.
///      Redeemed points are escrowed by this contract, not burned.
/// @custom:website https://payz.world
contract PayzRewardsPoints is ERC20, Ownable2Step {
    uint256 public constant POINTS_PER_USD = 1_000;
    uint256 public constant MAX_USD_PER_EPOCH = 5;
    uint256 public constant POINT_UNIT = 1e18;
    uint256 public constant MAX_POINTS_PER_EPOCH =
        MAX_USD_PER_EPOCH * POINTS_PER_USD * POINT_UNIT;
    uint64 public constant EPOCH_DURATION_SECONDS = 1 hours;

    string public constant projectName = "payz";
    string public constant projectWebsite = "https://payz.world";
    string public constant projectLicense = "Apache-2.0";

    mapping(uint64 epoch => uint256 points) public issuedInEpoch;
    mapping(bytes32 rewardId => uint256 points) public rewardCost;
    mapping(bytes32 rewardId => bool enabled) public rewardEnabled;
    mapping(bytes32 claimId => bool processed) public redemptionProcessed;

    bool private _escrowingRedemption;

    error OwnershipRenunciationDisabled();
    error InvalidBatch();
    error InvalidHolder(address holder);
    error InvalidPointAmount();
    error WrongEpoch(uint64 supplied, uint64 current);
    error EpochIssuanceCapExceeded(uint64 epoch, uint256 attemptedTotal);
    error PointsNotTransferable();
    error InvalidReward();
    error InvalidClaimId();
    error RedemptionAlreadyProcessed(bytes32 claimId);

    event PointsBatchIssued(
        uint64 indexed epoch,
        address indexed operator,
        uint256 points,
        uint256 holderCount
    );
    event RewardConfigured(
        bytes32 indexed rewardId,
        uint256 points,
        bool enabled
    );
    event RewardRedemptionRequested(
        address indexed holder,
        bytes32 indexed rewardId,
        bytes32 indexed claimId,
        uint256 pointsEscrowed
    );

    constructor(address platformWallet)
        ERC20("Payz Rewards Points", "PAYZP")
        Ownable(platformWallet)
    {
    }

    /// @notice Returns the UTC-aligned hourly issuance epoch.
    function epochAt(uint256 timestamp) public pure returns (uint64) {
        return uint64(timestamp / EPOCH_DURATION_SECONDS);
    }

    /// @notice Mints the operator-calculated holder allocations for this hour.
    /// @dev The contract caps the total but cannot independently verify the
    ///      off-chain holder snapshot or pro-rata calculation.
    function mintBatch(
        uint64 epoch,
        address[] calldata holders,
        uint256[] calldata amounts
    ) external onlyOwner {
        uint64 currentEpoch = epochAt(block.timestamp);
        if (epoch != currentEpoch) revert WrongEpoch(epoch, currentEpoch);
        if (holders.length == 0 || holders.length != amounts.length) {
            revert InvalidBatch();
        }

        uint256 batchTotal;
        for (uint256 i; i < holders.length; ++i) {
            address holder = holders[i];
            uint256 amount = amounts[i];
            if (holder == address(0) || holder == address(this)) {
                revert InvalidHolder(holder);
            }
            if (amount == 0) revert InvalidPointAmount();
            batchTotal += amount;
        }

        uint256 attemptedTotal = issuedInEpoch[epoch] + batchTotal;
        if (attemptedTotal > MAX_POINTS_PER_EPOCH) {
            revert EpochIssuanceCapExceeded(epoch, attemptedTotal);
        }
        issuedInEpoch[epoch] = attemptedTotal;

        for (uint256 i; i < holders.length; ++i) {
            _mint(holders[i], amounts[i]);
        }

        emit PointsBatchIssued(epoch, msg.sender, batchTotal, holders.length);
    }

    /// @notice Sets or disables a reward option and its fixed point cost.
    /// @dev Point costs use 18 decimal places, like the ERC-20 balance.
    function configureReward(
        bytes32 rewardId,
        uint256 points,
        bool enabled
    ) external onlyOwner {
        if (rewardId == bytes32(0) || (enabled && points == 0)) {
            revert InvalidReward();
        }
        rewardCost[rewardId] = points;
        rewardEnabled[rewardId] = enabled;
        emit RewardConfigured(rewardId, points, enabled);
    }

    /// @notice Escrows the configured point cost and records a one-time claim.
    /// @dev No points are burned. The holder signs this transaction; the
    ///      contract becomes the balance owner so the holder cannot reuse them.
    function redeem(
        bytes32 rewardId,
        bytes32 claimId
    ) external returns (uint256 pointsEscrowed) {
        if (!rewardEnabled[rewardId] || rewardCost[rewardId] == 0) {
            revert InvalidReward();
        }
        if (claimId == bytes32(0)) revert InvalidClaimId();
        if (redemptionProcessed[claimId]) {
            revert RedemptionAlreadyProcessed(claimId);
        }

        pointsEscrowed = rewardCost[rewardId];
        redemptionProcessed[claimId] = true;
        _escrowingRedemption = true;
        _transfer(msg.sender, address(this), pointsEscrowed);
        _escrowingRedemption = false;

        emit RewardRedemptionRequested(
            msg.sender,
            rewardId,
            claimId,
            pointsEscrowed
        );
    }

    /// @dev Ordinary point transfers and allowances are deliberately disabled.
    function transfer(
        address,
        uint256
    ) public pure override returns (bool) {
        revert PointsNotTransferable();
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public pure override returns (bool) {
        revert PointsNotTransferable();
    }

    function approve(
        address,
        uint256
    ) public pure override returns (bool) {
        revert PointsNotTransferable();
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0) && to != address(0)) {
            if (
                !_escrowingRedemption ||
                to != address(this) ||
                from == address(this)
            ) {
                revert PointsNotTransferable();
            }
        }
        super._update(from, to, value);
    }
}
