export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const contractAbi = [
  "function owner() view returns (address)",
  "function isLab(address) view returns (bool)",
  "function isBloodBank(address) view returns (bool)",
  "function isHospital(address) view returns (bool)",
  "function requestCount() view returns (uint256)",
  "function getInventory(string bloodGroup) view returns (uint256)",
  "function getAllRequests() view returns ((uint256 id,address patient,string patientName,uint8 age,string bloodGroup,uint8 unitsRequired,string contactReference,string medicalReference,uint8 status,address labVerifier,address bloodBankOfficer,address hospitalApprover,string labRemarks,string bloodBankRemarks,string hospitalRemarks,uint8 reservedUnits,uint256 createdAt)[])",
  "function registerPatient(string patientName,uint8 age,string bloodGroup,uint8 unitsRequired,string contactReference,string medicalReference) returns (uint256)",
  "function setLab(address lab,bool allowed)",
  "function setBloodBank(address bloodBank,bool allowed)",
  "function setHospital(address hospital,bool allowed)",
  "function updateInventory(string bloodGroup,uint256 unitsAvailable)",
  "function verifyByLab(uint256 requestId,bool approved,string remarks)",
  "function checkAvailability(uint256 requestId,bool available,string remarks)",
  "function approveByHospital(uint256 requestId,bool approved,string remarks)",
  "event LabUpdated(address indexed lab, bool allowed)",
  "event BloodBankUpdated(address indexed bloodBank, bool allowed)",
  "event HospitalUpdated(address indexed hospital, bool allowed)",
  "event InventoryUpdated(address indexed bloodBank, string bloodGroup, uint256 unitsAvailable)",
  "event PatientRegistered(uint256 indexed requestId, address indexed patient, string bloodGroup, uint8 unitsRequired)",
  "event LabVerificationCompleted(uint256 indexed requestId, address indexed lab, bool approved)",
  "event BloodBankAvailabilityChecked(uint256 indexed requestId, address indexed bloodBank, bool available)",
  "event HospitalApprovalCompleted(uint256 indexed requestId, address indexed hospital, bool approved)"
];

export const statusLabels = {
  0: "Pending Lab Verification",
  1: "Pending Blood Bank Review",
  2: "Blood Unavailable",
  3: "Pending Hospital Approval",
  4: "Hospital Approved",
  5: "Rejected"
};
