// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICallValidator {
    function validateCall(
        address vault,
        address agent,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool);
}
