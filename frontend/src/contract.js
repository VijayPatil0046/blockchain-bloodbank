export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const contractAbi = [
  "function owner() view returns (address)",
  "function isLab(address) view returns (bool)",
  "function isHospital(address) view returns (bool)",
  "function requestCount() view returns (uint256)",
  "function getAllRequests() view returns ((uint256 id,address patient,string patientName,uint8 age,string bloodGroup,uint8 unitsRequired,string contactReference,string medicalReference,uint8 status,address labVerifier,address hospitalApprover,string labRemarks,string hospitalRemarks,uint256 createdAt)[])",
  "function registerPatient(string patientName,uint8 age,string bloodGroup,uint8 unitsRequired,string contactReference,string medicalReference) returns (uint256)",
  "function setLab(address lab,bool allowed)",
  "function setHospital(address hospital,bool allowed)",
  "function verifyByLab(uint256 requestId,bool approved,string remarks)",
  "function approveByHospital(uint256 requestId,bool approved,string remarks)",
  "event PatientRegistered(uint256 indexed requestId, address indexed patient, string bloodGroup, uint8 unitsRequired)",
  "event LabVerificationCompleted(uint256 indexed requestId, address indexed lab, bool approved)",
  "event HospitalApprovalCompleted(uint256 indexed requestId, address indexed hospital, bool approved)"
];

export const statusLabels = {
  0: "Pending Lab Verification",
  1: "Lab Verified",
  2: "Hospital Approved",
  3: "Rejected"
};
