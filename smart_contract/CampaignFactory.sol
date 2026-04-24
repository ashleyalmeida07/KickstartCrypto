// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Campaign.sol";

/**
 * @title CampaignFactory
 * @notice Deploys and registers Campaign contracts.
 *         Call getCampaigns() to enumerate all deployed addresses.
 */
contract CampaignFactory {
    // ─────────────────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────────────────

    address public  owner;
    address public  treasury;
    uint8   public  platformFeeBps;   // 250 = 2.5%

    address[] public campaigns;

    // creator address → their campaign addresses
    mapping(address => address[]) public creatorCampaigns;

    // ─────────────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────────────

    event CampaignCreated(
        address indexed campaignAddress,
        address indexed creator,
        uint256 goal,
        uint256 deadline,
        string  metadataCid
    );

    event TreasuryUpdated(address newTreasury);
    event FeeUpdated(uint8 newFeeBps);

    // ─────────────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────

    constructor(address _treasury, uint8 _platformFeeBps) {
        require(_treasury != address(0), "Factory: zero treasury");
        require(_platformFeeBps <= 1000, "Factory: fee too high (max 10%)");
        owner          = msg.sender;
        treasury       = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Factory: not owner");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  CORE
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new Campaign contract.
     * @param _goal              Funding target in wei.
     * @param _durationSeconds   Campaign duration in seconds.
     * @param _metadataCid       IPFS CID pointing to JSON with title/desc/image.
     * @param _milestoneTitles   Array of milestone titles.
     * @param _milestoneDescs    Array of milestone descriptions.
     * @param _milestonePercs    Array of milestone fund percentages (must sum to 100).
     * @return campaignAddress   Address of newly deployed Campaign contract.
     */
    function createCampaign(
        uint256 _goal,
        uint256 _durationSeconds,
        string  calldata _metadataCid,
        string[] calldata _milestoneTitles,
        string[] calldata _milestoneDescs,
        uint8[]  calldata _milestonePercs
    ) external returns (address campaignAddress) {
        CampaignParams memory params = CampaignParams({
            creator: msg.sender,
            goal: _goal,
            durationSeconds: _durationSeconds,
            treasury: treasury,
            platformFeeBps: platformFeeBps,
            metadataCid: _metadataCid,
            milestoneTitles: _milestoneTitles,
            milestoneDescs: _milestoneDescs,
            milestonePercentages: _milestonePercs
        });

        Campaign newCampaign = new Campaign(params);

        campaignAddress = address(newCampaign);
        campaigns.push(campaignAddress);
        creatorCampaigns[msg.sender].push(campaignAddress);

        emit CampaignCreated(
            campaignAddress,
            msg.sender,
            _goal,
            block.timestamp + _durationSeconds,
            _metadataCid
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ADMIN
    // ─────────────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Factory: zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setFee(uint8 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Factory: fee too high");
        platformFeeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Factory: zero address");
        owner = _newOwner;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  VIEW
    // ─────────────────────────────────────────────────────────────────────

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
