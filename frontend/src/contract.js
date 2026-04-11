export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const contractAbi = [
  "function owner() view returns (address)",
  "function isLab(address) view returns (bool)",
  "function isBloodBank(address) view returns (bool)",
  "function isHospital(address) view returns (bool)",
  "function isDonor(address) view returns (bool)",
  "function requestCount() view returns (uint256)",
  "function donationCount() view returns (uint256)",
  "function getInventory(string bloodGroup) view returns (uint256)",
  "function getBloodBankInventory(address bloodBank, string bloodGroup) view returns (uint256)",
  "function getBloodBanks() view returns (address[])",
  "function getDonors() view returns (address[])",
  "function getAllRequests() view returns ((uint256 id,address patient,string patientName,uint8 age,string bloodGroup,uint8 unitsRequired,string contactReference,string medicalReference,uint8 status,address labVerifier,address bloodBankOfficer,address hospitalApprover,string labRemarks,string bloodBankRemarks,string hospitalRemarks,uint8 reservedUnits,uint256 createdAt)[])",
  "function getDonation(uint256 donationId) view returns ((uint256 id,address donor,string donorName,string bloodGroup,uint8 unitsDonated,uint8 unitsAvailable,address bloodBank,string donationDate,uint256 createdAt,uint8 status))",
  "function getAllDonations() view returns ((uint256 id,address donor,string donorName,string bloodGroup,uint8 unitsDonated,uint8 unitsAvailable,address bloodBank,string donationDate,uint256 createdAt,uint8 status)[])",
  "function getDonationsByDonor(address donor) view returns ((uint256 id,address donor,string donorName,string bloodGroup,uint8 unitsDonated,uint8 unitsAvailable,address bloodBank,string donationDate,uint256 createdAt,uint8 status)[])",
  "function getDonationAllocations(uint256 donationId) view returns ((uint256 donationId,uint256 requestId,address bloodBank,address patient,uint8 unitsAllocated,uint256 allocatedAt,bool used)[])",
  "function getRequestAllocations(uint256 requestId) view returns ((uint256 donationId,uint256 requestId,address bloodBank,address patient,uint8 unitsAllocated,uint256 allocatedAt,bool used)[])",
  "function registerPatient(string patientName,uint8 age,string bloodGroup,uint8 unitsRequired,string contactReference,string medicalReference) returns (uint256)",
  "function setLab(address lab,bool allowed)",
  "function setBloodBank(address bloodBank,bool allowed)",
  "function setHospital(address hospital,bool allowed)",
  "function setDonor(address donor,bool allowed)",
  "function updateInventory(string bloodGroup,uint256 unitsAvailable)",
  "function donateBlood(string donorName,string bloodGroup,uint8 unitsDonated,string donationDate,address bloodBank) returns (uint256)",
  "function verifyByLab(uint256 requestId,bool approved,string remarks)",
  "function checkAvailability(uint256 requestId,bool available,string remarks)",
  "function approveByHospital(uint256 requestId,bool approved,string remarks)",
  "event LabUpdated(address indexed lab, bool allowed)",
  "event BloodBankUpdated(address indexed bloodBank, bool allowed)",
  "event HospitalUpdated(address indexed hospital, bool allowed)",
  "event DonorUpdated(address indexed donor, bool allowed)",
  "event InventoryUpdated(address indexed bloodBank, string bloodGroup, uint256 unitsAvailable)",
  "event PatientRegistered(uint256 indexed requestId, address indexed patient, string bloodGroup, uint8 unitsRequired)",
  "event LabVerificationCompleted(uint256 indexed requestId, address indexed lab, bool approved)",
  "event BloodBankAvailabilityChecked(uint256 indexed requestId, address indexed bloodBank, bool available)",
  "event HospitalApprovalCompleted(uint256 indexed requestId, address indexed hospital, bool approved)",
  "event DonationRecorded(uint256 indexed donationId, address indexed donor, address indexed bloodBank, string bloodGroup, uint8 unitsDonated, string donationDate)",
  "event DonationAllocated(uint256 indexed donationId, uint256 indexed requestId, address indexed bloodBank, address patient, uint8 unitsAllocated)",
  "event DonationReleased(uint256 indexed donationId, uint256 indexed requestId, address indexed bloodBank, address patient, uint8 unitsReleased)"
];

export const statusLabels = {
  0: "Pending Lab Verification",
  1: "Pending Blood Bank Review",
  2: "Blood Unavailable",
  3: "Pending Hospital Approval",
  4: "Hospital Approved",
  5: "Rejected"
};

export const donationStatusLabels = {
  0: "Available",
  1: "Assigned",
  2: "Used"
};
