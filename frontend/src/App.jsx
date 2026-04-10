import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { bloodGroups, contractAbi, contractAddress, statusLabels } from "./contract";

const emptyPatientForm = { patientName: "", age: "", bloodGroup: "O+", unitsRequired: "", contactReference: "", medicalReference: "" };
const emptyRoleForm = { address: "", allowed: true };
const emptyInventoryForm = { bloodGroup: "O+", unitsAvailable: "" };
const emptyReviewForm = { requestId: "", approved: true, remarks: "" };
const defaultContractAddress = "0x0000000000000000000000000000000000000000";
const addressPattern = /0x[a-fA-F0-9]{40}/;

const rolePages = {
  Admin: ["overview", "admin", "lifecycle", "blockchain"],
  Patient: ["overview", "patient", "blockchain"],
  Lab: ["overview", "lab", "blockchain"],
  "Blood Bank": ["overview", "bloodbank", "blockchain"],
  Hospital: ["overview", "hospital", "blockchain"],
  Observer: ["overview", "patient", "blockchain"]
};

const pageMeta = {
  overview: { label: "Overview", hint: "Role snapshot" },
  admin: { label: "Admin", hint: "Access and oversight" },
  lifecycle: { label: "Lifecycle", hint: "All requests" },
  patient: { label: "Patient", hint: "Create and track" },
  lab: { label: "Lab", hint: "Medical verification" },
  bloodbank: { label: "Blood Bank", hint: "Inventory and availability" },
  hospital: { label: "Hospital", hint: "Final approval" },
  blockchain: { label: "Blockchain", hint: "Visual chain view" }
};

const pagePaths = {
  overview: "/",
  admin: "/admin",
  lifecycle: "/lifecycle",
  patient: "/patient",
  lab: "/lab",
  bloodbank: "/blood-bank",
  hospital: "/hospital",
  blockchain: "/blockchain"
};

function getPageFromPath(pathname) {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const match = Object.entries(pagePaths).find(([, path]) => path === normalized);
  return match ? match[0] : "overview";
}

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

function formatRole(role) {
  return role === "Observer" ? "Observer" : role;
}

function pageTitle(page) {
  return page === "bloodbank" ? "Blood Bank" : pageMeta[page]?.label || "Overview";
}

