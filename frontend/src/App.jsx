import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { contractAbi, contractAddress, statusLabels } from "./contract";

const emptyPatientForm = { patientName: "", age: "", bloodGroup: "O+", unitsRequired: "", contactReference: "", medicalReference: "" };
const emptyRoleForm = { address: "", allowed: true };
const emptyActionForm = { requestId: "", approved: true, remarks: "" };
const defaultContractAddress = "0x0000000000000000000000000000000000000000";
const addressPattern = /0x[a-fA-F0-9]{40}/;
const pages = [
  { id: "overview", label: "Overview", hint: "Network pulse" },
  { id: "admin", label: "Admin", hint: "Access control" },
  { id: "patient", label: "Patient", hint: "Registration" },
  { id: "lab", label: "Lab", hint: "Clinical review" },
  { id: "hospital", label: "Hospital", hint: "Final approval" },
  { id: "activity", label: "Activity", hint: "All transactions" }
];

function extractAddress(value) {
  const match = value.match(addressPattern);
  return match ? match[0] : value.trim();
}

function getErrorMessage(error) {
  return error?.shortMessage || error?.reason || error?.info?.error?.message || error?.error?.message || error?.message || "Transaction failed.";
}

function shortAddress(value) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function statusClass(status) {
  return `status-badge status-${Number(status)}`;
}

