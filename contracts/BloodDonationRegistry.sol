// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BloodDonationRegistry {
    enum RequestStatus {
        PendingLabVerification,
        LabVerified,
        HospitalApproved,
        Rejected
    }

    struct PatientRequest {
        uint256 id;
        address patient;
        string patientName;
        uint8 age;
        string bloodGroup;
        uint8 unitsRequired;
        string contactReference;
        string medicalReference;
        RequestStatus status;
        address labVerifier;
        address hospitalApprover;
        string labRemarks;
        string hospitalRemarks;
        uint256 createdAt;
    }

    address public owner;
    uint256 public requestCount;

    mapping(address => bool) public isLab;
    mapping(address => bool) public isHospital;
    mapping(uint256 => PatientRequest) private requests;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LabUpdated(address indexed lab, bool allowed);
    event HospitalUpdated(address indexed hospital, bool allowed);
    event PatientRegistered(uint256 indexed requestId, address indexed patient, string bloodGroup, uint8 unitsRequired);
    event LabVerificationCompleted(uint256 indexed requestId, address indexed lab, bool approved);
    event HospitalApprovalCompleted(uint256 indexed requestId, address indexed hospital, bool approved);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only admin can perform this action");
        _;
    }

    modifier onlyLab() {
        require(isLab[msg.sender], "Only lab wallet can verify");
        _;
    }

    modifier onlyHospital() {
        require(isHospital[msg.sender], "Only hospital wallet can approve");
        _;
    }

    modifier requestExists(uint256 requestId) {
        require(requestId > 0 && requestId <= requestCount, "Invalid request id");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setLab(address lab, bool allowed) external onlyOwner {
        require(lab != address(0), "Invalid lab address");
        isLab[lab] = allowed;
        emit LabUpdated(lab, allowed);
    }

    function setHospital(address hospital, bool allowed) external onlyOwner {
        require(hospital != address(0), "Invalid hospital address");
        isHospital[hospital] = allowed;
        emit HospitalUpdated(hospital, allowed);
    }

    function registerPatient(
        string calldata patientName,
        uint8 age,
        string calldata bloodGroup,
        uint8 unitsRequired,
        string calldata contactReference,
        string calldata medicalReference
    ) external returns (uint256 requestId) {
        require(bytes(patientName).length > 0, "Patient name is required");
        require(bytes(bloodGroup).length > 0, "Blood group is required");
        require(unitsRequired > 0, "Units must be greater than zero");

        requestCount += 1;
        requestId = requestCount;

        requests[requestId] = PatientRequest({
            id: requestId,
            patient: msg.sender,
            patientName: patientName,
            age: age,
            bloodGroup: bloodGroup,
            unitsRequired: unitsRequired,
            contactReference: contactReference,
            medicalReference: medicalReference,
            status: RequestStatus.PendingLabVerification,
            labVerifier: address(0),
            hospitalApprover: address(0),
            labRemarks: "",
            hospitalRemarks: "",
            createdAt: block.timestamp
        });

        emit PatientRegistered(requestId, msg.sender, bloodGroup, unitsRequired);
    }

    function verifyByLab(
        uint256 requestId,
        bool approved,
        string calldata remarks
    ) external onlyLab requestExists(requestId) {
        PatientRequest storage patientRequest = requests[requestId];
        require(patientRequest.status == RequestStatus.PendingLabVerification, "Request is not waiting for lab");

        patientRequest.labVerifier = msg.sender;
        patientRequest.labRemarks = remarks;

        if (approved) {
            patientRequest.status = RequestStatus.LabVerified;
        } else {
            patientRequest.status = RequestStatus.Rejected;
        }

        emit LabVerificationCompleted(requestId, msg.sender, approved);
    }

    function approveByHospital(
        uint256 requestId,
        bool approved,
        string calldata remarks
    ) external onlyHospital requestExists(requestId) {
        PatientRequest storage patientRequest = requests[requestId];
        require(patientRequest.status == RequestStatus.LabVerified, "Lab verification required");

        patientRequest.hospitalApprover = msg.sender;
        patientRequest.hospitalRemarks = remarks;

        if (approved) {
            patientRequest.status = RequestStatus.HospitalApproved;
        } else {
            patientRequest.status = RequestStatus.Rejected;
        }

        emit HospitalApprovalCompleted(requestId, msg.sender, approved);
    }

    function getRequest(uint256 requestId) external view requestExists(requestId) returns (PatientRequest memory) {
        return requests[requestId];
    }

    function getAllRequests() external view returns (PatientRequest[] memory result) {
        result = new PatientRequest[](requestCount);

        for (uint256 i = 0; i < requestCount; i++) {
            result[i] = requests[i + 1];
        }
    }
}
