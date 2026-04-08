const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BloodDonationRegistry", function () {
  async function deployFixture() {
    const [admin, patient, lab, hospital] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("BloodDonationRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    return { registry, admin, patient, lab, hospital };
  }

  it("lets a patient register, a lab verify, and a hospital approve", async function () {
    const { registry, admin, patient, lab, hospital } = await deployFixture();

    await registry.connect(admin).setLab(lab.address, true);
    await registry.connect(admin).setHospital(hospital.address, true);

    await registry
      .connect(patient)
      .registerPatient("Asha Patel", 28, "O+", 2, "ipfs://contact", "ipfs://medical");

    let request = await registry.getRequest(1);
    expect(request.patient).to.equal(patient.address);
    expect(request.status).to.equal(0n);

    await registry.connect(lab).verifyByLab(1, true, "Cross-match ok");
    request = await registry.getRequest(1);
    expect(request.status).to.equal(1n);
    expect(request.labVerifier).to.equal(lab.address);

    await registry.connect(hospital).approveByHospital(1, true, "Bed assigned");
    request = await registry.getRequest(1);
    expect(request.status).to.equal(2n);
    expect(request.hospitalApprover).to.equal(hospital.address);
  });

  it("blocks unauthorized verification", async function () {
    const { registry, patient, lab } = await deployFixture();

    await registry
      .connect(patient)
      .registerPatient("Ravi Kumar", 35, "A-", 1, "ipfs://contact", "ipfs://medical");

    await expect(registry.connect(lab).verifyByLab(1, true, "ok")).to.be.revertedWith(
      "Only lab wallet can verify"
    );
  });
});
