// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICallValidator} from "./interfaces/ICallValidator.sol";
import {IERC20} from "./interfaces/IERC20.sol";

contract AgentBudgetVault {
    error AgentDisabled();
    error AgentExpired();
    error CallFailed();
    error CallLimitExceeded();
    error ForbiddenCall();
    error InvalidAddress();
    error InvalidContract();
    error InvalidPolicy();
    error InvalidSelector();
    error NotOwner();
    error NotPendingOwner();
    error Paused();
    error Reentrancy();
    error TokenOperationFailed();
    error ValueLimitExceeded();

    struct AgentPolicy {
        uint96 maxValuePerCall;
        uint128 maxValuePerDay;
        uint32 maxCallsPerDay;
        uint48 validUntil;
        bool enabled;
    }

    struct DailyUsage {
        uint64 dayIndex;
        uint32 calls;
        uint128 value;
    }

    address public owner;
    address public pendingOwner;
    bool public paused;

    mapping(address agent => AgentPolicy) public agentPolicies;
    mapping(address agent => DailyUsage) public dailyUsage;
    mapping(address agent => mapping(address target => mapping(bytes4 selector => address validator)))
        public callValidators;

    uint256 private unlocked = 1;

    event AgentConfigured(
        address indexed agent,
        uint96 maxValuePerCall,
        uint128 maxValuePerDay,
        uint32 maxCallsPerDay,
        uint48 validUntil,
        bool enabled
    );
    event CallPermissionSet(
        address indexed agent,
        address indexed target,
        bytes4 indexed selector,
        address validator
    );
    event Deposited(address indexed sender, uint256 amount);
    event Executed(
        address indexed agent,
        address indexed target,
        bytes4 indexed selector,
        uint256 value,
        bytes32 calldataHash,
        bytes32 resultHash
    );
    event NativeWithdrawn(address indexed recipient, uint256 amount);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PausedSet(bool paused);
    event TokenAllowanceSet(address indexed token, address indexed spender, uint256 amount);
    event TokenRescued(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert InvalidAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function configureAgent(address agent, AgentPolicy calldata policy) external onlyOwner {
        if (agent == address(0)) revert InvalidAddress();
        if (policy.enabled) {
            if (policy.maxCallsPerDay == 0) revert InvalidPolicy();
            if (policy.maxValuePerDay < policy.maxValuePerCall) revert InvalidPolicy();
            if (policy.validUntil != 0 && policy.validUntil <= block.timestamp) revert InvalidPolicy();
        }
        agentPolicies[agent] = policy;
        emit AgentConfigured(
            agent,
            policy.maxValuePerCall,
            policy.maxValuePerDay,
            policy.maxCallsPerDay,
            policy.validUntil,
            policy.enabled
        );
    }

    function setCallPermission(
        address agent,
        address target,
        bytes4 selector,
        address validator
    ) external onlyOwner {
        if (agent == address(0) || target == address(0)) revert InvalidAddress();
        if (selector == bytes4(0)) revert InvalidSelector();
        if (target.code.length == 0) revert InvalidContract();
        if (validator != address(0) && validator.code.length == 0) revert InvalidContract();
        callValidators[agent][target][selector] = validator;
        emit CallPermissionSet(agent, target, selector, validator);
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external nonReentrant returns (bytes memory result) {
        if (paused) revert Paused();
        AgentPolicy memory policy = agentPolicies[msg.sender];
        if (!policy.enabled) revert AgentDisabled();
        if (policy.validUntil != 0 && block.timestamp > policy.validUntil) revert AgentExpired();
        if (target.code.length == 0) revert InvalidContract();
        if (data.length < 4) revert InvalidSelector();

        bytes4 selector = bytes4(data[:4]);
        address validator = callValidators[msg.sender][target][selector];
        if (validator == address(0)) revert ForbiddenCall();
        if (!ICallValidator(validator).validateCall(address(this), msg.sender, target, value, data)) {
            revert ForbiddenCall();
        }
        if (value > policy.maxValuePerCall) revert ValueLimitExceeded();

        uint64 dayIndex = uint64(block.timestamp / 1 days);
        DailyUsage storage usage = dailyUsage[msg.sender];
        if (usage.dayIndex != dayIndex) {
            usage.dayIndex = dayIndex;
            usage.calls = 0;
            usage.value = 0;
        }

        uint32 nextCalls = usage.calls + 1;
        uint128 nextValue = usage.value + uint128(value);
        if (nextCalls > policy.maxCallsPerDay) revert CallLimitExceeded();
        if (nextValue > policy.maxValuePerDay) revert ValueLimitExceeded();
        usage.calls = nextCalls;
        usage.value = nextValue;

        bool success;
        (success, result) = target.call{value: value}(data);
        if (!success) revert CallFailed();
        emit Executed(msg.sender, target, selector, value, keccak256(data), keccak256(result));
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setTokenAllowance(address token, address spender, uint256 amount) external onlyOwner nonReentrant {
        _requireContract(token);
        _requireContract(spender);
        _safeTokenCall(token, abi.encodeCall(IERC20.approve, (spender, amount)));
        emit TokenAllowanceSet(token, spender, amount);
    }

    function rescueToken(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        _requireContract(token);
        if (recipient == address(0)) revert InvalidAddress();
        _safeTokenCall(token, abi.encodeCall(IERC20.transfer, (recipient, amount)));
        emit TokenRescued(token, recipient, amount);
    }

    function withdrawNative(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert CallFailed();
        emit NativeWithdrawn(recipient, amount);
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

    function _requireContract(address target) internal view {
        if (target == address(0)) revert InvalidAddress();
        if (target.code.length == 0) revert InvalidContract();
    }

    function _safeTokenCall(address token, bytes memory callData) internal {
        (bool success, bytes memory data) = token.call(callData);
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenOperationFailed();
        }
    }
}
