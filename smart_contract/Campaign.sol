// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

struct CampaignParams {
    address creator;
    uint256 goal;
    uint256 durationSeconds;
    address treasury;
    uint8   platformFeeBps;
    string  metadataCid;
    string[] milestoneTitles;
    string[] milestoneDescs;
    uint8[]  milestonePercentages;
}

/**
 * @title Campaign
 * @notice Trustless crowdfunding contract with milestone-based escrow,
 *         backer voting, and automatic refunds.
 * @dev Deployed by CampaignFactory for each campaign.
 */
contract Campaign {
    // ─────────────────────────────────────────────────────────────────────
    //  STRUCTS
    // ─────────────────────────────────────────────────────────────────────

    struct Milestone {
        string  title;
        string  description;
        uint8   percentage;      // % of total funds (must sum to 100)
        uint256 votes_for;
        uint256 votes_against;
        bool    payout_requested;
        bool    payout_released;
        bool    rejected;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────────────────

    address public  creator;
    address public  treasury;        // PlatformTreasury address
    uint256 public  goal;
    uint256 public  deadline;
    uint256 public  totalContributed;
    uint8   public  platformFeeBps;  // basis points (250 = 2.5%)
    bool    public  goalReached;
    bool    public  cancelled;
    string  public  metadataCid;     // IPFS CID for title/desc/image

    Milestone[] public milestones;

    mapping(address => uint256) public contributions;
    mapping(address => bool)    public refunded;

    // milestone index → voter address → voted?
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public backerCount;

    // ─────────────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────────────

    event Contributed(address indexed backer, uint256 amount);
    event MilestonePayoutRequested(uint256 indexed milestoneIndex);
    event Voted(uint256 indexed milestoneIndex, address indexed voter, bool approve);
    event MilestonePayoutReleased(uint256 indexed milestoneIndex, uint256 amount);
    event MilestoneRejected(uint256 indexed milestoneIndex);
    event Refunded(address indexed backer, uint256 amount);
    event CampaignCancelled();
    event UpdatePosted(string ipfsCid);

    // ─────────────────────────────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyCreator() {
        require(msg.sender == creator, "Campaign: only creator");
        _;
    }

    modifier notCancelled() {
        require(!cancelled, "Campaign: cancelled");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────

    constructor(CampaignParams memory params) {
        require(params.creator != address(0),          "Campaign: zero creator");
        require(params.goal > 0,                       "Campaign: zero goal");
        require(params.durationSeconds > 0,            "Campaign: zero duration");
        require(params.milestoneTitles.length > 0,     "Campaign: no milestones");
        require(
            params.milestoneTitles.length == params.milestoneDescs.length &&
            params.milestoneTitles.length == params.milestonePercentages.length,
            "Campaign: milestone arrays length mismatch"
        );

        // Verify percentages sum to 100
        uint256 total = 0;
        for (uint256 i = 0; i < params.milestonePercentages.length; i++) {
            total += params.milestonePercentages[i];
        }
        require(total == 100, "Campaign: percentages must sum to 100");

        creator        = params.creator;
        goal           = params.goal;
        deadline       = block.timestamp + params.durationSeconds;
        treasury       = params.treasury;
        platformFeeBps = params.platformFeeBps;
        metadataCid    = params.metadataCid;

        for (uint256 i = 0; i < params.milestoneTitles.length; i++) {
            milestones.push(Milestone({
                title:            params.milestoneTitles[i],
                description:      params.milestoneDescs[i],
                percentage:       params.milestonePercentages[i],
                votes_for:        0,
                votes_against:    0,
                payout_requested: false,
                payout_released:  false,
                rejected:         false
            }));
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  CORE FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Contribute ETH to this campaign.
     */
    function contribute() external payable notCancelled {
        require(block.timestamp < deadline, "Campaign: deadline passed");
        require(msg.value > 0,             "Campaign: send ETH");

        if (contributions[msg.sender] == 0) {
            backerCount++;
        }
        contributions[msg.sender] += msg.value;
        totalContributed          += msg.value;

        if (totalContributed >= goal) {
            goalReached = true;
        }

        emit Contributed(msg.sender, msg.value);
    }

    /**
     * @notice Creator requests payout for a specific milestone.
     *         Backers then vote to approve or reject.
     * @param _milestoneIndex Index of milestone in the array.
     */
    function requestPayout(uint256 _milestoneIndex) external onlyCreator notCancelled {
        require(block.timestamp >= deadline,        "Campaign: still active");
        require(goalReached,                        "Campaign: goal not met");
        require(_milestoneIndex < milestones.length,"Campaign: invalid index");

        Milestone storage m = milestones[_milestoneIndex];
        require(!m.payout_requested, "Campaign: already requested");
        require(!m.payout_released,  "Campaign: already released");
        require(!m.rejected,         "Campaign: was rejected");

        m.payout_requested = true;
        emit MilestonePayoutRequested(_milestoneIndex);
    }

    /**
     * @notice Backers vote to approve or reject a milestone payout.
     * @param _milestoneIndex Milestone to vote on.
     * @param _approve True to approve, false to reject.
     */
    function vote(uint256 _milestoneIndex, bool _approve) external notCancelled {
        require(_milestoneIndex < milestones.length,   "Campaign: invalid index");
        require(contributions[msg.sender] > 0,         "Campaign: not a backer");
        require(!hasVoted[_milestoneIndex][msg.sender],"Campaign: already voted");

        Milestone storage m = milestones[_milestoneIndex];
        require(m.payout_requested, "Campaign: payout not requested");
        require(!m.payout_released, "Campaign: already released");
        require(!m.rejected,        "Campaign: already rejected");

        hasVoted[_milestoneIndex][msg.sender] = true;

        // Weight vote by contribution (token-weighted)
        uint256 weight = contributions[msg.sender];
        if (_approve) {
            m.votes_for += weight;
        } else {
            m.votes_against += weight;
        }

        emit Voted(_milestoneIndex, msg.sender, _approve);

        // Auto-execute if quorum reached (majority of total contributed)
        uint256 quorum = totalContributed / 2;
        if (m.votes_for > quorum) {
            _releasePayout(_milestoneIndex);
        } else if (m.votes_against > quorum) {
            m.rejected = true;
            emit MilestoneRejected(_milestoneIndex);
        }
    }

    /**
     * @notice Internal: release milestone funds to creator minus platform fee.
     */
    function _releasePayout(uint256 _milestoneIndex) internal {
        Milestone storage m = milestones[_milestoneIndex];
        m.payout_released = true;

        uint256 milestoneAmount = (address(this).balance * m.percentage) / 100;

        // Deduct platform fee
        uint256 fee    = (milestoneAmount * platformFeeBps) / 10000;
        uint256 payout = milestoneAmount - fee;

        if (fee > 0 && treasury != address(0)) {
            payable(treasury).transfer(fee);
        }
        payable(creator).transfer(payout);

        emit MilestonePayoutReleased(_milestoneIndex, payout);
    }

    /**
     * @notice Anyone can trigger payout release if votes_for already exceeds quorum.
     *         Useful for finalizing without a new vote tx.
     */
    function finalizePayout(uint256 _milestoneIndex) external notCancelled {
        Milestone storage m = milestones[_milestoneIndex];
        require(m.payout_requested,  "Campaign: not requested");
        require(!m.payout_released,  "Campaign: already released");
        require(!m.rejected,         "Campaign: rejected");

        uint256 quorum = totalContributed / 2;
        require(m.votes_for > quorum, "Campaign: not enough votes");

        _releasePayout(_milestoneIndex);
    }

    /**
     * @notice Backers claim refund if goal not met after deadline,
     *         or if the campaign is cancelled.
     */
    function claimRefund() external {
        require(
            (block.timestamp >= deadline && !goalReached) || cancelled,
            "Campaign: not eligible for refund"
        );
        uint256 amount = contributions[msg.sender];
        require(amount > 0,     "Campaign: nothing to refund");
        require(!refunded[msg.sender], "Campaign: already refunded");

        refunded[msg.sender]  = true;
        contributions[msg.sender] = 0;
        payable(msg.sender).transfer(amount);

        emit Refunded(msg.sender, amount);
    }

    /**
     * @notice Creator can cancel the campaign before deadline (if goal not reached).
     *         Backers may then claim refunds.
     */
    function cancelCampaign() external onlyCreator {
        require(!goalReached,               "Campaign: goal already reached");
        require(block.timestamp < deadline, "Campaign: already ended");
        cancelled = true;
        emit CampaignCancelled();
    }

    /**
     * @notice Creator posts an update (stores IPFS CID on-chain).
     * @param _ipfsCid IPFS content identifier for the update post.
     */
    function postUpdate(string calldata _ipfsCid) external onlyCreator {
        emit UpdatePosted(_ipfsCid);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────

    function getDetails() external view returns (
        address _creator,
        uint256 _goal,
        uint256 _deadline,
        uint256 _totalContributed,
        uint256 _balance,
        bool    _goalReached,
        bool    _cancelled,
        uint256 _backerCount,
        string  memory _metadataCid
    ) {
        return (
            creator,
            goal,
            deadline,
            totalContributed,
            address(this).balance,
            goalReached,
            cancelled,
            backerCount,
            metadataCid
        );
    }

    function getMilestone(uint256 _index) external view returns (
        string memory title,
        string memory description,
        uint8         percentage,
        uint256       votes_for,
        uint256       votes_against,
        bool          payout_requested,
        bool          payout_released,
        bool          rejected
    ) {
        Milestone storage m = milestones[_index];
        return (
            m.title,
            m.description,
            m.percentage,
            m.votes_for,
            m.votes_against,
            m.payout_requested,
            m.payout_released,
            m.rejected
        );
    }

    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getContribution(address _backer) external view returns (uint256) {
        return contributions[_backer];
    }

    function hasBackerVoted(uint256 _milestoneIndex, address _backer) external view returns (bool) {
        return hasVoted[_milestoneIndex][_backer];
    }

    receive() external payable {
        // Allow direct ETH contributions
        if (msg.value > 0 && block.timestamp < deadline && !cancelled) {
            if (contributions[msg.sender] == 0) backerCount++;
            contributions[msg.sender] += msg.value;
            totalContributed          += msg.value;
            if (totalContributed >= goal) goalReached = true;
            emit Contributed(msg.sender, msg.value);
        }
    }
}
