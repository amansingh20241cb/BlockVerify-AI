// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BlockVerify AI - Document Hash Registry
/// @notice Stores SHA-256 document fingerprints, not document contents.
contract DocumentRegistry {
    struct Record {
        address issuer;
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Record) private records;

    event DocumentRegistered(bytes32 indexed documentHash, address indexed issuer, uint256 timestamp);

    function registerDocument(bytes32 documentHash) external {
        require(documentHash != bytes32(0), "Empty document hash");
        require(!records[documentHash].exists, "Already registered");

        records[documentHash] = Record({
            issuer: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });

        emit DocumentRegistered(documentHash, msg.sender, block.timestamp);
    }

    function verifyDocument(bytes32 documentHash)
        external
        view
        returns (bool isRegistered, address issuer, uint256 timestamp)
    {
        Record memory record = records[documentHash];
        return (record.exists, record.issuer, record.timestamp);
    }
}
