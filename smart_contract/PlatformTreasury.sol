// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PlatformTreasury
 * @notice Receives platform fees (2.5%) from Campaign contracts.
 *         Owner can withdraw accumulated fees.
 * @dev Deploy this first, then pass its address to CampaignFactory.
 */
contract PlatformTreasury {
    address public owner;
    uint256 public totalCollected;

    event FeeReceived(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previous, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Treasury: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Accept fee payments from Campaign contracts.
     */
    receive() external payable {
        totalCollected += msg.value;
        emit FeeReceived(msg.sender, msg.value);
    }

    /**
     * @notice Owner withdraws accumulated platform fees.
     * @param _amount Amount in wei to withdraw (0 = withdraw all).
     */
    function withdraw(uint256 _amount) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Treasury: empty");

        uint256 toSend = _amount == 0 ? balance : _amount;
        require(toSend <= balance, "Treasury: insufficient balance");

        payable(owner).transfer(toSend);
        emit Withdrawn(owner, toSend);
    }

    /**
     * @notice Transfer ownership of the treasury.
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Treasury: zero address");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    /**
     * @notice View current ETH balance.
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
