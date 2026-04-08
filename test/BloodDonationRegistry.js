const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BloodDonationRegistry", function () {
  async function deployFixture() {
    const [admin, patient, lab, bloodBank, hospital] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("BloodDonationRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    return { registry, admin, patient, lab, bloodBank, hospital };
  }

  it("runs the full patient to hospital approval lifecycle", async function () {
    const { registry, admin, patient, lab, bloodBank, hospital } = await deployFixture();

    await registry.connect(admin).setLab(lab.address, true);
    await registry.connect(admin).setBloodBank(bloodBank.address, true);
    await registry.connect(admin).setHospital(hospital.address, true);
    await registry.connect(bloodBank).updateInventory("O+", 10);

    await registry
      .connect(patient)
      .registerPatient("Asha Patel", 28, "O+", 2, "ipfs://contact", "ipfs://medical");

    await registry.connect(lab).verifyByLab(1, true, "Medical documents verified");
    let request = await registry.getRequest(1);
    expect(request.status).to.equal(1n);

    await registry.connect(bloodBank).checkAvailability(1, true, "Inventory reserved");
    request = await registry.getRequest(1);
    expect(request.status).to.equal(3n);
    expect(request.bloodBankOfficer).to.equal(bloodBank.address);
    expect(request.reservedUnits).to.equal(2n);
    expect(await registry.getInventory("O+")).to.equal(8n);

    await registry.connect(hospital).approveByHospital(1, true, "Approved for transfusion");
    request = await registry.getRequest(1);
    expect(request.status).to.equal(4n);
    expect(request.hospitalApprover).to.equal(hospital.address);
    expect(await registry.getInventory("O+")).to.equal(8n);
  });

  it("marks a request as unavailable when stock is missing", async function () {
    const { registry, admin, patient, lab, bloodBank } = await deployFixture();

    await registry.connect(admin).setLab(lab.address, true);
    await registry.connect(admin).setBloodBank(bloodBank.address, true);
    await registry.connect(bloodBank).updateInventory("A-", 0);

    await registry
      .connect(patient)
      .registerPatient("Ravi Kumar", 35, "A-", 1, "ipfs://contact", "ipfs://medical");

    await registry.connect(lab).verifyByLab(1, true, "Valid");
    await registry.connect(bloodBank).checkAvailability(1, false, "No stock");

    const request = await registry.getRequest(1);
    expect(request.status).to.equal(2n);
    expect(await registry.getInventory("A-")).to.equal(0n);
  });

  it("restores reserved inventory when hospital rejects", async function () {
    const { registry, admin, patient, lab, bloodBank, hospital } = await deployFixture();

    await registry.connect(admin).setLab(lab.address, true);
    await registry.connect(admin).setBloodBank(bloodBank.address, true);
    await registry.connect(admin).setHospital(hospital.address, true);
    await registry.connect(bloodBank).updateInventory("B+", 4);

    await registry
      .connect(patient)
      .registerPatient("Meera Shah", 42, "B+", 3, "ipfs://contact", "ipfs://medical");

    await registry.connect(lab).verifyByLab(1, true, "Eligible");
    await registry.connect(bloodBank).checkAvailability(1, true, "Units reserved");
    expect(await registry.getInventory("B+")).to.equal(1n);

    await registry.connect(hospital).approveByHospital(1, false, "Admission cancelled");
    const request = await registry.getRequest(1);
    expect(request.status).to.equal(5n);
    expect(request.reservedUnits).to.equal(0n);
    expect(await registry.getInventory("B+")).to.equal(4n);
  });

  it("blocks unauthorized blood bank inventory updates", async function () {
    const { registry, patient } = await deployFixture();

    await expect(registry.connect(patient).updateInventory("O+", 8)).to.be.revertedWith(
      "Only blood bank wallet can manage inventory"
    );
  });
});
