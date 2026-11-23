// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BlockVerifyRegistry
/// @notice Stores SHA-256 fingerprints of documents with the registrant wallet and a timestamp.
/// A match proves the exact file bytes were registered, not who the real-world issuer is.
contract BlockVerifyRegistry {
    struct Record {
        address registrant;
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Record) private records;

    event DocumentRegistered(bytes32 indexed hash, address indexed registrant, uint256 timestamp);

    function registerDocument(bytes32 hash) external {
        require(!records[hash].exists, "Document already registered");
        records[hash] = Record(msg.sender, block.timestamp, true);
        emit DocumentRegistered(hash, msg.sender, block.timestamp);
    }

    function verifyDocument(bytes32 hash)
        external
        view
        returns (bool exists, address registrant, uint256 timestamp)
    {
        Record memory r = records[hash];
        return (r.exists, r.registrant, r.timestamp);
    }
}
