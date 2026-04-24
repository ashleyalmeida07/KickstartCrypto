// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Campaign.sol";

/**
 * @title CampaignFactory
 * @notice Deploys Campaign contracts with automatic settlement.
 *         Constructor signature changed: _metadataCid removed (stored off-chain in DB).
 */
contract CampaignFactory {

    // ── State ──────────────────────────────────────────────────────────────────

    address public  owner;
    address public  treasury;
    uint16  public  platformFeeBps; // 250 = 2.5%

    address[] public campaigns;
    mapping(address => address[]) public creatorCampaigns;

    // ── Events ─────────────────────────────────────────────────────────────────

    event CampaignCreated(
        address indexed campaignAddress,
        address indexed creator,
        uint256 goal,
        uint256 deadline
    );
    event TreasuryUpdated(address newTreasury);
    event FeeUpdated(uint16 newFeeBps);

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Factory: not owner");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(address _treasury, uint16 _platformFeeBps) {
        require(_treasury != address(0), "Factory: zero treasury");
        require(_platformFeeBps <= 1000,  "Factory: fee too high (max 10%)");
        owner          = msg.sender;
        treasury       = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ── Core ───────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new auto-settle Campaign.
     * @param _goal            Funding target in wei.
     * @param _durationSeconds Campaign duration in seconds.
     * @param _milestoneTitles Milestone title strings (informational).
     * @param _milestoneDescs  Milestone description strings (informational).
     * @param _milestonePercs  Milestone percentages — must sum to 100.
     * @return campaignAddress Address of the deployed Campaign.
     */
    function createCampaign(
        uint256          _goal,
        uint256          _durationSeconds,
        string[] calldata _milestoneTitles,
        string[] calldata _milestoneDescs,
        uint8[]  calldata _milestonePercs
    ) external returns (address campaignAddress) {
        Campaign c = new Campaign(
            msg.sender,
            treasury,
            _goal,
            _durationSeconds,
            platformFeeBps,
            _milestoneTitles,
            _milestoneDescs,
            _milestonePercs
        );

        campaignAddress = address(c);
        campaigns.push(campaignAddress);
        creatorCampaigns[msg.sender].push(campaignAddress);

        emit CampaignCreated(
            campaignAddress,
            msg.sender,
            _goal,
            block.timestamp + _durationSeconds
        );
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Factory: zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setFee(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Factory: fee too high");
        platformFeeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Factory: zero address");
        owner = _newOwner;
    }

    // ── View ───────────────────────────────────────────────────────────────────

    function getCampaigns() external view returns (address[] memory) {
        return campaigns;
    }

    function getCampaignCount() external view returns (uint256) {
        return campaigns.length;
    }

    function getCampaignsByCreator(address _creator) external view returns (address[] memory) {
        return creatorCampaigns[_creator];
    }
}
