// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICallValidator} from "./interfaces/ICallValidator.sol";

contract SelectorOnlyValidator is ICallValidator {
    function validateCall(
        address,
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bool) {
        return true;
    }
}
