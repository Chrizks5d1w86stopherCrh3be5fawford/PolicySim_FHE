// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PolicySimFHE is SepoliaConfig {
    // Citizen agent structure (encrypted)
    struct EncryptedCitizen {
        uint256 id;
        euint64 income;        // Encrypted citizen income
        euint64 health;        // Encrypted citizen health score
        euint64 education;     // Encrypted education level
        euint64 satisfaction;  // Encrypted overall satisfaction
        uint256 timestamp;
    }

    // Decrypted citizen data (revealed only when permitted)
    struct DecryptedCitizen {
        uint64 income;
        uint64 health;
        uint64 education;
        uint64 satisfaction;
        bool isRevealed;
    }

    // Policy simulation record
    struct EncryptedPolicy {
        uint256 id;
        euint64 taxRate;       // Encrypted policy parameter (tax rate)
        euint64 healthcare;    // Encrypted parameter (healthcare funding)
        euint64 education;     // Encrypted parameter (education investment)
        euint64 effectIndex;   // Encrypted computed effect
        uint256 timestamp;
    }

    struct DecryptedPolicy {
        uint64 taxRate;
        uint64 healthcare;
        uint64 education;
        uint64 effectIndex;
        bool isRevealed;
    }

    uint256 public citizenCount;
    uint256 public policyCount;

    mapping(uint256 => EncryptedCitizen) public encryptedCitizens;
    mapping(uint256 => DecryptedCitizen) public decryptedCitizens;

    mapping(uint256 => EncryptedPolicy) public encryptedPolicies;
    mapping(uint256 => DecryptedPolicy) public decryptedPolicies;

    mapping(uint256 => uint256) private requestToCitizen;
    mapping(uint256 => uint256) private requestToPolicy;

    event CitizenJoined(uint256 indexed id, uint256 timestamp);
    event PolicyProposed(uint256 indexed id, uint256 timestamp);
    event PolicySimulated(uint256 indexed id);
    event DecryptionRequested(uint256 indexed id, string target);
    event DecryptionCompleted(uint256 indexed id, string target);

    /// @notice Citizens submit their encrypted profile
    function joinSimulation(
        euint64 income,
        euint64 health,
        euint64 education,
        euint64 satisfaction
    ) public {
        citizenCount += 1;
        uint256 id = citizenCount;

        encryptedCitizens[id] = EncryptedCitizen({
            id: id,
            income: income,
            health: health,
            education: education,
            satisfaction: satisfaction,
            timestamp: block.timestamp
        });

        decryptedCitizens[id] = DecryptedCitizen({
            income: 0,
            health: 0,
            education: 0,
            satisfaction: 0,
            isRevealed: false
        });

        emit CitizenJoined(id, block.timestamp);
    }

    /// @notice Government or users propose an encrypted policy
    function proposePolicy(
        euint64 taxRate,
        euint64 healthcare,
        euint64 education
    ) public {
        policyCount += 1;
        uint256 id = policyCount;

        encryptedPolicies[id] = EncryptedPolicy({
            id: id,
            taxRate: taxRate,
            healthcare: healthcare,
            education: education,
            effectIndex: FHE.asEuint64(0),
            timestamp: block.timestamp
        });

        decryptedPolicies[id] = DecryptedPolicy({
            taxRate: 0,
            healthcare: 0,
            education: 0,
            effectIndex: 0,
            isRevealed: false
        });

        emit PolicyProposed(id, block.timestamp);
    }

    /// @notice Simulate the encrypted policy effect on citizens
    function simulatePolicyEffect(uint256 policyId) public {
        require(policyId > 0 && policyId <= policyCount, "Invalid policy ID");
        EncryptedPolicy storage policy = encryptedPolicies[policyId];

        euint64 totalEffect = FHE.asEuint64(0);

        for (uint i = 1; i <= citizenCount; i++) {
            EncryptedCitizen storage c = encryptedCitizens[i];
            // Simplified encrypted computation for simulation
            euint64 part1 = FHE.mul(policy.healthcare, c.health);
            euint64 part2 = FHE.mul(policy.education, c.education);
            euint64 part3 = FHE.sub(FHE.asEuint64(10000), policy.taxRate);
            euint64 partialEffect = FHE.div(FHE.add(FHE.add(part1, part2), part3), FHE.asEuint64(100));
            totalEffect = FHE.add(totalEffect, partialEffect);
        }

        policy.effectIndex = totalEffect;

        emit PolicySimulated(policyId);
    }

    /// @notice Request to decrypt a simulated policy
    function requestPolicyDecryption(uint256 policyId) public {
        EncryptedPolicy storage policy = encryptedPolicies[policyId];
        require(!decryptedPolicies[policyId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(policy.taxRate);
        ciphertexts[1] = FHE.toBytes32(policy.healthcare);
        ciphertexts[2] = FHE.toBytes32(policy.education);
        ciphertexts[3] = FHE.toBytes32(policy.effectIndex);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPolicy.selector);
        requestToPolicy[reqId] = policyId;

        emit DecryptionRequested(policyId, "policy");
    }

    /// @notice Decrypt policy callback
    function decryptPolicy(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 policyId = requestToPolicy[requestId];
        require(policyId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint64[] memory values = abi.decode(cleartexts, (uint64[]));
        DecryptedPolicy storage p = decryptedPolicies[policyId];
        p.taxRate = values[0];
        p.healthcare = values[1];
        p.education = values[2];
        p.effectIndex = values[3];
        p.isRevealed = true;

        emit DecryptionCompleted(policyId, "policy");
    }

    /// @notice Request to decrypt a citizen’s data
    function requestCitizenDecryption(uint256 citizenId) public {
        EncryptedCitizen storage c = encryptedCitizens[citizenId];
        require(!decryptedCitizens[citizenId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(c.income);
        ciphertexts[1] = FHE.toBytes32(c.health);
        ciphertexts[2] = FHE.toBytes32(c.education);
        ciphertexts[3] = FHE.toBytes32(c.satisfaction);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptCitizen.selector);
        requestToCitizen[reqId] = citizenId;

        emit DecryptionRequested(citizenId, "citizen");
    }

    /// @notice Callback for decrypted citizen
    function decryptCitizen(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 citizenId = requestToCitizen[requestId];
        require(citizenId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint64[] memory values = abi.decode(cleartexts, (uint64[]));
        DecryptedCitizen storage d = decryptedCitizens[citizenId];
        d.income = values[0];
        d.health = values[1];
        d.education = values[2];
        d.satisfaction = values[3];
        d.isRevealed = true;

        emit DecryptionCompleted(citizenId, "citizen");
    }

    /// @notice Get decrypted policy info
    function getDecryptedPolicy(uint256 policyId) public view returns (
        uint64 taxRate,
        uint64 healthcare,
        uint64 education,
        uint64 effectIndex,
        bool isRevealed
    ) {
        DecryptedPolicy storage p = decryptedPolicies[policyId];
        return (p.taxRate, p.healthcare, p.education, p.effectIndex, p.isRevealed);
    }

    /// @notice Get decrypted citizen info
    function getDecryptedCitizen(uint256 citizenId) public view returns (
        uint64 income,
        uint64 health,
        uint64 education,
        uint64 satisfaction,
        bool isRevealed
    ) {
        DecryptedCitizen storage c = decryptedCitizens[citizenId];
        return (c.income, c.health, c.education, c.satisfaction, c.isRevealed);
    }
}