function App() {
  const [account, setAccount] = useState("");
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [role, setRole] = useState("Observer");
  const [activePage, setActivePage] = useState(() => getPageFromPath(window.location.pathname));
  const [roleFlags, setRoleFlags] = useState({ isAdmin: false, isPatient: false, isLab: false, isBloodBank: false, isHospital: false });
  const [requests, setRequests] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [inventory, setInventory] = useState({});
  const [statusMessage, setStatusMessage] = useState("Connect MetaMask to begin.");
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [labForm, setLabForm] = useState(emptyRoleForm);
  const [bloodBankRoleForm, setBloodBankRoleForm] = useState(emptyRoleForm);
  const [hospitalForm, setHospitalForm] = useState(emptyRoleForm);
  const [inventoryForm, setInventoryForm] = useState(emptyInventoryForm);
  const [labReviewForm, setLabReviewForm] = useState(emptyReviewForm);
  const [bloodBankReviewForm, setBloodBankReviewForm] = useState(emptyReviewForm);
  const [hospitalReviewForm, setHospitalReviewForm] = useState(emptyReviewForm);

  const availablePages = rolePages[role] || rolePages.Observer;

  function navigateTo(page, replace = false) {
    const targetPath = pagePaths[page] || "/";
    if (window.location.pathname !== targetPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({}, "", targetPath);
    }
    setActivePage(page);
  }

  const derived = useMemo(() => {
    const pendingLab = requests.filter((request) => Number(request.status) === 0);
    const pendingBloodBank = requests.filter((request) => Number(request.status) === 1);
    const unavailable = requests.filter((request) => Number(request.status) === 2);
    const pendingHospital = requests.filter((request) => Number(request.status) === 3);
    const approved = requests.filter((request) => Number(request.status) === 4);
    const rejected = requests.filter((request) => Number(request.status) === 5);
    const myRequests = account ? requests.filter((request) => ethers.getAddress(request.patient) === account) : [];

    return {
      pendingLab,
      pendingBloodBank,
      unavailable,
      pendingHospital,
      approved,
      rejected,
      myRequests
    };
  }, [account, requests]);

  function resetWalletState(message) {
    setAccount("");
    setProvider(null);
    setContract(null);
    setRole("Observer");
    navigateTo("overview", true);
    setRoleFlags({ isAdmin: false, isPatient: false, isLab: false, isBloodBank: false, isHospital: false });
    setRequests([]);
    setActivityLog([]);
    setInventory({});
    setStatusMessage(message);
  }

  async function createRegistry(currentProvider) {
    return new ethers.Contract(contractAddress, contractAbi, await currentProvider.getSigner());
  }

  async function loadInventory(registry) {
    const entries = await Promise.all(
      bloodGroups.map(async (group) => [group, Number(await registry.getInventory(group))])
    );
    setInventory(Object.fromEntries(entries));
  }

  async function loadActivity(registry) {
    const [labUpdatedEvents, bloodBankUpdatedEvents, hospitalUpdatedEvents, inventoryEvents, patientEvents, labEvents, bloodBankEvents, hospitalEvents] = await Promise.all([
      registry.queryFilter(registry.filters.LabUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.BloodBankUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.HospitalUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.InventoryUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.PatientRegistered(), 0, "latest"),
      registry.queryFilter(registry.filters.LabVerificationCompleted(), 0, "latest"),
      registry.queryFilter(registry.filters.BloodBankAvailabilityChecked(), 0, "latest"),
      registry.queryFilter(registry.filters.HospitalApprovalCompleted(), 0, "latest")
    ]);

    const activity = [
      ...labUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Lab access updated", requestId: "-", actor: event.args.lab, outcome: event.args.allowed ? "Lab enabled" : "Lab revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...bloodBankUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Blood bank access updated", requestId: "-", actor: event.args.bloodBank, outcome: event.args.allowed ? "Blood bank enabled" : "Blood bank revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...hospitalUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Hospital access updated", requestId: "-", actor: event.args.hospital, outcome: event.args.allowed ? "Hospital enabled" : "Hospital revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...inventoryEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Inventory", title: "Blood inventory updated", requestId: "-", actor: event.args.bloodBank, outcome: `${event.args.bloodGroup} -> ${event.args.unitsAvailable.toString()} units`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...patientEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Request", title: "Patient request created", requestId: event.args.requestId.toString(), actor: event.args.patient, outcome: `${event.args.bloodGroup} | ${event.args.unitsRequired.toString()} units`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...labEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Lab", title: "Medical validity checked", requestId: event.args.requestId.toString(), actor: event.args.lab, outcome: event.args.approved ? "Verified" : "Rejected", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...bloodBankEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Blood Bank", title: "Inventory availability checked", requestId: event.args.requestId.toString(), actor: event.args.bloodBank, outcome: event.args.available ? "Available" : "Not available", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...hospitalEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Hospital", title: "Final hospital decision", requestId: event.args.requestId.toString(), actor: event.args.hospital, outcome: event.args.approved ? "Approved" : "Rejected", blockNumber: event.blockNumber, txHash: event.transactionHash }))
    ].sort((left, right) => {
      if (right.blockNumber !== left.blockNumber) {
        return right.blockNumber - left.blockNumber;
      }

      return right.id.localeCompare(left.id);
    });

    setActivityLog(activity);
  }

  async function loadContract(currentProvider, currentAccount) {
    const normalized = ethers.getAddress(currentAccount);
    if (await currentProvider.getCode(contractAddress) === "0x") {
      throw new Error("No contract is deployed at this address on the current network. Run `npm run deploy:local` and update frontend/.env.");
    }

    const registry = await createRegistry(currentProvider);
    const [owner, isLab, isBloodBank, isHospital, allRequests] = await Promise.all([
      registry.owner(),
      registry.isLab(normalized),
      registry.isBloodBank(normalized),
      registry.isHospital(normalized),
      registry.getAllRequests()
    ]);

    const isAdmin = ethers.getAddress(owner) === normalized;
    const isPatient = allRequests.some((request) => ethers.getAddress(request.patient) === normalized);
    const currentRole = isAdmin ? "Admin" : isLab ? "Lab" : isBloodBank ? "Blood Bank" : isHospital ? "Hospital" : isPatient ? "Patient" : "Observer";

    setContract(registry);
    setRole(currentRole);
    setRoleFlags({ isAdmin, isPatient, isLab, isBloodBank, isHospital });
    setRequests(allRequests);
    if (!rolePages[currentRole].includes(activePage)) {
      navigateTo("overview", true);
    }

    await Promise.all([loadInventory(registry), loadActivity(registry)]);
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

  useEffect(() => {
    const onPopState = () => {
      const requestedPage = getPageFromPath(window.location.pathname);
      const fallbackPage = availablePages.includes(requestedPage) ? requestedPage : "overview";
      setActivePage(fallbackPage);
      if (fallbackPage !== requestedPage) {
        window.history.replaceState({}, "", pagePaths[fallbackPage]);
      }
    };

    onPopState();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [availablePages]);

  async function connectWallet() {
    if (!window.ethereum) return setStatusMessage("MetaMask is required in the browser.");
    const currentProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await currentProvider.send("eth_requestAccounts", []);
    await syncWalletState("Wallet connected.", accounts[0]);
  }

  async function refreshData() {
    if (!provider || !account) return;
    await loadContract(provider, account);
    setStatusMessage("Dashboard refreshed.");
  }

  async function submitPatient(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.registerPatient(patientForm.patientName, Number(patientForm.age), patientForm.bloodGroup, Number(patientForm.unitsRequired), patientForm.contactReference, patientForm.medicalReference);
      setStatusMessage("Waiting for patient registration confirmation...");
      await tx.wait();
      setPatientForm(emptyPatientForm);
      await refreshData();
      setStatusMessage("Patient request registered on-chain.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function updateRoleAccess(form, setter, action, label) {
    const target = extractAddress(form.address);
    if (!ethers.isAddress(target)) return setStatusMessage(`Enter a valid ${label.toLowerCase()} wallet address.`);

    try {
      const registry = await getWriteContract();
      const tx = await action(registry, target, form.allowed);
      setStatusMessage(`Waiting for admin to confirm ${label.toLowerCase()} update...`);
      await tx.wait();
      setter(emptyRoleForm);
      await refreshData();
      setStatusMessage(`${label} access updated for ${shortAddress(target)}.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitInventory(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.updateInventory(inventoryForm.bloodGroup, Number(inventoryForm.unitsAvailable));
      setStatusMessage("Updating blood bank inventory...");
      await tx.wait();
      setInventoryForm(emptyInventoryForm);
      await refreshData();
      setStatusMessage(`Inventory updated for ${inventoryForm.bloodGroup}.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitLabReview(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.verifyByLab(Number(labReviewForm.requestId), labReviewForm.approved, labReviewForm.remarks);
      setStatusMessage("Waiting for lab verification...");
      await tx.wait();
      setLabReviewForm(emptyReviewForm);
      await refreshData();
      setStatusMessage("Lab decision saved.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitBloodBankReview(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.checkAvailability(Number(bloodBankReviewForm.requestId), bloodBankReviewForm.approved, bloodBankReviewForm.remarks);
      setStatusMessage("Checking blood availability...");
      await tx.wait();
      setBloodBankReviewForm(emptyReviewForm);
      await refreshData();
      setStatusMessage("Blood bank decision saved.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitHospitalReview(event) {
    event.preventDefault();
    try {
      const registry = await getWriteContract();
      const tx = await registry.approveByHospital(Number(hospitalReviewForm.requestId), hospitalReviewForm.approved, hospitalReviewForm.remarks);
      setStatusMessage("Waiting for hospital approval...");
      await tx.wait();
      setHospitalReviewForm(emptyReviewForm);
      await refreshData();
      setStatusMessage("Hospital decision saved.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  function renderRequestCards(list, emptyLabel) {
    if (!list.length) return <p className="empty-state">{emptyLabel}</p>;

    return (
      <div className="record-grid">
        {list.map((request) => (
          <article className="record-card" key={request.id.toString()}>
            <div className="record-head">
              <div>
                <p className="record-kicker">Request #{request.id.toString()}</p>
                <h3>{request.patientName}</h3>
              </div>
              <span className={`status-badge status-${Number(request.status)}`}>{statusLabels[Number(request.status)]}</span>
            </div>
            <div className="record-meta">
              <span>{request.bloodGroup}</span>
              <span>{request.unitsRequired.toString()} unit(s)</span>
              <span>Age {request.age.toString()}</span>
            </div>
            <p>Patient: {shortAddress(request.patient)}</p>
            <p>Lab: {request.labRemarks || "Pending"}</p>
            <p>Blood Bank: {request.bloodBankRemarks || "Pending"}</p>
            <p>Hospital: {request.hospitalRemarks || "Pending"}</p>
            <p>Reserved Units: {request.reservedUnits.toString()}</p>
          </article>
        ))}
      </div>
    );
  }

  function renderSmartPanel() {
    if (role === "Admin") {
      return (
        <article className="glass-card smart-panel">
          <div className="panel-topline">
            <div>
              <p className="section-kicker">Smart Panel</p>
              <h2>Governance control</h2>
            </div>
            <span className="signal-dot signal-green">Live</span>
          </div>
          <p className="panel-copy">Control trusted institutions, inspect lifecycle bottlenecks, and monitor inventory health across the network.</p>
          <div className="smart-list">
            <div><span>Authorized labs</span><strong>{roleFlags.isAdmin ? "Managed here" : "-"}</strong></div>
            <div><span>Critical unavailable requests</span><strong>{derived.unavailable.length}</strong></div>
            <div><span>Approved requests</span><strong>{derived.approved.length}</strong></div>
          </div>
        </article>
      );
    }

    if (role === "Lab") {
      return (
        <article className="glass-card smart-panel">
          <div className="panel-topline">
            <div>
              <p className="section-kicker">Smart Panel</p>
              <h2>Verification queue</h2>
            </div>
            <span className="signal-dot signal-yellow">Pending</span>
          </div>
          <p className="panel-copy">Focus on validating urgent requests so blood banks only receive medically cleared cases.</p>
          <div className="smart-list">
            <div><span>Pending verification</span><strong>{derived.pendingLab.length}</strong></div>
            <div><span>Rejected cases</span><strong>{derived.rejected.length}</strong></div>
          </div>
        </article>
      );
    }

    if (role === "Blood Bank") {
      return (
        <article className="glass-card smart-panel">
          <div className="panel-topline">
            <div>
              <p className="section-kicker">Smart Panel</p>
              <h2>Inventory command</h2>
            </div>
            <span className="signal-dot signal-aqua">Stock</span>
          </div>
          <p className="panel-copy">Keep live stock aligned with verified demand and reserve units only for approved clinical need.</p>
          <div className="smart-list">
            <div><span>Pending stock checks</span><strong>{derived.pendingBloodBank.length}</strong></div>
            <div><span>O+ units</span><strong>{inventory["O+"] ?? 0}</strong></div>
          </div>
        </article>
      );
    }

    if (role === "Hospital") {
      return (
        <article className="glass-card smart-panel">
          <div className="panel-topline">
            <div>
              <p className="section-kicker">Smart Panel</p>
              <h2>Approval readiness</h2>
            </div>
            <span className="signal-dot signal-green">Ready</span>
          </div>
          <p className="panel-copy">Approve only requests with confirmed medical validity and reserved stock availability.</p>
          <div className="smart-list">
            <div><span>Pending final approvals</span><strong>{derived.pendingHospital.length}</strong></div>
            <div><span>Approved today</span><strong>{derived.approved.length}</strong></div>
          </div>
        </article>
      );
    }

    if (role === "Patient") {
      return (
        <article className="glass-card smart-panel">
          <div className="panel-topline">
            <div>
              <p className="section-kicker">Smart Panel</p>
              <h2>Your request status</h2>
            </div>
            <span className="signal-dot signal-yellow">Tracking</span>
          </div>
          <p className="panel-copy">Create a request and follow it through medical review, stock confirmation, and hospital approval.</p>
          <div className="smart-list">
            <div><span>My requests</span><strong>{derived.myRequests.length}</strong></div>
            <div><span>Approved</span><strong>{derived.myRequests.filter((item) => Number(item.status) === 4).length}</strong></div>
          </div>
        </article>
      );
    }

    return (
      <article className="glass-card smart-panel">
        <div className="panel-topline">
          <div>
            <p className="section-kicker">Smart Panel</p>
            <h2>Observer mode</h2>
          </div>
          <span className="signal-dot signal-red">Limited</span>
        </div>
        <p className="panel-copy">Connect a role-enabled wallet or submit your first request to unlock more operational controls.</p>
      </article>
    );
  }

  function renderBlockchain() {
    if (!activityLog.length) return <p className="empty-state">No blockchain activity yet.</p>;

    return (
      <div className="chain-timeline">
        {activityLog.map((item) => (
          <article className="chain-row" key={item.id}>
            <div className="chain-node">
              <div className="chain-cap">Block {item.blockNumber}</div>
              <div className="chain-line" />
            </div>
            <article className="chain-block">
              <div className="chain-block-top">
                <h3>{item.stage}</h3>
                <span className="header-pill">{item.requestId === "-" ? "System" : `Request #${item.requestId}`}</span>
              </div>
              <p className="chain-title">{item.title}</p>
              <p>Actor: {item.actor}</p>
              <p>Outcome: {item.outcome}</p>
              <p className="tx-hash">Tx Hash: {item.txHash}</p>
            </article>
          </article>
        ))}
      </div>
    );
  }

  function renderOverview() {
    const cards = [
      { label: "Total Requests", value: requests.length, tone: "warm" },
      { label: "Pending Lab", value: derived.pendingLab.length, tone: "gold" },
      { label: "Pending Blood Bank", value: derived.pendingBloodBank.length, tone: "mint" },
      { label: "Pending Hospital", value: derived.pendingHospital.length, tone: "sky" }
    ];

    return (
      <>
        <section className="bento-grid">
          <article className="glass-card pulse-card">
            <div className="panel-topline">
              <div>
                <p className="section-kicker">System Pulse</p>
                <h2>Every blood request, verified and coordinated in one trusted flow.</h2>
              </div>
              <span className="signal-dot signal-green">Active</span>
            </div>
            <p className="hero-text">Bring patient intake, lab validation, blood availability, and hospital approval into a single operational control center.</p>
            <div className="pulse-body">
              <div className="pulse-visual">
                <div className="pulse-ring pulse-ring-one" />
                <div className="pulse-ring pulse-ring-two" />
                <div className="pulse-core">
                  <strong>{requests.length}</strong>
                  <span>Live Cases</span>
                </div>
              </div>
              <div className="pulse-stats">
                <div><span>Active verifications</span><strong>{derived.pendingLab.length + derived.pendingBloodBank.length + derived.pendingHospital.length}</strong></div>
                <div><span>Approval rate</span><strong>{requests.length ? `${Math.round((derived.approved.length / requests.length) * 100)}%` : "0%"}</strong></div>
              </div>
            </div>
          </article>

          <article className="glass-card wallet-spotlight">
            <div className="panel-topline">
              <div>
                <p className="section-kicker">Connected Wallet</p>
                <h2>{shortAddress(account)}</h2>
              </div>
            </div>
            <p className="hero-sidecopy">Current role: {formatRole(role)}</p>
            <div className="role-chip-row">
              {Object.entries(roleFlags).filter(([, value]) => value).map(([key]) => <span className="role-chip" key={key}>{key.replace("is", "")}</span>)}
            </div>
            <button className="secondary-button subtle-button" onClick={refreshData} disabled={!contract}>Refresh Dashboard</button>
          </article>

          <article className="glass-card flow-card">
            <div className="panel-topline">
              <div>
                <p className="section-kicker">Request Flow Timeline</p>
                <h2>Operational pipeline</h2>
              </div>
            </div>
            <div className="flow-track">
              {[
                { label: "Patient", count: requests.length, tone: "signal-aqua" },
                { label: "Lab", count: derived.pendingLab.length, tone: "signal-yellow" },
                { label: "Blood Bank", count: derived.pendingBloodBank.length, tone: "signal-yellow" },
                { label: "Hospital", count: derived.pendingHospital.length, tone: "signal-green" }
              ].map((item, index) => (
                <div className="flow-stage" key={item.label}>
                  <div className={`flow-dot ${item.tone}`} />
                  <strong>{item.count}</strong>
                  <span>{item.label}</span>
                  {index < 3 ? <div className="flow-line" /> : null}
                </div>
              ))}
            </div>
          </article>

          <article className="glass-card activity-card">
            <div className="panel-topline">
              <div>
                <p className="section-kicker">Live Activity Feed</p>
                <h2>Recent network actions</h2>
              </div>
            </div>
            <div className="activity-feed">
              {activityLog.slice(0, 5).map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-stage">{item.stage}</span>
                  <p>{item.title}</p>
                  <small>{item.requestId === "-" ? item.outcome : `Request #${item.requestId} • ${item.outcome}`}</small>
                </div>
              ))}
            </div>
          </article>

          {renderSmartPanel()}
        </section>

        <section className="summary-grid">
          {cards.map((card) => (
            <article className={`summary-card glass-card tone-${card.tone}`} key={card.label}>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>
      </>
    );
  }

  function renderAdmin() {
    return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Role Governance</p><h2>Authorize ecosystem wallets</h2></div><span className="header-pill">Admin only</span></div>
          <form onSubmit={(event) => { event.preventDefault(); }}>
            <label>Lab wallet</label>
            <input value={labForm.address} placeholder="0x..." onChange={(event) => setLabForm({ ...labForm, address: extractAddress(event.target.value) })} />
            <select value={String(labForm.allowed)} onChange={(event) => setLabForm({ ...labForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
            <button className="primary-button" type="button" disabled={role !== "Admin"} onClick={() => updateRoleAccess(labForm, setLabForm, (registry, target, allowed) => registry.setLab(target, allowed), "Lab")}>Update Lab Access</button>
            <label>Blood bank wallet</label>
            <input value={bloodBankRoleForm.address} placeholder="0x..." onChange={(event) => setBloodBankRoleForm({ ...bloodBankRoleForm, address: extractAddress(event.target.value) })} />
            <select value={String(bloodBankRoleForm.allowed)} onChange={(event) => setBloodBankRoleForm({ ...bloodBankRoleForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
            <button className="primary-button" type="button" disabled={role !== "Admin"} onClick={() => updateRoleAccess(bloodBankRoleForm, setBloodBankRoleForm, (registry, target, allowed) => registry.setBloodBank(target, allowed), "Blood Bank")}>Update Blood Bank Access</button>
            <label>Hospital wallet</label>
            <input value={hospitalForm.address} placeholder="0x..." onChange={(event) => setHospitalForm({ ...hospitalForm, address: extractAddress(event.target.value) })} />
            <select value={String(hospitalForm.allowed)} onChange={(event) => setHospitalForm({ ...hospitalForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
            <button className="primary-button" type="button" disabled={role !== "Admin"} onClick={() => updateRoleAccess(hospitalForm, setHospitalForm, (registry, target, allowed) => registry.setHospital(target, allowed), "Hospital")}>Update Hospital Access</button>
          </form>
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Operational View</p><h2>System-wide inventory snapshot</h2></div><span className="header-pill">Admin only</span></div>
          <div className="inventory-grid">{bloodGroups.map((group) => <article className="inventory-card" key={group}><span>{group}</span><strong>{inventory[group] ?? 0}</strong><small>units</small></article>)}</div>
        </article>
      </section>
    );
  }

  function renderLifecycle() {
    return (
      <section className="surface-card full-width-card">
        <div className="section-header"><div><p className="section-kicker">Full Lifecycle</p><h2>All requests across every stage</h2></div><span className="header-pill">{requests.length} total</span></div>
        {renderRequestCards(requests, "No requests found.")}
      </section>
    );
  }

  function renderPatient() {
    return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Patient Intake</p><h2>Create a new blood request</h2></div><span className="header-pill">Patient only</span></div>
          <form onSubmit={submitPatient}>
            <label>Patient name</label><input value={patientForm.patientName} placeholder="Patient name" onChange={(event) => setPatientForm({ ...patientForm, patientName: event.target.value })} />
            <label>Age</label><input value={patientForm.age} type="number" placeholder="Age" onChange={(event) => setPatientForm({ ...patientForm, age: event.target.value })} />
            <label>Blood group</label><select value={patientForm.bloodGroup} onChange={(event) => setPatientForm({ ...patientForm, bloodGroup: event.target.value })}>{bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
            <label>Units required</label><input value={patientForm.unitsRequired} type="number" placeholder="Units required" onChange={(event) => setPatientForm({ ...patientForm, unitsRequired: event.target.value })} />
            <label>Contact reference</label><input value={patientForm.contactReference} placeholder="Contact reference" onChange={(event) => setPatientForm({ ...patientForm, contactReference: event.target.value })} />
            <label>Medical reference</label><textarea value={patientForm.medicalReference} placeholder="Medical reference" onChange={(event) => setPatientForm({ ...patientForm, medicalReference: event.target.value })} />
            <button className="primary-button" type="submit" disabled={!contract}>Create Request</button>
          </form>
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">My Requests</p><h2>Track your own lifecycle</h2></div><span className="header-pill">{derived.myRequests.length} request(s)</span></div>
          {renderRequestCards(derived.myRequests, "This wallet has not created any requests yet.")}
        </article>
      </section>
    );
  }

  function renderLab() {
    return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Medical Verification</p><h2>Requests waiting for lab validation</h2></div><span className="header-pill">{derived.pendingLab.length} pending</span></div>
          {renderRequestCards(derived.pendingLab, "No requests are waiting for lab verification.")}
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Lab Decision</p><h2>Verify clinical validity</h2></div><span className="header-pill">Lab only</span></div>
          <form onSubmit={submitLabReview}>
            <label>Request ID</label><input value={labReviewForm.requestId} type="number" placeholder="Request ID" onChange={(event) => setLabReviewForm({ ...labReviewForm, requestId: event.target.value })} />
            <label>Decision</label><select value={String(labReviewForm.approved)} onChange={(event) => setLabReviewForm({ ...labReviewForm, approved: event.target.value === "true" })}><option value="true">Verify</option><option value="false">Reject</option></select>
            <label>Remarks</label><textarea value={labReviewForm.remarks} placeholder="Medical notes" onChange={(event) => setLabReviewForm({ ...labReviewForm, remarks: event.target.value })} />
            <button className="primary-button" type="submit" disabled={role !== "Lab"}>Save Lab Decision</button>
          </form>
        </article>
      </section>
    );
  }

  function renderBloodBank() {
    return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Inventory Operations</p><h2>Manage blood stock</h2></div><span className="header-pill">Blood bank only</span></div>
          <div className="inventory-grid">{bloodGroups.map((group) => <article className="inventory-card" key={group}><span>{group}</span><strong>{inventory[group] ?? 0}</strong><small>units available</small></article>)}</div>
          <form onSubmit={submitInventory}>
            <label>Blood group</label><select value={inventoryForm.bloodGroup} onChange={(event) => setInventoryForm({ ...inventoryForm, bloodGroup: event.target.value })}>{bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
            <label>Units available</label><input value={inventoryForm.unitsAvailable} type="number" placeholder="Available units" onChange={(event) => setInventoryForm({ ...inventoryForm, unitsAvailable: event.target.value })} />
            <button className="primary-button" type="submit" disabled={role !== "Blood Bank"}>Update Inventory</button>
          </form>
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Availability Review</p><h2>Check stock for verified requests</h2></div><span className="header-pill">{derived.pendingBloodBank.length} pending</span></div>
          {renderRequestCards(derived.pendingBloodBank, "No requests are waiting for blood bank review.")}
          <form onSubmit={submitBloodBankReview}>
            <label>Request ID</label><input value={bloodBankReviewForm.requestId} type="number" placeholder="Request ID" onChange={(event) => setBloodBankReviewForm({ ...bloodBankReviewForm, requestId: event.target.value })} />
            <label>Availability</label><select value={String(bloodBankReviewForm.approved)} onChange={(event) => setBloodBankReviewForm({ ...bloodBankReviewForm, approved: event.target.value === "true" })}><option value="true">Available</option><option value="false">Not available</option></select>
            <label>Remarks</label><textarea value={bloodBankReviewForm.remarks} placeholder="Availability remarks" onChange={(event) => setBloodBankReviewForm({ ...bloodBankReviewForm, remarks: event.target.value })} />
            <button className="primary-button" type="submit" disabled={role !== "Blood Bank"}>Save Blood Bank Decision</button>
          </form>
        </article>
      </section>
    );
  }

  function renderHospital() {
    return (
      <section className="content-grid two-up">
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Final Approval Queue</p><h2>Requests with reserved blood units</h2></div><span className="header-pill">{derived.pendingHospital.length} pending</span></div>
          {renderRequestCards(derived.pendingHospital, "No requests are waiting for hospital approval.")}
        </article>
        <article className="surface-card">
          <div className="section-header"><div><p className="section-kicker">Hospital Decision</p><h2>Approve or reject treatment request</h2></div><span className="header-pill">Hospital only</span></div>
          <form onSubmit={submitHospitalReview}>
            <label>Request ID</label><input value={hospitalReviewForm.requestId} type="number" placeholder="Request ID" onChange={(event) => setHospitalReviewForm({ ...hospitalReviewForm, requestId: event.target.value })} />
            <label>Decision</label><select value={String(hospitalReviewForm.approved)} onChange={(event) => setHospitalReviewForm({ ...hospitalReviewForm, approved: event.target.value === "true" })}><option value="true">Approve</option><option value="false">Reject</option></select>
            <label>Remarks</label><textarea value={hospitalReviewForm.remarks} placeholder="Hospital remarks" onChange={(event) => setHospitalReviewForm({ ...hospitalReviewForm, remarks: event.target.value })} />
            <button className="primary-button" type="submit" disabled={role !== "Hospital"}>Save Hospital Decision</button>
          </form>
        </article>
      </section>
    );
  }

  function renderPage() {
    if (activePage === "admin") return renderAdmin();
    if (activePage === "lifecycle") return renderLifecycle();
    if (activePage === "patient") return renderPatient();
    if (activePage === "lab") return renderLab();
    if (activePage === "bloodbank") return renderBloodBank();
    if (activePage === "hospital") return renderHospital();
    if (activePage === "blockchain") {
      return (
        <section className="surface-card full-width-card">
          <div className="section-header"><div><p className="section-kicker">Blockchain Visualization</p><h2>Lifecycle blocks and audit trail</h2></div><button className="secondary-button compact-button" onClick={refreshData} disabled={!contract}>Refresh chain</button></div>
          {renderBlockchain()}
        </section>
      );
    }
    return renderOverview();
  }

  return (
    <div className="control-shell">
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />
      <header className="topbar glass-card">
        <div className="topbar-brand">
          <div className="logo-mark">B</div>
          <div>
            <p className="eyebrow">Blood Donation Chain</p>
            <h2>BloodFlow Hub</h2>
          </div>
        </div>
        <div className="topbar-center">
          {availablePages.map((pageId) => (
            <button className={`topbar-tab ${activePage === pageId ? "topbar-tab-active" : ""}`} key={pageId} onClick={() => navigateTo(pageId)} type="button">
              {pageTitle(pageId)}
            </button>
          ))}
        </div>
        <div className="topbar-actions">
          <span className="wallet-pill">{shortAddress(account)}</span>
          <span className="wallet-pill">{formatRole(role)}</span>
          <span className="icon-pill">••</span>
          <button className="avatar-pill" onClick={connectWallet} type="button">{account ? "Reconnect Wallet" : "Connect"}</button>
        </div>
      </header>

      <main className="workspace">
        <header className="workspace-header">
          <div><p className="section-kicker">Role Dashboard</p><h1>{pageMeta[activePage].label}</h1></div>
          <div className="header-actions"><span className="network-chip">Local Hardhat</span><span className="contract-chip">{shortAddress(contractAddress)}</span><span className="status-inline">{statusMessage}</span></div>
        </header>
        {renderPage()}
      </main>

      <div className="floating-actions glass-card">
        <p className="section-kicker">Quick Actions</p>
        <button className="fab-action" onClick={() => navigateTo("patient")} type="button">Create request</button>
        <button className="fab-action" onClick={() => navigateTo("lab")} type="button">Verify</button>
        <button className="fab-action" onClick={() => navigateTo("hospital")} type="button">Approve</button>
      </div>
    </div>
  );
}

export default App;