function App() {
  const [account, setAccount] = useState("");
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [role, setRole] = useState("Guest");
  const [activePage, setActivePage] = useState("overview");
  const [roleFlags, setRoleFlags] = useState({ isAdmin: false, isPatient: false, isLab: false, isHospital: false });
  const [requests, setRequests] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [labForm, setLabForm] = useState(emptyRoleForm);
  const [hospitalForm, setHospitalForm] = useState(emptyRoleForm);
  const [labAction, setLabAction] = useState(emptyActionForm);
  const [hospitalAction, setHospitalAction] = useState(emptyActionForm);
  const [statusMessage, setStatusMessage] = useState("Connect MetaMask to begin.");

  const derived = useMemo(() => {
    const pendingLab = requests.filter((r) => Number(r.status) === 0);
    const labVerified = requests.filter((r) => Number(r.status) === 1);
    const approved = requests.filter((r) => Number(r.status) === 2);
    const myRequests = account ? requests.filter((r) => ethers.getAddress(r.patient) === account) : [];
    return { pendingLab, labVerified, approved, myRequests };
  }, [account, requests]);

  function resetWalletState(message) {
    setAccount("");
    setProvider(null);
    setContract(null);
    setRole("Guest");
    setRoleFlags({ isAdmin: false, isPatient: false, isLab: false, isHospital: false });
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
    const items = [
      ...patientEvents.map((e) => ({ id: `${e.transactionHash}-${e.index}`, type: "Patient Registered", requestId: e.args.requestId.toString(), actor: e.args.patient, outcome: `${e.args.bloodGroup} | ${e.args.unitsRequired.toString()} unit(s)`, blockNumber: e.blockNumber, txHash: e.transactionHash })),
      ...labEvents.map((e) => ({ id: `${e.transactionHash}-${e.index}`, type: "Lab Verification", requestId: e.args.requestId.toString(), actor: e.args.lab, outcome: e.args.approved ? "Approved" : "Rejected", blockNumber: e.blockNumber, txHash: e.transactionHash })),
      ...hospitalEvents.map((e) => ({ id: `${e.transactionHash}-${e.index}`, type: "Hospital Approval", requestId: e.args.requestId.toString(), actor: e.args.hospital, outcome: e.args.approved ? "Approved" : "Rejected", blockNumber: e.blockNumber, txHash: e.transactionHash }))
    ].sort((a, b) => (b.blockNumber - a.blockNumber) || b.txHash.localeCompare(a.txHash));
    setActivityLog(items);
  }

  async function createRegistry(currentProvider) {
    return new ethers.Contract(contractAddress, contractAbi, await currentProvider.getSigner());
  }

  async function loadContract(currentProvider, currentAccount) {
    const normalized = ethers.getAddress(currentAccount);
    if (await currentProvider.getCode(contractAddress) === "0x") {
      throw new Error("No contract is deployed at this address on the current network. Run `npm run deploy:local` and update frontend/.env.");
    }
    const registry = await createRegistry(currentProvider);
    const [owner, isLab, isHospital, allRequests] = await Promise.all([
      registry.owner(),
      registry.isLab(normalized),
      registry.isHospital(normalized),
      registry.getAllRequests()
    ]);
    const isAdmin = ethers.getAddress(owner) === normalized;
    const isPatient = allRequests.some((r) => ethers.getAddress(r.patient) === normalized);
    const currentRole = isAdmin ? "Admin" : isLab ? "Lab" : isHospital ? "Hospital" : isPatient ? "Patient" : "Unassigned";
    setContract(registry);
    setRole(currentRole);
    setRoleFlags({ isAdmin, isPatient, isLab, isHospital });
    setRequests(allRequests);
    await loadActivity(registry);
  }

  async function syncWalletState(message, explicitAccount) {
    if (contractAddress === defaultContractAddress) return resetWalletState("Set VITE_CONTRACT_ADDRESS in frontend/.env before connecting.");
    if (!window.ethereum) return resetWalletState("MetaMask is required in the browser.");
    const currentProvider = new ethers.BrowserProvider(window.ethereum);
    try {
      let currentAccount = explicitAccount ? ethers.getAddress(explicitAccount) : "";
      if (!currentAccount) {
        const accounts = await currentProvider.send("eth_accounts", []);
        if (!accounts.length) return resetWalletState("Wallet disconnected.");
        currentAccount = ethers.getAddress(await (await currentProvider.getSigner()).getAddress());
      }
      setProvider(currentProvider);
      setAccount(currentAccount);
      await loadContract(currentProvider, currentAccount);
      setStatusMessage(message);
    } catch (error) {
      resetWalletState(getErrorMessage(error));
    }
  }

  async function getWriteContract() {
    if (!provider || !account) throw new Error("Connect MetaMask first.");
    return createRegistry(provider);
  }

  useEffect(() => {
    if (!window.ethereum) return undefined;
    const onAccountsChanged = async (accounts) => !accounts.length ? resetWalletState("Wallet disconnected.") : syncWalletState("Wallet account changed.", accounts[0]);
    const onChainChanged = async () => syncWalletState("Wallet network changed.");
    syncWalletState("Wallet detected.").catch(() => {});
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  async function connectWallet() {
    if (!window.ethereum) return setStatusMessage("MetaMask is required in the browser.");
    const currentProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await currentProvider.send("eth_requestAccounts", []);
    await syncWalletState("Wallet connected.", accounts[0]);
  }

  async function refreshRequests() {
    if (provider && account) {
      await loadContract(provider, account);
      setStatusMessage("Dashboard refreshed.");
    }
  }

  async function submitPatient(event) {
    event.preventDefault();
    try {
      const tx = await (await getWriteContract()).registerPatient(patientForm.patientName, Number(patientForm.age), patientForm.bloodGroup, Number(patientForm.unitsRequired), patientForm.contactReference, patientForm.medicalReference);
      setStatusMessage("Waiting for patient registration confirmation...");
      await tx.wait();
      setPatientForm(emptyPatientForm);
      await refreshRequests();
      setStatusMessage("Patient request registered on-chain.");
    } catch (error) { setStatusMessage(getErrorMessage(error)); }
  }

  async function submitLabRole(event) {
    event.preventDefault();
    try {
      const target = extractAddress(labForm.address);
      if (!ethers.isAddress(target)) return setStatusMessage("Enter a valid lab wallet address.");
      const registry = await getWriteContract();
      const tx = await registry.setLab(target, labForm.allowed);
      setStatusMessage("Waiting for admin to confirm lab update...");
      await tx.wait();
      const confirmed = await registry.isLab(target);
      setLabForm(emptyRoleForm);
      await refreshRequests();
      setStatusMessage(`Lab access ${confirmed ? "confirmed" : "not applied"} for ${shortAddress(target)}.`);
    } catch (error) { setStatusMessage(getErrorMessage(error)); }
  }

  async function submitHospitalRole(event) {
    event.preventDefault();
    try {
      const target = extractAddress(hospitalForm.address);
      if (!ethers.isAddress(target)) return setStatusMessage("Enter a valid hospital wallet address.");
      const registry = await getWriteContract();
      const tx = await registry.setHospital(target, hospitalForm.allowed);
      setStatusMessage("Waiting for admin to confirm hospital update...");
      await tx.wait();
      const confirmed = await registry.isHospital(target);
      setHospitalForm(emptyRoleForm);
      await refreshRequests();
      setStatusMessage(`Hospital access ${confirmed ? "confirmed" : "not applied"} for ${shortAddress(target)}.`);
    } catch (error) { setStatusMessage(getErrorMessage(error)); }
  }

  async function submitLabVerification(event) {
    event.preventDefault();
    try {
      const tx = await (await getWriteContract()).verifyByLab(Number(labAction.requestId), labAction.approved, labAction.remarks);
      setStatusMessage("Waiting for lab verification...");
      await tx.wait();
      setLabAction(emptyActionForm);
      await refreshRequests();
      setStatusMessage("Lab verification saved.");
    } catch (error) { setStatusMessage(getErrorMessage(error)); }
  }

  async function submitHospitalApproval(event) {
    event.preventDefault();
    try {
      const tx = await (await getWriteContract()).approveByHospital(Number(hospitalAction.requestId), hospitalAction.approved, hospitalAction.remarks);
      setStatusMessage("Waiting for hospital approval...");
      await tx.wait();
      setHospitalAction(emptyActionForm);
      await refreshRequests();
      setStatusMessage("Hospital decision saved.");
    } catch (error) { setStatusMessage(getErrorMessage(error)); }
  }

  function renderRequestCards(list, emptyLabel) {
    if (!list.length) return <p className="empty-state">{emptyLabel}</p>;
    return <div className="record-grid">{list.map((request) => (
      <article className="record-card" key={request.id.toString()}>
        <div className="record-head">
          <div><p className="record-kicker">Request #{request.id.toString()}</p><h3>{request.patientName}</h3></div>
          <span className={statusClass(request.status)}>{statusLabels[Number(request.status)]}</span>
        </div>
        <div className="record-meta"><span>Blood {request.bloodGroup}</span><span>{request.unitsRequired.toString()} unit(s)</span><span>Age {request.age.toString()}</span></div>
        <p>Patient Wallet: {request.patient}</p><p>Contact Ref: {request.contactReference}</p><p>Medical Ref: {request.medicalReference}</p>
        <p>Lab Verifier: {request.labVerifier}</p><p>Lab Remarks: {request.labRemarks || "Pending"}</p><p>Hospital Approver: {request.hospitalApprover}</p><p>Hospital Remarks: {request.hospitalRemarks || "Pending"}</p>
      </article>
    ))}</div>;
  }

  function renderActivity() {
    if (!activityLog.length) return <p className="empty-state">No transactions found yet.</p>;
    return <div className="timeline">{activityLog.map((activity) => (
      <article className="timeline-item" key={activity.id}>
        <div className="timeline-dot" />
        <div className="timeline-body">
          <div className="record-head"><div><p className="record-kicker">Request #{activity.requestId}</p><h3>{activity.type}</h3></div><span className="status-badge status-2">{activity.outcome}</span></div>
          <p>Actor: {activity.actor}</p><p>Block: {activity.blockNumber}</p><p className="tx-hash">Tx Hash: {activity.txHash}</p>
        </div>
      </article>
    ))}</div>;
  }

  function pageContent() {
    if (activePage === "admin") return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Access Governance</p><h2>Authorize lab wallets</h2></div><span className="header-pill">Admin only</span></div>
          <p className="section-copy">Grant or revoke lab verification privileges for MetaMask wallets.</p>
          <form onSubmit={submitLabRole}>
            <label>Lab wallet address</label>
            <input placeholder="0x..." value={labForm.address} onChange={(event) => setLabForm({ ...labForm, address: extractAddress(event.target.value) })} />
            <label>Access</label>
            <select value={String(labForm.allowed)} onChange={(event) => setLabForm({ ...labForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
            <button className="primary-button" type="submit" disabled={role !== "Admin"}>Update Lab Access</button>
          </form>
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Access Governance</p><h2>Authorize hospital wallets</h2></div><span className="header-pill">Admin only</span></div>
          <p className="section-copy">Grant or revoke hospital approval privileges for MetaMask wallets.</p>
          <form onSubmit={submitHospitalRole}>
            <label>Hospital wallet address</label>
            <input placeholder="0x..." value={hospitalForm.address} onChange={(event) => setHospitalForm({ ...hospitalForm, address: extractAddress(event.target.value) })} />
            <label>Access</label>
            <select value={String(hospitalForm.allowed)} onChange={(event) => setHospitalForm({ ...hospitalForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
            <button className="primary-button" type="submit" disabled={role !== "Admin"}>Update Hospital Access</button>
          </form>
        </article>
      </section>
    );

    if (activePage === "patient") return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Patient Intake</p><h2>Register a blood request</h2></div><span className="header-pill">Self-service</span></div>
          <p className="section-copy">Submit a new request with medical references instead of raw patient files.</p>
          <form onSubmit={submitPatient}>
            <label>Patient name</label>
            <input placeholder="Patient name" value={patientForm.patientName} onChange={(event) => setPatientForm({ ...patientForm, patientName: event.target.value })} />
            <label>Age</label>
            <input placeholder="Age" type="number" value={patientForm.age} onChange={(event) => setPatientForm({ ...patientForm, age: event.target.value })} />
            <label>Blood group</label>
            <select value={patientForm.bloodGroup} onChange={(event) => setPatientForm({ ...patientForm, bloodGroup: event.target.value })}>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group} value={group}>{group}</option>)}</select>
            <label>Units required</label>
            <input placeholder="Units required" type="number" value={patientForm.unitsRequired} onChange={(event) => setPatientForm({ ...patientForm, unitsRequired: event.target.value })} />
            <label>Contact reference</label>
            <input placeholder="Contact reference or encrypted hash" value={patientForm.contactReference} onChange={(event) => setPatientForm({ ...patientForm, contactReference: event.target.value })} />
            <label>Medical reference</label>
            <textarea placeholder="Medical record reference or IPFS hash" value={patientForm.medicalReference} onChange={(event) => setPatientForm({ ...patientForm, medicalReference: event.target.value })} />
            <button className="primary-button" type="submit" disabled={!contract}>Register Request</button>
          </form>
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Patient Requests</p><h2>Your request history</h2></div><span className="header-pill">{derived.myRequests.length} request(s)</span></div>
          {renderRequestCards(derived.myRequests, "This wallet has not created any requests yet.")}
        </article>
      </section>
    );

    if (activePage === "lab") return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Clinical Verification</p><h2>Requests waiting for lab review</h2></div><span className="header-pill">{derived.pendingLab.length} waiting</span></div>
          {renderRequestCards(derived.pendingLab, "No requests are waiting for lab verification.")}
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Lab Action</p><h2>Record verification decision</h2></div><span className="header-pill">Lab only</span></div>
          <form onSubmit={submitLabVerification}>
            <label>Request ID</label>
            <input placeholder="Request ID" type="number" value={labAction.requestId} onChange={(event) => setLabAction({ ...labAction, requestId: event.target.value })} />
            <label>Decision</label>
            <select value={String(labAction.approved)} onChange={(event) => setLabAction({ ...labAction, approved: event.target.value === "true" })}><option value="true">Verify</option><option value="false">Reject</option></select>
            <label>Lab remarks</label>
            <textarea placeholder="Lab remarks" value={labAction.remarks} onChange={(event) => setLabAction({ ...labAction, remarks: event.target.value })} />
            <button className="primary-button" type="submit" disabled={role !== "Lab"}>Save Lab Decision</button>
          </form>
        </article>
      </section>
    );

    if (activePage === "hospital") return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Hospital Queue</p><h2>Requests awaiting final approval</h2></div><span className="header-pill">{derived.labVerified.length} ready</span></div>
          {renderRequestCards(derived.labVerified, "No requests are ready for hospital approval.")}
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Approval Action</p><h2>Record hospital decision</h2></div><span className="header-pill">Hospital only</span></div>
          <form onSubmit={submitHospitalApproval}>
            <label>Request ID</label>
            <input placeholder="Request ID" type="number" value={hospitalAction.requestId} onChange={(event) => setHospitalAction({ ...hospitalAction, requestId: event.target.value })} />
            <label>Decision</label>
            <select value={String(hospitalAction.approved)} onChange={(event) => setHospitalAction({ ...hospitalAction, approved: event.target.value === "true" })}><option value="true">Approve</option><option value="false">Reject</option></select>
            <label>Hospital remarks</label>
            <textarea placeholder="Hospital remarks" value={hospitalAction.remarks} onChange={(event) => setHospitalAction({ ...hospitalAction, remarks: event.target.value })} />
            <button className="primary-button" type="submit" disabled={role !== "Hospital"}>Save Hospital Decision</button>
          </form>
        </article>
      </section>
    );

    if (activePage === "activity") return (
      <section className="surface-card full-width-card">
        <div className="section-header"><div><p className="section-kicker">Immutable Audit Trail</p><h2>All contract transactions</h2></div><button className="secondary-button compact-button" onClick={refreshRequests} disabled={!contract}>Refresh activity</button></div>
        {renderActivity()}
      </section>
    );

    return (
      <>
        <section className="hero-surface">
          <div className="hero-copyblock">
            <p className="eyebrow">Blood Donation Chain</p>
            <h1>Separate workspaces for every role in the verification lifecycle.</h1>
            <p className="hero-text">Patients submit requests, labs validate them, hospitals approve them, and admins govern trusted wallets through a cleaner healthcare-style dashboard.</p>
          </div>
          <div className="hero-sidecard">
            <p className="mini-label">Connected Wallet</p>
            <h3>{shortAddress(account)}</h3>
            <p className="hero-sidecopy">Current role: {role === "Unassigned" ? "Observer" : role}</p>
            <div className="role-chip-row">{["Admin", "Patient", "Lab", "Hospital"].filter((item) => roleFlags[`is${item}`]).map((item) => <span className="role-chip" key={item}>{item}</span>)}</div>
            <button className="secondary-button subtle-button" onClick={refreshRequests} disabled={!contract}>Refresh Dashboard</button>
          </div>
        </section>
        <section className="summary-grid">
          {[{ label: "Total Requests", value: requests.length, tone: "warm" }, { label: "Pending Lab Review", value: derived.pendingLab.length, tone: "gold" }, { label: "Lab Verified", value: derived.labVerified.length, tone: "mint" }, { label: "Hospital Approved", value: derived.approved.length, tone: "sky" }].map((card) => <article className={`summary-card tone-${card.tone}`} key={card.label}><p>{card.label}</p><strong>{card.value}</strong></article>)}
        </section>
        <section className="content-grid two-up">
          <article className="surface-card">
            <div className="section-header"><div><p className="section-kicker">Priority Queue</p><h2>Requests waiting for clinical review</h2></div><span className="header-pill">{derived.pendingLab.length} open</span></div>
            {renderRequestCards(derived.pendingLab.slice(0, 4), "No pending requests.")}
          </article>
          <article className="surface-card">
            <div className="section-header"><div><p className="section-kicker">Recent Activity</p><h2>Latest contract events</h2></div><button className="secondary-button compact-button" onClick={() => setActivePage("activity")}>Open activity page</button></div>
            {renderActivity()}
          </article>
        </section>
      </>
    );
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Blood Donation Chain</p>
          <h2>Care Network</h2>
          <p className="sidebar-copy">Role-based coordination for patient intake, lab validation, and hospital approval.</p>
        </div>
        <div className="wallet-panel">
          <div><p className="mini-label">Wallet</p><h3>{shortAddress(account)}</h3></div>
          <p className="wallet-role">Current role: {role === "Unassigned" ? "Observer" : role}</p>
          <div className="flag-grid">
            <span className={`flag-pill ${roleFlags.isAdmin ? "active-flag" : ""}`}>Admin</span>
            <span className={`flag-pill ${roleFlags.isPatient ? "active-flag" : ""}`}>Patient</span>
            <span className={`flag-pill ${roleFlags.isLab ? "active-flag" : ""}`}>Lab</span>
            <span className={`flag-pill ${roleFlags.isHospital ? "active-flag" : ""}`}>Hospital</span>
          </div>
          <button className="primary-button connect-button" onClick={connectWallet}>{account ? "Reconnect Wallet" : "Connect MetaMask"}</button>
          <p className="status-banner">{statusMessage}</p>
        </div>
        <nav className="nav-stack">{pages.map((page) => <button className={`nav-item ${activePage === page.id ? "nav-item-active" : ""}`} key={page.id} onClick={() => setActivePage(page.id)} type="button"><span>{page.label}</span><small>{page.hint}</small></button>)}</nav>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div><p className="section-kicker">Operations Dashboard</p><h1>{pages.find((page) => page.id === activePage)?.label || "Overview"}</h1></div>
          <div className="header-actions"><span className="network-chip">Local Hardhat</span><span className="contract-chip">{shortAddress(contractAddress)}</span></div>
        </header>
        {pageContent()}
      </main>
    </div>
  );
}

export default App;
