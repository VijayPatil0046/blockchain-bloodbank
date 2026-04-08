import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { contractAbi, contractAddress, statusLabels } from "./contract";

const emptyPatientForm = {
  patientName: "",
  age: "",
  bloodGroup: "O+",
  unitsRequired: "",
  contactReference: "",
  medicalReference: ""
};

const emptyRoleForm = {
  address: "",
  allowed: true
};

const emptyActionForm = {
  requestId: "",
  approved: true,
  remarks: ""
};

const defaultContractAddress = "0x0000000000000000000000000000000000000000";
const addressPattern = /0x[a-fA-F0-9]{40}/;

function extractAddress(value) {
  const match = value.match(addressPattern);
  return match ? match[0] : value.trim();
}

function getErrorMessage(error) {
  return (
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.error?.message ||
    error?.message ||
    "Transaction failed."
  );
}

function App() {
  const [account, setAccount] = useState("");
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [role, setRole] = useState("Guest");
  const [roleFlags, setRoleFlags] = useState({
    isAdmin: false,
    isPatient: false,
    isLab: false,
    isHospital: false
  });
  const [requests, setRequests] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [labForm, setLabForm] = useState(emptyRoleForm);
  const [hospitalForm, setHospitalForm] = useState(emptyRoleForm);
  const [labAction, setLabAction] = useState(emptyActionForm);
  const [hospitalAction, setHospitalAction] = useState(emptyActionForm);
  const [statusMessage, setStatusMessage] = useState("Connect MetaMask to begin.");

  function resetWalletState(message) {
    setAccount("");
    setProvider(null);
    setContract(null);
    setRole("Guest");
    setRoleFlags({
      isAdmin: false,
      isPatient: false,
      isLab: false,
      isHospital: false
    });
    setRequests([]);
    setActivityLog([]);
    setStatusMessage(message);
  }

  async function loadActivity(registry) {
    const [patientEvents, labEvents, hospitalEvents] = await Promise.all([
      registry.queryFilter(registry.filters.PatientRegistered(), 0, "latest"),
      registry.queryFilter(registry.filters.LabVerificationCompleted(), 0, "latest"),
      registry.queryFilter(registry.filters.HospitalApprovalCompleted(), 0, "latest")
    ]);

    const activity = [
      ...patientEvents.map((event) => ({
        id: `${event.transactionHash}-${event.index}`,
        type: "Patient Registered",
        requestId: event.args.requestId.toString(),
        actor: event.args.patient,
        outcome: `${event.args.bloodGroup} | ${event.args.unitsRequired.toString()} unit(s)`,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      })),
      ...labEvents.map((event) => ({
        id: `${event.transactionHash}-${event.index}`,
        type: "Lab Verification",
        requestId: event.args.requestId.toString(),
        actor: event.args.lab,
        outcome: event.args.approved ? "Approved" : "Rejected",
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      })),
      ...hospitalEvents.map((event) => ({
        id: `${event.transactionHash}-${event.index}`,
        type: "Hospital Approval",
        requestId: event.args.requestId.toString(),
        actor: event.args.hospital,
        outcome: event.args.approved ? "Approved" : "Rejected",
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      }))
    ].sort((left, right) => {
      if (right.blockNumber !== left.blockNumber) {
        return right.blockNumber - left.blockNumber;
      }

      return right.txHash.localeCompare(left.txHash);
    });

    setActivityLog(activity);
  }

  async function createRegistry(currentProvider, currentAccount) {
    const signer = await currentProvider.getSigner();
    const registry = new ethers.Contract(contractAddress, contractAbi, signer);
    return registry;
  }

  async function loadContract(currentProvider, currentAccount) {
    const normalizedAccount = ethers.getAddress(currentAccount);
    const deployedCode = await currentProvider.getCode(contractAddress);

    if (deployedCode === "0x") {
      throw new Error(
        "No contract is deployed at this address on the current network. Run `npm run deploy:local` and update frontend/.env with the new contract address."
      );
    }

    const registry = await createRegistry(currentProvider, normalizedAccount);
    const [owner, lab, hospital, allRequests] = await Promise.all([
      registry.owner(),
      registry.isLab(normalizedAccount),
      registry.isHospital(normalizedAccount),
      registry.getAllRequests()
    ]);

    const isAdmin = ethers.getAddress(owner) === normalizedAccount;
    const isPatient = allRequests.some(
      (request) => ethers.getAddress(request.patient) === normalizedAccount
    );
    let currentRole = "Unassigned";
    if (isAdmin) {
      currentRole = "Admin";
    } else if (lab) {
      currentRole = "Lab";
    } else if (hospital) {
      currentRole = "Hospital";
    } else if (isPatient) {
      currentRole = "Patient";
    }

    setContract(registry);
    setRole(currentRole);
    setRoleFlags({
      isAdmin,
      isPatient,
      isLab: lab,
      isHospital: hospital
    });
    setRequests(allRequests);
    await loadActivity(registry);
  }

  async function syncWalletState(message) {
    if (contractAddress === defaultContractAddress) {
      resetWalletState("Set VITE_CONTRACT_ADDRESS in frontend/.env before connecting.");
      return;
    }

    if (!window.ethereum) {
      resetWalletState("MetaMask is required in the browser.");
      return;
    }

    const currentProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await currentProvider.send("eth_accounts", []);

    if (!accounts.length) {
      resetWalletState("Wallet disconnected.");
      return;
    }

    const currentAccount = ethers.getAddress(accounts[0]);
    try {
      setProvider(currentProvider);
      setAccount(currentAccount);
      await loadContract(currentProvider, currentAccount);
      setStatusMessage(message);
    } catch (error) {
      resetWalletState(getErrorMessage(error));
    }
  }

  async function getWriteContract() {
    if (!provider || !account) {
      throw new Error("Connect MetaMask first.");
    }

    return createRegistry(provider, account);
  }

  async function connectWallet() {
    if (contractAddress === defaultContractAddress) {
      setStatusMessage("Set VITE_CONTRACT_ADDRESS in frontend/.env before connecting.");
      return;
    }

    if (!window.ethereum) {
      setStatusMessage("MetaMask is required in the browser.");
      return;
    }

    const currentProvider = new ethers.BrowserProvider(window.ethereum);
    await currentProvider.send("eth_requestAccounts", []);
    await syncWalletState("Wallet connected.");
  }

  async function refreshRequests() {
    if (!contract || !provider || !account) {
      return;
    }

    await loadContract(provider, account);
  }

  useEffect(() => {
    if (!window.ethereum) {
      return undefined;
    }

    const handleAccountsChanged = async (accounts) => {
      if (!accounts.length) {
        resetWalletState("Wallet disconnected.");
        return;
      }

      await syncWalletState("Wallet account changed.");
    };

    const handleChainChanged = async () => {
      await syncWalletState("Wallet network changed.");
    };

    syncWalletState("Wallet detected.").catch(() => {});
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  async function submitPatient(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.registerPatient(
        patientForm.patientName,
        Number(patientForm.age),
        patientForm.bloodGroup,
        Number(patientForm.unitsRequired),
        patientForm.contactReference,
        patientForm.medicalReference
      );

      setStatusMessage("Waiting for patient registration confirmation...");
      await tx.wait();
      setPatientForm(emptyPatientForm);
      await refreshRequests();
      setStatusMessage("Patient request registered on-chain.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitLabRole(event) {
    event.preventDefault();
    try {
      const targetAddress = extractAddress(labForm.address);
      if (!ethers.isAddress(targetAddress)) {
        setStatusMessage("Enter a valid lab wallet address.");
        return;
      }

      const registry = await getWriteContract();
      const tx = await registry.setLab(targetAddress, labForm.allowed);
      setStatusMessage("Waiting for admin to confirm lab update...");
      await tx.wait();
      setLabForm(emptyRoleForm);
      await refreshRequests();
      setStatusMessage("Lab access updated.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitHospitalRole(event) {
    event.preventDefault();
    try {
      const targetAddress = extractAddress(hospitalForm.address);
      if (!ethers.isAddress(targetAddress)) {
        setStatusMessage("Enter a valid hospital wallet address.");
        return;
      }

      const registry = await getWriteContract();
      const tx = await registry.setHospital(targetAddress, hospitalForm.allowed);
      setStatusMessage("Waiting for admin to confirm hospital update...");
      await tx.wait();
      setHospitalForm(emptyRoleForm);
      await refreshRequests();
      setStatusMessage("Hospital access updated.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitLabVerification(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.verifyByLab(
        Number(labAction.requestId),
        labAction.approved,
        labAction.remarks
      );
      setStatusMessage("Waiting for lab verification...");
      await tx.wait();
      setLabAction(emptyActionForm);
      await refreshRequests();
      setStatusMessage("Lab verification saved.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitHospitalApproval(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.approveByHospital(
        Number(hospitalAction.requestId),
        hospitalAction.approved,
        hospitalAction.remarks
      );
      setStatusMessage("Waiting for hospital approval...");
      await tx.wait();
      setHospitalAction(emptyActionForm);
      await refreshRequests();
      setStatusMessage("Hospital decision saved.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Blood Donation Chain</p>
          <h1>Patient registration with lab and hospital verification on Ethereum.</h1>
          <p className="hero-copy">
            Patients create a request. Trusted labs verify it. Hospitals approve it.
            Admin controls which MetaMask wallets are allowed to act as labs and hospitals.
          </p>
        </div>
        <div className="wallet-box">
          <button className="primary-button" onClick={connectWallet}>
            {account ? "Reconnect Wallet" : "Connect MetaMask"}
          </button>
          <p><strong>Contract:</strong> {contractAddress}</p>
          <p><strong>Account:</strong> {account || "Not connected"}</p>
          <p><strong>Role:</strong> {role}</p>
          <p><strong>Admin Flag:</strong> {roleFlags.isAdmin ? "Yes" : "No"}</p>
          <p><strong>Patient Flag:</strong> {roleFlags.isPatient ? "Yes" : "No"}</p>
          <p><strong>Lab Flag:</strong> {roleFlags.isLab ? "Yes" : "No"}</p>
          <p><strong>Hospital Flag:</strong> {roleFlags.isHospital ? "Yes" : "No"}</p>
          <p className="status-chip">{statusMessage}</p>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Patient Registration</h2>
          <p className="panel-copy">Any connected wallet can register a patient request. Lab and hospital are special on-chain roles set by admin.</p>
          <form onSubmit={submitPatient}>
            <input
              placeholder="Patient name"
              value={patientForm.patientName}
              onChange={(event) => setPatientForm({ ...patientForm, patientName: event.target.value })}
            />
            <input
              placeholder="Age"
              type="number"
              value={patientForm.age}
              onChange={(event) => setPatientForm({ ...patientForm, age: event.target.value })}
            />
            <select
              value={patientForm.bloodGroup}
              onChange={(event) => setPatientForm({ ...patientForm, bloodGroup: event.target.value })}
            >
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <input
              placeholder="Units required"
              type="number"
              value={patientForm.unitsRequired}
              onChange={(event) => setPatientForm({ ...patientForm, unitsRequired: event.target.value })}
            />
            <input
              placeholder="Contact reference or encrypted hash"
              value={patientForm.contactReference}
              onChange={(event) => setPatientForm({ ...patientForm, contactReference: event.target.value })}
            />
            <textarea
              placeholder="Medical record reference or IPFS hash"
              value={patientForm.medicalReference}
              onChange={(event) => setPatientForm({ ...patientForm, medicalReference: event.target.value })}
            />
            <button className="primary-button" type="submit" disabled={!contract}>
              Register Request
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Admin Controls</h2>
          <p className="panel-copy">Use the admin wallet to authorize MetaMask addresses.</p>
          <form onSubmit={submitLabRole}>
            <label>Authorize Lab Wallet</label>
            <input
              placeholder="0x..."
              value={labForm.address}
              onChange={(event) => setLabForm({ ...labForm, address: extractAddress(event.target.value) })}
            />
            <select
              value={String(labForm.allowed)}
              onChange={(event) => setLabForm({ ...labForm, allowed: event.target.value === "true" })}
            >
              <option value="true">Allow</option>
              <option value="false">Revoke</option>
            </select>
            <button className="secondary-button" type="submit" disabled={role !== "Admin"}>
              Update Lab
            </button>
          </form>
          <form onSubmit={submitHospitalRole}>
            <label>Authorize Hospital Wallet</label>
            <input
              placeholder="0x..."
              value={hospitalForm.address}
              onChange={(event) => setHospitalForm({ ...hospitalForm, address: extractAddress(event.target.value) })}
            />
            <select
              value={String(hospitalForm.allowed)}
              onChange={(event) => setHospitalForm({ ...hospitalForm, allowed: event.target.value === "true" })}
            >
              <option value="true">Allow</option>
              <option value="false">Revoke</option>
            </select>
            <button className="secondary-button" type="submit" disabled={role !== "Admin"}>
              Update Hospital
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Lab Verification</h2>
          <form onSubmit={submitLabVerification}>
            <input
              placeholder="Request ID"
              type="number"
              value={labAction.requestId}
              onChange={(event) => setLabAction({ ...labAction, requestId: event.target.value })}
            />
            <select
              value={String(labAction.approved)}
              onChange={(event) => setLabAction({ ...labAction, approved: event.target.value === "true" })}
            >
              <option value="true">Verify</option>
              <option value="false">Reject</option>
            </select>
            <textarea
              placeholder="Lab remarks"
              value={labAction.remarks}
              onChange={(event) => setLabAction({ ...labAction, remarks: event.target.value })}
            />
            <button className="secondary-button" type="submit" disabled={role !== "Lab"}>
              Save Lab Decision
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Hospital Approval</h2>
          <form onSubmit={submitHospitalApproval}>
            <input
              placeholder="Request ID"
              type="number"
              value={hospitalAction.requestId}
              onChange={(event) => setHospitalAction({ ...hospitalAction, requestId: event.target.value })}
            />
            <select
              value={String(hospitalAction.approved)}
              onChange={(event) => setHospitalAction({ ...hospitalAction, approved: event.target.value === "true" })}
            >
              <option value="true">Approve</option>
              <option value="false">Reject</option>
            </select>
            <textarea
              placeholder="Hospital remarks"
              value={hospitalAction.remarks}
              onChange={(event) => setHospitalAction({ ...hospitalAction, remarks: event.target.value })}
            />
            <button className="secondary-button" type="submit" disabled={role !== "Hospital"}>
              Save Hospital Decision
            </button>
          </form>
        </article>
      </section>

      <section className="panel">
        <div className="request-header">
          <div>
            <h2>On-Chain Requests</h2>
            <p className="panel-copy">Refresh after each MetaMask transaction to see current workflow state.</p>
          </div>
          <button className="secondary-button" onClick={refreshRequests} disabled={!contract}>
            Refresh
          </button>
        </div>
        <div className="request-list">
          {requests.length === 0 ? (
            <p className="empty-state">No requests yet.</p>
          ) : (
            requests.map((request) => (
              <article className="request-card" key={request.id.toString()}>
                <div className="request-topline">
                  <strong>Request #{request.id.toString()}</strong>
                  <span className={`pill status-${request.status}`}>{statusLabels[Number(request.status)]}</span>
                </div>
                <p>{request.patientName}, age {request.age.toString()}</p>
                <p>Blood Group: {request.bloodGroup}</p>
                <p>Units Required: {request.unitsRequired.toString()}</p>
                <p>Patient Wallet: {request.patient}</p>
                <p>Contact Ref: {request.contactReference}</p>
                <p>Medical Ref: {request.medicalReference}</p>
                <p>Lab Verifier: {request.labVerifier}</p>
                <p>Lab Remarks: {request.labRemarks || "Pending"}</p>
                <p>Hospital Approver: {request.hospitalApprover}</p>
                <p>Hospital Remarks: {request.hospitalRemarks || "Pending"}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="request-header">
          <div>
            <h2>Activity Log</h2>
            <p className="panel-copy">Shows every contract transaction emitted by this app.</p>
          </div>
        </div>
        <div className="request-list">
          {activityLog.length === 0 ? (
            <p className="empty-state">No transactions found yet.</p>
          ) : (
            activityLog.map((activity) => (
              <article className="request-card" key={activity.id}>
                <div className="request-topline">
                  <strong>{activity.type}</strong>
                  <span className="pill status-2">Request #{activity.requestId}</span>
                </div>
                <p>Actor: {activity.actor}</p>
                <p>Outcome: {activity.outcome}</p>
                <p>Block: {activity.blockNumber}</p>
                <p>Tx Hash: {activity.txHash}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
