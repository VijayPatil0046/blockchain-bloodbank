import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { bloodGroups, contractAbi, contractAddress, donationStatusLabels, statusLabels } from "./contract";

const emptyPatientForm = { patientName: "", bloodGroup: "O+", unitsRequired: "", hospitalName: "", urgencyLevel: "Normal" };
const emptyDonorForm = { donorName: "", bloodGroup: "O+", unitsDonated: "", donationDate: "" };
const emptyRoleForm = { address: "", allowed: true };
const emptyInventoryForm = { bloodGroup: "O+", unitsAvailable: "" };
const emptyReviewForm = { requestId: "", approved: true, remarks: "" };
const defaultContractAddress = "0x0000000000000000000000000000000000000000";
const addressPattern = /0x[a-fA-F0-9]{40}/;

const rolePages = {
  Admin: ["overview", "admin", "lifecycle", "blockchain"],
  Donor: ["donor"],
  Patient: ["patient"],
  Lab: ["overview", "lab", "blockchain"],
  "Blood Bank": ["overview", "bloodbank", "blockchain"],
  Hospital: ["overview", "hospital", "blockchain"],
  Observer: ["overview", "patient", "blockchain"]
};

const pageMeta = {
  overview: { label: "Overview", hint: "Role snapshot" },
  admin: { label: "Admin", hint: "Access and oversight" },
  lifecycle: { label: "Lifecycle", hint: "All requests" },
  donor: { label: "Donor", hint: "Donate blood" },
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
  donor: "/donor",
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
  const nestedMessage = error?.data?.message || error?.info?.error?.message || error?.error?.message;
  const revertMatch = nestedMessage?.match(/reverted with reason string ['\"]([^'\"]+)['\"]/i);

  return error?.shortMessage || error?.reason || revertMatch?.[1] || nestedMessage || error?.message || "Transaction failed.";
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

function patientStatusLabel(status) {
  const value = Number(status);
  if (value === 1 || value === 3) return "Verified";
  if (value === 4) return "Approved";
  if (value === 2 || value === 5) return "Rejected";
  return "Pending";
}

function donationStatusLabel(status) {
  return donationStatusLabels[Number(status)] || "Available";
}

function allocationStatusLabel(allocation) {
  return allocation.used ? "Used" : "Assigned";
}

function normalizeDonation(donation) {
  return {
    id: donation.id ?? donation[0],
    donor: donation.donor ?? donation[1],
    donorName: donation.donorName ?? donation[2],
    bloodGroup: donation.bloodGroup ?? donation[3],
    unitsDonated: donation.unitsDonated ?? donation[4],
    unitsAvailable: donation.unitsAvailable ?? donation[5],
    bloodBank: donation.bloodBank ?? donation[6],
    donationDate: donation.donationDate ?? donation[7],
    createdAt: donation.createdAt ?? donation[8],
    status: donation.status ?? donation[9]
  };
}

function normalizeAllocation(allocation) {
  return {
    donationId: allocation.donationId ?? allocation[0],
    requestId: allocation.requestId ?? allocation[1],
    bloodBank: allocation.bloodBank ?? allocation[2],
    patient: allocation.patient ?? allocation[3],
    unitsAllocated: allocation.unitsAllocated ?? allocation[4],
    allocatedAt: allocation.allocatedAt ?? allocation[5],
    used: Boolean(allocation.used ?? allocation[6])
  };
}

function App() {
  const [account, setAccount] = useState("");
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [role, setRole] = useState("Observer");
  const [activePage, setActivePage] = useState(() => getPageFromPath(window.location.pathname));
  const [roleFlags, setRoleFlags] = useState({ isAdmin: false, isDonor: false, isPatient: false, isLab: false, isBloodBank: false, isHospital: false });
  const [requests, setRequests] = useState([]);
  const [donations, setDonations] = useState([]);
  const [bloodBanks, setBloodBanks] = useState([]);
  const [donationAllocationsById, setDonationAllocationsById] = useState({});
  const [activityLog, setActivityLog] = useState([]);
  const [inventory, setInventory] = useState({});
  const [statusMessage, setStatusMessage] = useState("Connect MetaMask to begin.");
  const [donorForm, setDonorForm] = useState(emptyDonorForm);
  const [donorRoleForm, setDonorRoleForm] = useState(emptyRoleForm);
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
    setRoleFlags({ isAdmin: false, isDonor: false, isPatient: false, isLab: false, isBloodBank: false, isHospital: false });
    setRequests([]);
    setDonations([]);
    setBloodBanks([]);
    setDonorRoleForm(emptyRoleForm);
    setActivityLog([]);
    setInventory({});
    setStatusMessage(message);
  }

  async function createRegistry(currentProvider) {
    return new ethers.Contract(contractAddress, contractAbi, await currentProvider.getSigner());
  }

  async function loadBloodBanks(registry) {
    const bankAddresses = await registry.getBloodBanks();
    setBloodBanks(Array.from(bankAddresses));
  }

  async function loadInventory(registry, currentRole, currentAccount) {
    const entries = await Promise.all(
      bloodGroups.map(async (group) => {
        if (currentRole === "Blood Bank" && currentAccount) {
          return [group, Number(await registry.getBloodBankInventory(currentAccount, group))];
        }

        return [group, Number(await registry.getInventory(group))];
      })
    );

    setInventory(Object.fromEntries(entries));
  }

  async function loadDonations(registry, currentRole, currentAccount) {
    let loadedDonations = [];

    if (currentRole === "Admin") {
      loadedDonations = await registry.getAllDonations();
    } else if (currentRole === "Donor" && currentAccount) {
      loadedDonations = await registry.getDonationsByDonor(currentAccount);
    } else {
      setDonations([]);
      setDonationAllocationsById({});
      return;
    }

    const normalizedDonations = Array.from(loadedDonations).map(normalizeDonation);
    setDonations(normalizedDonations);

    const allocationEntries = await Promise.all(
      normalizedDonations.map(async (donation) => {
        const allocationRows = await registry.getDonationAllocations(donation.id);
        return [donation.id.toString(), Array.from(allocationRows).map(normalizeAllocation)];
      })
    );

    setDonationAllocationsById(Object.fromEntries(allocationEntries));
  }

  async function loadActivity(registry) {
    const [labUpdatedEvents, donorUpdatedEvents, bloodBankUpdatedEvents, hospitalUpdatedEvents, inventoryEvents, patientEvents, donationEvents, donationAllocatedEvents, donationReleasedEvents, labEvents, bloodBankEvents, hospitalEvents] = await Promise.all([
      registry.queryFilter(registry.filters.LabUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.DonorUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.BloodBankUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.HospitalUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.InventoryUpdated(), 0, "latest"),
      registry.queryFilter(registry.filters.PatientRegistered(), 0, "latest"),
      registry.queryFilter(registry.filters.DonationRecorded(), 0, "latest"),
      registry.queryFilter(registry.filters.DonationAllocated(), 0, "latest"),
      registry.queryFilter(registry.filters.DonationReleased(), 0, "latest"),
      registry.queryFilter(registry.filters.LabVerificationCompleted(), 0, "latest"),
      registry.queryFilter(registry.filters.BloodBankAvailabilityChecked(), 0, "latest"),
      registry.queryFilter(registry.filters.HospitalApprovalCompleted(), 0, "latest")
    ]);

    const activity = [
      ...labUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Lab access updated", requestId: "-", actor: event.args.lab, outcome: event.args.allowed ? "Lab enabled" : "Lab revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...donorUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Donor access updated", requestId: "-", actor: event.args.donor, outcome: event.args.allowed ? "Donor enabled" : "Donor revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...bloodBankUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Blood bank access updated", requestId: "-", actor: event.args.bloodBank, outcome: event.args.allowed ? "Blood bank enabled" : "Blood bank revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...hospitalUpdatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Admin", title: "Hospital access updated", requestId: "-", actor: event.args.hospital, outcome: event.args.allowed ? "Hospital enabled" : "Hospital revoked", blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...inventoryEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Inventory", title: "Blood inventory updated", requestId: "-", actor: event.args.bloodBank, outcome: `${event.args.bloodGroup} -> ${event.args.unitsAvailable.toString()} units`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...patientEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Request", title: "Patient request created", requestId: event.args.requestId.toString(), actor: event.args.patient, outcome: `${event.args.bloodGroup} | ${event.args.unitsRequired.toString()} units`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...donationEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Donation", title: "Donation recorded", requestId: "-", actor: event.args.donor, outcome: `${event.args.bloodGroup} | ${event.args.unitsDonated.toString()} units -> ${shortAddress(event.args.bloodBank)}`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...donationAllocatedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Allocation", title: "Donation allocated", requestId: event.args.requestId.toString(), actor: event.args.bloodBank, outcome: `Donation #${event.args.donationId.toString()} -> ${event.args.unitsAllocated.toString()} units`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
      ...donationReleasedEvents.map((event) => ({ id: `${event.transactionHash}-${event.index}`, stage: "Allocation", title: "Donation released", requestId: event.args.requestId.toString(), actor: event.args.bloodBank, outcome: `Donation #${event.args.donationId.toString()} restored by ${event.args.unitsReleased.toString()} units`, blockNumber: event.blockNumber, txHash: event.transactionHash })),
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
    const [owner, isLab, isBloodBank, isHospital, isDonor, allRequests, allBloodBanks] = await Promise.all([
      registry.owner(),
      registry.isLab(normalized),
      registry.isBloodBank(normalized),
      registry.isHospital(normalized),
      registry.isDonor(normalized),
      registry.getAllRequests(),
      registry.getBloodBanks()
    ]);

    const isAdmin = ethers.getAddress(owner) === normalized;
    const isPatient = allRequests.some((request) => ethers.getAddress(request.patient) === normalized);
    const currentRole = isAdmin ? "Admin" : isLab ? "Lab" : isBloodBank ? "Blood Bank" : isHospital ? "Hospital" : isDonor ? "Donor" : isPatient ? "Patient" : "Observer";

    setContract(registry);
    setRole(currentRole);
    setRoleFlags({ isAdmin, isDonor, isPatient, isLab, isBloodBank, isHospital });
    setRequests(allRequests);
    setBloodBanks(Array.from(allBloodBanks));
    if (!rolePages[currentRole].includes(activePage)) {
      navigateTo(rolePages[currentRole][0], true);
    }

    if (currentRole === "Patient" || currentRole === "Donor") {
      setInventory({});
      setActivityLog([]);
      await loadDonations(registry, currentRole, normalized);
      return;
    }

    await Promise.all([
      loadInventory(registry, currentRole, normalized),
      loadActivity(registry),
      loadDonations(registry, currentRole, normalized)
    ]);
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
      const fallbackPage = availablePages.includes(requestedPage) ? requestedPage : availablePages[0];
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

  async function submitDonation(event) {
    event.preventDefault();
    try {
      if (!donorForm.donorName.trim()) return setStatusMessage("Donor name is required.");
      if (!donorForm.donationDate.trim()) return setStatusMessage("Donation date is required.");
      if (!Number(donorForm.unitsDonated) || Number(donorForm.unitsDonated) < 1) return setStatusMessage("Units donated must be at least 1.");

      const selectedBloodBank = bloodBanks[0];
      if (!selectedBloodBank) return setStatusMessage("No blood bank is configured yet. Ask admin to enable a blood bank wallet.");

      const registry = await getWriteContract();
      const tx = await registry.donateBlood(
        donorForm.donorName.trim(),
        donorForm.bloodGroup,
        Number(donorForm.unitsDonated),
        donorForm.donationDate,
        selectedBloodBank
      );
      setStatusMessage("Waiting for donation confirmation...");
      await tx.wait();
      setDonorForm(emptyDonorForm);
      await refreshData();
      setStatusMessage("Your donation has been recorded successfully.");
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function submitPatient(event) {
    event.preventDefault();
    try {
      if (!patientForm.patientName.trim()) return setStatusMessage("Patient name is required.");
      if (!patientForm.hospitalName.trim()) return setStatusMessage("Hospital name is required.");
      if (!Number(patientForm.unitsRequired) || Number(patientForm.unitsRequired) < 1) return setStatusMessage("Units required must be at least 1.");

      const registry = await getWriteContract();
      const tx = await registry.registerPatient(
        patientForm.patientName.trim(),
        0,
        patientForm.bloodGroup,
        Number(patientForm.unitsRequired),
        patientForm.hospitalName.trim(),
        `Urgency: ${patientForm.urgencyLevel}`
      );
      setStatusMessage("Waiting for patient registration confirmation...");
      await tx.wait();
      setPatientForm(emptyPatientForm);
      await refreshData();
      setStatusMessage("Your request has been submitted successfully.");
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
      const request = requests.find((item) => item.id.toString() === String(bloodBankReviewForm.requestId));
      if (bloodBankReviewForm.approved && request) {
        const availableUnits = Number(inventory[request.bloodGroup] ?? 0);
        const requiredUnits = Number(request.unitsRequired);

        if (availableUnits < requiredUnits) {
          setStatusMessage(`Not enough units in inventory for ${request.bloodGroup}. Need ${requiredUnits}, have ${availableUnits}.`);
          return;
        }
      }

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
              <h2>Governance Overview</h2>
            </div>
            <span className="signal-dot signal-green">Live</span>
          </div>
          <p className="panel-copy">Monitor system health and institutional activity.</p>
          <div className="smart-list">
            <div><span>Authorized Labs</span><strong>{roleFlags.isAdmin ? "Managed" : "-"}</strong></div>
            <div><span>Critical Requests</span><strong>{derived.unavailable.length}</strong></div>
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
              <h2>Verification Queue</h2>
            </div>
            <span className="signal-dot signal-yellow">Pending</span>
          </div>
          <p className="panel-copy">Review pending requests and clear them for allocation.</p>
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
              <h2>Allocation Queue</h2>
            </div>
            <span className="signal-dot signal-aqua">Stock</span>
          </div>
          <p className="panel-copy">Maintain stock and allocate units to verified cases.</p>
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
              <h2>Approval Queue</h2>
            </div>
            <span className="signal-dot signal-green">Ready</span>
          </div>
          <p className="panel-copy">Review requests with verified need and allocated units.</p>
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
              <h2>Request Status</h2>
            </div>
            <span className="signal-dot signal-yellow">Tracking</span>
          </div>
          <p className="panel-copy">Create a request and track each approval stage.</p>
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
              <h2>Access Status</h2>
            </div>
            <span className="signal-dot signal-red">Limited</span>
          </div>
        <p className="panel-copy">Connect a role-enabled wallet or create a request to continue.</p>
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
    const walletStats = [
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
                <h2>Operational Control Center</h2>
              </div>
              <span className="signal-dot signal-green">System Active</span>
            </div>
            <p className="hero-text">Track and manage the blood request lifecycle in real time.</p>
            <div className="pulse-body">
              <div className="pulse-visual">
                <div className="pulse-ring pulse-ring-one" />
                <div className="pulse-ring pulse-ring-two" />
                <div className="pulse-core">
                  <strong>{requests.length}</strong>
                  <span>Active Cases</span>
                </div>
              </div>
              <div className="pulse-stats">
                <div><span>Verification Queue</span><strong>{derived.pendingLab.length + derived.pendingBloodBank.length}</strong></div>
                <div><span>Approval Rate</span><strong>{requests.length ? `${Math.round((derived.approved.length / requests.length) * 100)}%` : "0%"}</strong></div>
              </div>
            </div>
          </article>

          <article className="glass-card wallet-smart-panel">
            <div className="wallet-panel-top">
              <div className="wallet-panel-heading">
                <p className="section-kicker">Connected Wallet</p>
                <h2>{shortAddress(account)}</h2>
                <p className="wallet-panel-copy">{account || "Wallet not connected"}</p>
              </div>
              <button className="secondary-button subtle-button wallet-reconnect" onClick={connectWallet}>
                Reconnect Wallet
              </button>
            </div>

            <div className="wallet-panel-meta">
              <span className="wallet-role-badge">{formatRole(role)}</span>
              <span className="wallet-meta-note">Current role</span>
            </div>

            <div className="wallet-panel-divider" />

            <div className="wallet-panel-stats">
              {walletStats.map((card, index) => (
                <article className={`wallet-stat-card tone-${card.tone}`} key={card.label} style={{ animationDelay: `${index * 70}ms` }}>
                  <strong>{card.value}</strong>
                  <span>{card.label}</span>
                </article>
              ))}
            </div>

            <div className="wallet-panel-footer">System synced • Last updated just now</div>
          </article>

          <article className="glass-card flow-card">
            <div className="panel-topline">
              <div>
                <p className="section-kicker">Request Pipeline</p>
                <h2>End-to-end flow from intake to final approval</h2>
              </div>
            </div>
            <div className="flow-track">
              {[
                { label: "Patient Intake", count: requests.length, tone: "signal-aqua" },
                { label: "Lab Verification", count: derived.pendingLab.length, tone: "signal-yellow" },
                { label: "Blood Allocation", count: derived.pendingBloodBank.length, tone: "signal-yellow" },
                { label: "Hospital Approval", count: derived.pendingHospital.length, tone: "signal-green" }
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
                <p className="section-kicker">Live Activity</p>
                <h2>Recent actions across the network</h2>
              </div>
            </div>
            <div className="activity-feed">
              {activityLog.slice(0, 7).map((item) => (
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
      </>
    );
  }

  function renderAdmin() {
    return (
      <section className="admin-stack">
        <section className="content-grid two-up">
          <article className="surface-card">
            <div className="section-header"><div><p className="section-kicker">Role Governance</p><h2>Authorize ecosystem wallets</h2></div><span className="header-pill">Admin only</span></div>
            <form onSubmit={(event) => { event.preventDefault(); }}>
              <label>Lab wallet</label>
              <input value={labForm.address} placeholder="0x..." onChange={(event) => setLabForm({ ...labForm, address: extractAddress(event.target.value) })} />
              <select value={String(labForm.allowed)} onChange={(event) => setLabForm({ ...labForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
              <button className="primary-button" type="button" disabled={role !== "Admin"} onClick={() => updateRoleAccess(labForm, setLabForm, (registry, target, allowed) => registry.setLab(target, allowed), "Lab")}>Update Lab Access</button>
              <label>Donor wallet</label>
              <input value={donorRoleForm.address} placeholder="0x..." onChange={(event) => setDonorRoleForm({ ...donorRoleForm, address: extractAddress(event.target.value) })} />
              <select value={String(donorRoleForm.allowed)} onChange={(event) => setDonorRoleForm({ ...donorRoleForm, allowed: event.target.value === "true" })}><option value="true">Allow</option><option value="false">Revoke</option></select>
              <button className="primary-button" type="button" disabled={role !== "Admin"} onClick={() => updateRoleAccess(donorRoleForm, setDonorRoleForm, (registry, target, allowed) => registry.setDonor(target, allowed), "Donor")}>Update Donor Access</button>
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

        <section className="surface-card full-width-card">
          <div className="section-header"><div><p className="section-kicker">Donation Tracking</p><h2>Donor to patient traceability</h2></div><span className="header-pill">{donations.length} donation(s)</span></div>
          {!donations.length ? (
            <p className="empty-state">No donations recorded yet.</p>
          ) : (
            <div className="donation-tracking-grid">
              <article className="donation-tracking-summary">
                <div><span>Total donations</span><strong>{donations.length}</strong></div>
                <div><span>Assigned</span><strong>{donations.filter((donation) => Number(donation.status) === 1).length}</strong></div>
                <div><span>Used</span><strong>{donations.filter((donation) => Number(donation.status) === 2).length}</strong></div>
              </article>
              <article className="donation-tracking-summary">
                {bloodGroups.map((group) => (
                  <div key={group}>
                    <span>{group}</span>
                    <strong>{donations.filter((donation) => donation.bloodGroup === group).reduce((total, donation) => total + Number(donation.unitsDonated), 0)}</strong>
                  </div>
                ))}
              </article>
            </div>
          )}

          {donations.length ? (
            <div className="record-grid donation-record-grid">
              {donations.map((donation) => {
                const allocations = donationAllocationsById[donation.id.toString()] || [];

                return (
                  <article className="record-card donation-record" key={donation.id.toString()}>
                    <div className="record-head">
                      <div>
                        <p className="record-kicker">Donation #{donation.id.toString()}</p>
                        <h3>{donation.donorName}</h3>
                      </div>
                      <span className="status-badge">{donationStatusLabel(donation.status)}</span>
                    </div>
                    <div className="record-meta">
                      <span>{donation.bloodGroup}</span>
                      <span>{donation.unitsDonated.toString()} unit(s)</span>
                      <span>{shortAddress(donation.bloodBank)}</span>
                    </div>
                    <p>Donation date: {donation.donationDate}</p>
                    <p>Available units: {donation.unitsAvailable.toString()}</p>
                    <p>
                      Linked requests: {allocations.length ? allocations.map((allocation) => `#${allocation.requestId.toString()} (${allocationStatusLabel(allocation)})`).join(", ") : "Not yet assigned"}
                    </p>
                    {allocations.length ? <p>Patients: {allocations.map((allocation) => shortAddress(allocation.patient)).join(", ")}</p> : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </section>
    );
  }

  function renderDonor() {
    const autoAssignedBank = bloodBanks.length ? bloodBanks[0] : "";

    return (
      <section className="patient-focused-layout">
        <article className="surface-card patient-primary-card">
          <div className="section-header">
            <div>
              <p className="section-kicker">Donate Blood</p>
              <h2>Submit a donation and we will route it to an active blood bank.</h2>
            </div>
            <span className="header-pill">Donor only</span>
          </div>
          <form onSubmit={submitDonation}>
            <label>Donor Name</label>
            <input value={donorForm.donorName} placeholder="Enter your name" onChange={(event) => setDonorForm({ ...donorForm, donorName: event.target.value })} />
            <label>Blood Group</label>
            <select value={donorForm.bloodGroup} onChange={(event) => setDonorForm({ ...donorForm, bloodGroup: event.target.value })}>{bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
            <label>Units Donated</label>
            <input value={donorForm.unitsDonated} type="number" min="1" placeholder="Donation units" onChange={(event) => setDonorForm({ ...donorForm, unitsDonated: event.target.value })} />
            <label>Donation Date</label>
            <input value={donorForm.donationDate} type="date" onChange={(event) => setDonorForm({ ...donorForm, donationDate: event.target.value })} />
            <p className="patient-trace-copy">Auto-assigned blood bank: {autoAssignedBank ? shortAddress(autoAssignedBank) : "No active blood bank"}</p>
            <button className="primary-button" type="submit" disabled={!contract}>Submit Donation</button>
          </form>
        </article>

        <article className="surface-card patient-primary-card">
          <div className="section-header">
            <div>
              <p className="section-kicker">My Donations</p>
              <h2>Track your blood contributions</h2>
            </div>
            <span className="header-pill">{donations.length} donation(s)</span>
          </div>
          {!donations.length ? (
            <p className="empty-state">No donations yet. Submit your first donation above.</p>
          ) : (
            <div className="patient-status-list">
              {donations.map((donation) => {
                const allocations = donationAllocationsById[donation.id.toString()] || [];

                return (
                  <article className="patient-status-item" key={donation.id.toString()}>
                    <div>
                      <p className="record-kicker">Donation #{donation.id.toString()}</p>
                      <strong>{donation.bloodGroup} • {donation.unitsDonated.toString()} unit(s)</strong>
                      <p className="patient-trace-copy">{donation.donationDate} • {shortAddress(donation.bloodBank)}</p>
                      <p className="patient-trace-copy">{allocations.length ? allocations.map((allocation) => `#${allocation.requestId.toString()} (${allocationStatusLabel(allocation)})`).join(", ") : "Available in inventory"}</p>
                    </div>
                    <span className="status-badge">{donationStatusLabel(donation.status)}</span>
                  </article>
                );
              })}
            </div>
          )}
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
      <section className="patient-focused-layout">
        <article className="surface-card patient-primary-card">
          <div className="section-header">
            <div>
              <p className="section-kicker">Request Blood</p>
              <h2>Submit a request for required blood type and quantity.</h2>
            </div>
            <span className="header-pill">Patient only</span>
          </div>
          <form onSubmit={submitPatient}>
            <label>Patient Name</label>
            <input value={patientForm.patientName} placeholder="Enter your name" onChange={(event) => setPatientForm({ ...patientForm, patientName: event.target.value })} />
            <label>Blood Group</label>
            <select value={patientForm.bloodGroup} onChange={(event) => setPatientForm({ ...patientForm, bloodGroup: event.target.value })}>{bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
            <label>Units Required</label>
            <input value={patientForm.unitsRequired} type="number" min="1" placeholder="Required units" onChange={(event) => setPatientForm({ ...patientForm, unitsRequired: event.target.value })} />
            <label>Hospital Name</label>
            <input value={patientForm.hospitalName} placeholder="Hospital name" onChange={(event) => setPatientForm({ ...patientForm, hospitalName: event.target.value })} />
            <label>Urgency Level</label>
            <select value={patientForm.urgencyLevel} onChange={(event) => setPatientForm({ ...patientForm, urgencyLevel: event.target.value })}>
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
              <option value="Critical">Critical</option>
            </select>
            <button className="primary-button" type="submit" disabled={!contract}>Submit Request</button>
          </form>
        </article>

        <article className="surface-card patient-primary-card">
          <div className="section-header">
            <div>
              <p className="section-kicker">My Requests</p>
              <h2>View your request status</h2>
            </div>
            <span className="header-pill">{derived.myRequests.length} request(s)</span>
          </div>
          {!derived.myRequests.length ? (
            <p className="empty-state">No requests yet. Submit your first request above.</p>
          ) : (
            <div className="patient-status-list">
              {derived.myRequests.map((request) => (
                <article className="patient-status-item" key={request.id.toString()}>
                  <div>
                    <p className="record-kicker">Request #{request.id.toString()}</p>
                    <strong>{request.bloodGroup} • {request.unitsRequired.toString()} unit(s)</strong>
                  </div>
                  <span className="status-badge">{patientStatusLabel(request.status)}</span>
                </article>
              ))}
            </div>
          )}
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
    if (role === "Donor") return renderDonor();
    if (role === "Patient") return renderPatient();
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
          {role !== "Patient" && role !== "Donor" ? availablePages.map((pageId) => (
            <button className={`topbar-tab ${activePage === pageId ? "topbar-tab-active" : ""}`} key={pageId} onClick={() => navigateTo(pageId)} type="button">
              {pageTitle(pageId)}
            </button>
          )) : null}
        </div>
        <div className="topbar-actions">
          <span className="wallet-pill">{account ? shortAddress(account) : "Wallet not connected"}</span>
          <span className="wallet-pill">{formatRole(role)}</span>
          {role !== "Patient" && role !== "Donor" ? <span className="icon-pill">••</span> : null}
          <button className="avatar-pill" onClick={connectWallet} type="button">{account ? "Reconnect Wallet" : "Connect"}</button>
        </div>
      </header>

      <main className="workspace">
        <header className="workspace-header">
          <div><p className="section-kicker">{role === "Patient" || role === "Donor" ? `${role} Portal` : "Role Dashboard"}</p><h1>{role === "Patient" ? "Request Blood" : role === "Donor" ? "Donate Blood" : pageMeta[activePage].label}</h1></div>
          <div className="header-actions">
            {role !== "Patient" && role !== "Donor" ? <span className="network-chip">Local Hardhat</span> : null}
            {role !== "Patient" && role !== "Donor" ? <span className="contract-chip">{shortAddress(contractAddress)}</span> : null}
            <span className="status-inline">{account ? "Wallet connected" : "Connect wallet"}</span>
          </div>
        </header>
        <article className="glass-card status-banner">
          <p>{statusMessage}</p>
        </article>
        {renderPage()}
      </main>

      {role !== "Patient" && role !== "Donor" ? (
        <div className="floating-actions glass-card">
          <p className="section-kicker">Quick Actions</p>
          <button className="fab-action" onClick={() => navigateTo("patient")} type="button">Create Request</button>
          <button className="fab-action" onClick={() => navigateTo("lab")} type="button">Verify Request</button>
          <button className="fab-action" onClick={() => navigateTo("hospital")} type="button">Approve Request</button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
