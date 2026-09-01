// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract MockCallTarget {
    address public lastTokenIn;
    uint256 public lastAmountIn;
    uint256 public lastMinAmountOut;
    address public lastRecipient;
    uint256 public lastDeadline;
    uint256 public receivedValue;

    function swapExactIn(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external returns (uint256) {
        lastTokenIn = tokenIn;
        lastAmountIn = amountIn;
        lastMinAmountOut = minAmountOut;
        lastRecipient = recipient;
        lastDeadline = deadline;
        return minAmountOut;
    }

    function pay() external payable {
        receivedValue += msg.value;
    }

    function alwaysRevert() external pure {
        revert("expected");
    }
}
