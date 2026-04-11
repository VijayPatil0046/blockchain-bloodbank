// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BloodDonationRegistry {
    enum RequestStatus {
        PendingLabVerification,
        PendingBloodBankReview,
        BloodUnavailable,
        PendingHospitalApproval,
        HospitalApproved,
        Rejected
    }

    enum DonationStatus {
        Available,
        Assigned,
        Used
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
        address bloodBankOfficer;
        address hospitalApprover;
        string labRemarks;
        string bloodBankRemarks;
        string hospitalRemarks;
        uint8 reservedUnits;
        uint256 createdAt;
    }

    struct BloodDonation {
        uint256 id;
        address donor;
        string donorName;
        string bloodGroup;
        uint8 unitsDonated;
        uint8 unitsAvailable;
        address bloodBank;
        string donationDate;
        uint256 createdAt;
        DonationStatus status;
    }

    struct DonationAllocation {
        uint256 donationId;
        uint256 requestId;
        address bloodBank;
        address patient;
        uint8 unitsAllocated;
        uint256 allocatedAt;
        bool used;
    }

    address public owner;
    uint256 public requestCount;
    uint256 public donationCount;

    mapping(address => bool) public isLab;
    mapping(address => bool) public isBloodBank;
    mapping(address => bool) public isHospital;
    mapping(address => bool) public isDonor;

    mapping(string => uint256) private bloodInventory;
    mapping(address => mapping(string => uint256)) private bloodBankInventory;
    mapping(uint256 => PatientRequest) private requests;
    mapping(uint256 => BloodDonation) private donations;
    mapping(address => uint256[]) private donorDonationIds;
    mapping(uint256 => DonationAllocation[]) private requestAllocations;
    mapping(uint256 => DonationAllocation[]) private donationAllocations;

    address[] private bloodBanks;
    address[] private donors;
    mapping(address => bool) private bloodBankListed;
    mapping(address => bool) private donorListed;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LabUpdated(address indexed lab, bool allowed);
    event BloodBankUpdated(address indexed bloodBank, bool allowed);
    event HospitalUpdated(address indexed hospital, bool allowed);
    event DonorUpdated(address indexed donor, bool allowed);
    event InventoryUpdated(address indexed bloodBank, string bloodGroup, uint256 unitsAvailable);
    event PatientRegistered(uint256 indexed requestId, address indexed patient, string bloodGroup, uint8 unitsRequired);
    event LabVerificationCompleted(uint256 indexed requestId, address indexed lab, bool approved);
    event BloodBankAvailabilityChecked(uint256 indexed requestId, address indexed bloodBank, bool available);
    event HospitalApprovalCompleted(uint256 indexed requestId, address indexed hospital, bool approved);
    event DonationRecorded(uint256 indexed donationId, address indexed donor, address indexed bloodBank, string bloodGroup, uint8 unitsDonated, string donationDate);
    event DonationAllocated(uint256 indexed donationId, uint256 indexed requestId, address indexed bloodBank, address patient, uint8 unitsAllocated);
    event DonationReleased(uint256 indexed donationId, uint256 indexed requestId, address indexed bloodBank, address patient, uint8 unitsReleased);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only admin can perform this action");
        _;
    }

    modifier onlyLab() {
        require(isLab[msg.sender], "Only lab wallet can verify");
        _;
    }

    modifier onlyBloodBank() {
        require(isBloodBank[msg.sender], "Only blood bank wallet can manage inventory");
        _;
    }

    modifier onlyHospital() {
        require(isHospital[msg.sender], "Only hospital wallet can approve");
        _;
    }

    modifier onlyDonor() {
        require(isDonor[msg.sender], "Only donor wallet can donate");
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

    function setBloodBank(address bloodBank, bool allowed) external onlyOwner {
        require(bloodBank != address(0), "Invalid blood bank address");
        isBloodBank[bloodBank] = allowed;
        if (allowed && !bloodBankListed[bloodBank]) {
            bloodBankListed[bloodBank] = true;
            bloodBanks.push(bloodBank);
        }
        emit BloodBankUpdated(bloodBank, allowed);
    }

    function setHospital(address hospital, bool allowed) external onlyOwner {
        require(hospital != address(0), "Invalid hospital address");
        isHospital[hospital] = allowed;
        emit HospitalUpdated(hospital, allowed);
    }

    function setDonor(address donor, bool allowed) external onlyOwner {
        require(donor != address(0), "Invalid donor address");
        isDonor[donor] = allowed;
        if (allowed && !donorListed[donor]) {
            donorListed[donor] = true;
            donors.push(donor);
        }
        emit DonorUpdated(donor, allowed);
    }

    function updateInventory(string calldata bloodGroup, uint256 unitsAvailable) external onlyBloodBank {
        require(bytes(bloodGroup).length > 0, "Blood group is required");
        uint256 currentBankUnits = bloodBankInventory[msg.sender][bloodGroup];
        bloodBankInventory[msg.sender][bloodGroup] = unitsAvailable;

        if (unitsAvailable >= currentBankUnits) {
            bloodInventory[bloodGroup] += unitsAvailable - currentBankUnits;
        } else {
            bloodInventory[bloodGroup] -= currentBankUnits - unitsAvailable;
        }

        emit InventoryUpdated(msg.sender, bloodGroup, unitsAvailable);
    }

    function getInventory(string calldata bloodGroup) external view returns (uint256) {
        return bloodInventory[bloodGroup];
    }

    function getBloodBankInventory(address bloodBank, string calldata bloodGroup) external view returns (uint256) {
        return bloodBankInventory[bloodBank][bloodGroup];
    }

    function getBloodBanks() external view returns (address[] memory) {
        return bloodBanks;
    }

    function getDonors() external view returns (address[] memory) {
        return donors;
    }

    function donateBlood(
        string calldata donorName,
        string calldata bloodGroup,
        uint8 unitsDonated,
        string calldata donationDate,
        address bloodBank
    ) external onlyDonor returns (uint256 donationId) {
        require(bytes(donorName).length > 0, "Donor name is required");
        require(bytes(bloodGroup).length > 0, "Blood group is required");
        require(unitsDonated > 0, "Units donated must be greater than zero");
        require(isBloodBank[bloodBank], "Invalid blood bank");

        donationCount += 1;
        donationId = donationCount;

        donations[donationId] = BloodDonation({
            id: donationId,
            donor: msg.sender,
            donorName: donorName,
            bloodGroup: bloodGroup,
            unitsDonated: unitsDonated,
            unitsAvailable: unitsDonated,
            bloodBank: bloodBank,
            donationDate: donationDate,
            createdAt: block.timestamp,
            status: DonationStatus.Available
        });

        donorDonationIds[msg.sender].push(donationId);
        bloodInventory[bloodGroup] += unitsDonated;
        bloodBankInventory[bloodBank][bloodGroup] += unitsDonated;

        emit DonationRecorded(donationId, msg.sender, bloodBank, bloodGroup, unitsDonated, donationDate);
        emit InventoryUpdated(bloodBank, bloodGroup, bloodBankInventory[bloodBank][bloodGroup]);
    }

    function getDonation(uint256 donationId) external view returns (BloodDonation memory) {
        require(donationId > 0 && donationId <= donationCount, "Invalid donation id");
        return donations[donationId];
    }

    function getAllDonations() external view returns (BloodDonation[] memory result) {
        result = new BloodDonation[](donationCount);

        for (uint256 i = 0; i < donationCount; i++) {
            result[i] = donations[i + 1];
        }
    }

    function getDonationsByDonor(address donor) external view returns (BloodDonation[] memory result) {
        uint256[] storage ids = donorDonationIds[donor];
        result = new BloodDonation[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = donations[ids[i]];
        }
    }

    function getDonationAllocations(uint256 donationId) external view returns (DonationAllocation[] memory) {
        require(donationId > 0 && donationId <= donationCount, "Invalid donation id");
        return donationAllocations[donationId];
    }

    function getRequestAllocations(uint256 requestId) external view requestExists(requestId) returns (DonationAllocation[] memory) {
        return requestAllocations[requestId];
    }

    function _markAllocations(uint256 requestId, bool used) internal {
        DonationAllocation[] storage allocations = requestAllocations[requestId];

        for (uint256 i = 0; i < allocations.length; i++) {
            allocations[i].used = used;

            DonationAllocation[] storage donationHistory = donationAllocations[allocations[i].donationId];
            for (uint256 j = 0; j < donationHistory.length; j++) {
                if (donationHistory[j].requestId == requestId) {
                    donationHistory[j].used = used;
                }
            }
        }
    }

    function _fulfillRequestFromDonations(
        uint256 requestId,
        address bloodBank,
        string memory bloodGroup,
        uint8 unitsRequired,
        address patient
    ) internal {
        uint256 remainingUnits = unitsRequired;
        bytes32 bloodGroupHash = keccak256(bytes(bloodGroup));

        for (uint256 donationId = 1; donationId <= donationCount && remainingUnits > 0; donationId++) {
            BloodDonation storage donation = donations[donationId];

            if (donation.bloodBank != bloodBank) continue;
            if (keccak256(bytes(donation.bloodGroup)) != bloodGroupHash) continue;
            if (donation.unitsAvailable == 0) continue;

            uint256 allocationUnits = donation.unitsAvailable < remainingUnits ? donation.unitsAvailable : remainingUnits;

            donation.unitsAvailable -= uint8(allocationUnits);
            bloodInventory[bloodGroup] -= allocationUnits;
            bloodBankInventory[bloodBank][bloodGroup] -= allocationUnits;

            donation.status = donation.unitsAvailable == 0 ? DonationStatus.Used : DonationStatus.Assigned;

            DonationAllocation memory allocation = DonationAllocation({
                donationId: donationId,
                requestId: requestId,
                bloodBank: bloodBank,
                patient: patient,
                unitsAllocated: uint8(allocationUnits),
                allocatedAt: block.timestamp,
                used: false
            });

            requestAllocations[requestId].push(allocation);
            donationAllocations[donationId].push(allocation);
            emit DonationAllocated(donationId, requestId, bloodBank, patient, uint8(allocationUnits));

            remainingUnits -= allocationUnits;
        }

        require(remainingUnits == 0, "Not enough donor inventory");
    }

    function _releaseRequestAllocations(uint256 requestId) internal {
        DonationAllocation[] storage allocations = requestAllocations[requestId];

        for (uint256 i = 0; i < allocations.length; i++) {
            DonationAllocation storage allocation = allocations[i];
            BloodDonation storage donation = donations[allocation.donationId];

            donation.unitsAvailable += allocation.unitsAllocated;
            bloodInventory[donation.bloodGroup] += allocation.unitsAllocated;
            bloodBankInventory[allocation.bloodBank][donation.bloodGroup] += allocation.unitsAllocated;
            donation.status = donation.unitsAvailable == donation.unitsDonated ? DonationStatus.Available : DonationStatus.Assigned;

            emit DonationReleased(allocation.donationId, requestId, allocation.bloodBank, allocation.patient, allocation.unitsAllocated);
        }
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
            bloodBankOfficer: address(0),
            hospitalApprover: address(0),
            labRemarks: "",
            bloodBankRemarks: "",
            hospitalRemarks: "",
            reservedUnits: 0,
            createdAt: block.timestamp
        });

        emit PatientRegistered(requestId, msg.sender, bloodGroup, unitsRequired);
    }

    function verifyByLab(uint256 requestId, bool approved, string calldata remarks) external onlyLab requestExists(requestId) {
        PatientRequest storage patientRequest = requests[requestId];
        require(patientRequest.status == RequestStatus.PendingLabVerification, "Request is not waiting for lab");

        patientRequest.labVerifier = msg.sender;
        patientRequest.labRemarks = remarks;

        if (approved) {
            patientRequest.status = RequestStatus.PendingBloodBankReview;
        } else {
            patientRequest.status = RequestStatus.Rejected;
        }

        emit LabVerificationCompleted(requestId, msg.sender, approved);
    }

    function checkAvailability(uint256 requestId, bool available, string calldata remarks) external onlyBloodBank requestExists(requestId) {
        PatientRequest storage patientRequest = requests[requestId];
        require(patientRequest.status == RequestStatus.PendingBloodBankReview, "Blood bank review is not pending");

        patientRequest.bloodBankOfficer = msg.sender;
        patientRequest.bloodBankRemarks = remarks;

        if (available) {
            require(bloodBankInventory[msg.sender][patientRequest.bloodGroup] >= patientRequest.unitsRequired, "Not enough units in inventory");
            patientRequest.reservedUnits = patientRequest.unitsRequired;
            _fulfillRequestFromDonations(requestId, msg.sender, patientRequest.bloodGroup, patientRequest.unitsRequired, patientRequest.patient);
            patientRequest.status = RequestStatus.PendingHospitalApproval;
        } else {
            patientRequest.reservedUnits = 0;
            patientRequest.status = RequestStatus.BloodUnavailable;
        }

        emit BloodBankAvailabilityChecked(requestId, msg.sender, available);
    }

    function approveByHospital(uint256 requestId, bool approved, string calldata remarks) external onlyHospital requestExists(requestId) {
        PatientRequest storage patientRequest = requests[requestId];
        require(patientRequest.status == RequestStatus.PendingHospitalApproval, "Blood availability confirmation required");

        patientRequest.hospitalApprover = msg.sender;
        patientRequest.hospitalRemarks = remarks;

        if (approved) {
            _markAllocations(requestId, true);
            patientRequest.status = RequestStatus.HospitalApproved;
        } else {
            _releaseRequestAllocations(requestId);
            patientRequest.reservedUnits = 0;
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
