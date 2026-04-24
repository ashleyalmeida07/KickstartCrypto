// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Campaign
 * @notice Simplified crowdfunding with AUTOMATIC settlement.
 *
 *  Flow:
 *   1. Backers call contribute() before deadline.
 *   2. After deadline, anyone calls settle() — ONE transaction handles everything:
 *        - Goal reached  → creator receives funds minus 2.5% platform fee.
 *        - Goal not met  → every backer is refunded in the same call.
 *   3. If a backer's auto-refund failed (e.g. smart-contract wallet gas issue),
 *      they can still call claimRefund() individually.
 *   4. Creator can postUpdate() at any time, or cancel() before deadline.
 *
 *  Milestones are informational only — no voting required.
 */
contract Campaign {

    // ── Structs ────────────────────────────────────────────────────────────────

    struct Milestone {
        string title;
        string description;
        uint8  percentage;  // informational, must sum to 100
        bool   released;    // set true when settle() pays the creator
    }

    // ── State ──────────────────────────────────────────────────────────────────

    address public immutable creator;
    address public immutable treasury;
    uint16  public immutable platformFeeBps; // 250 = 2.5%
    uint256 public immutable goal;
    uint256 public immutable deadline;

    uint256 public totalContributed;
    uint256 public backerCount;
    bool    public goalReached;
    bool    public settled;
    bool    public cancelled;

    Milestone[] public milestones;

    mapping(address => uint256) public contributions;
    address[] private _backerList; // for auto-refund loop in settle()

    // ── Events ─────────────────────────────────────────────────────────────────

    event Contributed(address indexed backer, uint256 amount);
    event Settled(bool goalReached, uint256 totalAmount);
    event CreatorPaid(address indexed creator, uint256 amount, uint256 fee);
    event BackerRefunded(address indexed backer, uint256 amount);
    event Cancelled();
    event UpdatePosted(string data);

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyCreator() {
        require(msg.sender == creator, "Campaign: not creator");
        _;
    }

    modifier notSettled() {
        require(!settled, "Campaign: already settled");
        _;
    }

    modifier notCancelled() {
        require(!cancelled, "Campaign: cancelled");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(
        address          _creator,
        address          _treasury,
        uint256          _goal,
        uint256          _durationSeconds,
        uint16           _platformFeeBps,
        string[] memory  _milestoneTitles,
        string[] memory  _milestoneDescs,
        uint8[]  memory  _milestonePercs
    ) {
        require(_creator  != address(0), "Campaign: zero creator");
        require(_treasury != address(0), "Campaign: zero treasury");
        require(_goal > 0,               "Campaign: zero goal");
        require(_durationSeconds > 0,    "Campaign: zero duration");
        require(
            _milestoneTitles.length > 0 &&
            _milestoneTitles.length == _milestoneDescs.length &&
            _milestoneTitles.length == _milestonePercs.length,
            "Campaign: milestone array mismatch"
        );

        uint256 totalPct;
        for (uint256 i = 0; i < _milestonePercs.length; i++) {
            totalPct += _milestonePercs[i];
            milestones.push(Milestone({
                title:       _milestoneTitles[i],
                description: _milestoneDescs[i],
                percentage:  _milestonePercs[i],
                released:    false
            }));
        }
        require(totalPct == 100, "Campaign: milestones must sum to 100%");

        creator        = _creator;
        treasury       = _treasury;
        goal           = _goal;
        deadline       = block.timestamp + _durationSeconds;
        platformFeeBps = _platformFeeBps;
    }

    // ── Contribute ─────────────────────────────────────────────────────────────

    receive() external payable { _contribute(); }

    function contribute() external payable notSettled notCancelled {
        _contribute();
    }

    function _contribute() internal notSettled notCancelled {
        require(block.timestamp < deadline, "Campaign: deadline passed");
        require(msg.value > 0,              "Campaign: zero contribution");
        require(!goalReached,               "Campaign: goal already reached");

        if (contributions[msg.sender] == 0) {
            _backerList.push(msg.sender);
            backerCount++;
        }
        contributions[msg.sender] += msg.value;
        totalContributed           += msg.value;

        if (totalContributed >= goal) goalReached = true;

        emit Contributed(msg.sender, msg.value);
    }

    // ── Settle — the key function ───────────────────────────────────────────────

    /**
     * @notice Distributes funds after the deadline. Callable by ANYONE.
     *
     *   Goal reached  → sends (totalContributed - 2.5% fee) to creator.
     *                   2.5% fee goes to PlatformTreasury.
     *                   All milestones marked released.
     *
     *   Goal not met  → loops through all backers and refunds each one.
     *                   (Safe for up to ~1 000 backers within Ethereum gas limits.)
     *                   Backers whose transfer fails can still call claimRefund().
     */
    function settle() external notSettled notCancelled {
        require(
            block.timestamp >= deadline || goalReached,
            "Campaign: still active"
        );

        settled = true;
        emit Settled(goalReached, totalContributed);

        if (goalReached) {
            // ── Pay creator ───────────────────────────────────────────────────
            uint256 fee           = (totalContributed * platformFeeBps) / 10_000;
            uint256 creatorAmount = totalContributed - fee;

            // Mark all milestones released for display purposes
            for (uint256 i = 0; i < milestones.length; i++) {
                milestones[i].released = true;
            }

            if (fee > 0) {
                (bool feeSuccess, ) = payable(treasury).call{value: fee}("");
                require(feeSuccess, "Campaign: fee transfer failed");
            }
            (bool creatorSuccess, ) = payable(creator).call{value: creatorAmount}("");
            require(creatorSuccess, "Campaign: creator transfer failed");

            emit CreatorPaid(creator, creatorAmount, fee);

        } else {
            // ── Auto-refund all backers ───────────────────────────────────────
            for (uint256 i = 0; i < _backerList.length; i++) {
                address backer = _backerList[i];
                uint256 amount = contributions[backer];
                if (amount > 0) {
                    contributions[backer] = 0;
                    // Use call{} instead of transfer so failures don't revert
                    // the whole loop (e.g. contract wallet that rejects transfers)
                    (bool ok, ) = payable(backer).call{value: amount}("");
                    if (ok) emit BackerRefunded(backer, amount);
                    // If it fails, backer can call claimRefund() individually
                }
            }
        }
    }

    // ── Fallback refund ────────────────────────────────────────────────────────

    /**
     * @notice Safety valve: if a backer's transfer failed during settle(),
     *         or the campaign was cancelled, they can claim here.
     */
    function claimRefund() external {
        require(
            (settled && !goalReached) ||
            cancelled ||
            (block.timestamp >= deadline && !goalReached),
            "Campaign: not eligible for refund"
        );
        uint256 amount = contributions[msg.sender];
        require(amount > 0, "Campaign: nothing to refund");
        contributions[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Campaign: refund transfer failed");
        emit BackerRefunded(msg.sender, amount);
    }

    // ── Creator actions ────────────────────────────────────────────────────────

    /**
     * @notice Creator can cancel before the deadline; all backers are auto-refunded.
     */
    function cancel() external onlyCreator notSettled notCancelled {
        require(block.timestamp < deadline, "Campaign: already ended - call settle()");
        cancelled = true;
        // Auto-refund all backers immediately
        for (uint256 i = 0; i < _backerList.length; i++) {
            address backer = _backerList[i];
            uint256 amount = contributions[backer];
            if (amount > 0) {
                contributions[backer] = 0;
                (bool ok, ) = payable(backer).call{value: amount}("");
                if (ok) emit BackerRefunded(backer, amount);
            }
        }
        emit Cancelled();
    }

    /**
     * @notice Creator posts a progress update (stored in event logs).
     */
    function postUpdate(string calldata data) external onlyCreator {
        emit UpdatePosted(data);
    }

    // ── View functions ─────────────────────────────────────────────────────────

    function getDetails() external view returns (
        address _creator,
        uint256 _goal,
        uint256 _deadline,
        uint256 _totalContributed,
        uint256 _balance,
        bool    _goalReached,
        bool    _cancelled,
        bool    _settled,
        uint256 _backerCount
    ) {
        return (
            creator,
            goal,
            deadline,
            totalContributed,
            address(this).balance,
            goalReached,
            cancelled,
            settled,
            backerCount
        );
    }

    function getMilestone(uint256 _index) external view returns (
        string memory title,
        string memory description,
        uint8         percentage,
        bool          released
    ) {
        require(_index < milestones.length, "Campaign: invalid index");
        Milestone storage m = milestones[_index];
        return (m.title, m.description, m.percentage, m.released);
    }

    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getBackers() external view returns (address[] memory) {
        return _backerList;
    }
}
