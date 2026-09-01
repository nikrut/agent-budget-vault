// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICallValidator} from "./interfaces/ICallValidator.sol";

contract SwapIntentValidator is ICallValidator {
    error InvalidAddress();
    error InvalidWindow();
    error NotOwner();
    error NotPendingOwner();

    bytes4 public constant SWAP_SELECTOR = bytes4(
        keccak256("swapExactIn(address,uint256,uint256,address,uint256)")
    );

    address public immutable vault;
    address public owner;
    address public pendingOwner;
    uint48 public maxDeadlineWindow;
    mapping(address token => uint256 maxAmountIn) public maxAmountIn;

    event MaxAmountSet(address indexed token, uint256 maxAmountIn);
    event MaxDeadlineWindowSet(uint48 maxDeadlineWindow);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address vault_, uint48 maxDeadlineWindow_) {
        if (owner_ == address(0) || vault_ == address(0)) revert InvalidAddress();
        if (maxDeadlineWindow_ == 0) revert InvalidWindow();
        owner = owner_;
        vault = vault_;
        maxDeadlineWindow = maxDeadlineWindow_;
        emit OwnershipTransferred(address(0), owner_);
        emit MaxDeadlineWindowSet(maxDeadlineWindow_);
    }

    function setMaxAmountIn(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        maxAmountIn[token] = amount;
        emit MaxAmountSet(token, amount);
    }

    function setMaxDeadlineWindow(uint48 window) external onlyOwner {
        if (window == 0) revert InvalidWindow();
        maxDeadlineWindow = window;
        emit MaxDeadlineWindowSet(window);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function validateCall(
        address vault_,
        address,
        address,
        uint256 value,
        bytes calldata data
    ) external view returns (bool) {
        if (msg.sender != vault || vault_ != vault || value != 0 || data.length != 164) return false;
        if (bytes4(data[:4]) != SWAP_SELECTOR) return false;
        (address tokenIn, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline) =
            abi.decode(data[4:], (address, uint256, uint256, address, uint256));
        uint256 limit = maxAmountIn[tokenIn];
        return limit != 0
            && amountIn != 0
            && amountIn <= limit
            && minAmountOut != 0
            && recipient == vault
            && deadline >= block.timestamp
            && deadline <= block.timestamp + maxDeadlineWindow;
    }
}
