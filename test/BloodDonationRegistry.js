const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BloodDonationRegistry", function () {
  async function deployFixture() {
    const [admin, donor, patient, lab, bloodBank, hospital] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("BloodDonationRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    return { registry, admin, donor, patient, lab, bloodBank, hospital };
  }

  it("runs the full donor to patient traceable lifecycle", async function () {
    const { registry, admin, donor, patient, lab, bloodBank, hospital } = await deployFixture();

    await registry.connect(admin).setLab(lab.address, true);
    await registry.connect(admin).setBloodBank(bloodBank.address, true);
    await registry.connect(admin).setHospital(hospital.address, true);
    await registry.connect(admin).setDonor(donor.address, true);

    await registry.connect(donor).donateBlood("Nina Rao", "O+", 2, "2026-04-10", bloodBank.address);
    expect(await registry.getInventory("O+")).to.equal(2n);
    expect(await registry.getBloodBankInventory(bloodBank.address, "O+")).to.equal(2n);

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
    expect(await registry.getInventory("O+")).to.equal(0n);

    const requestAllocations = await registry.getRequestAllocations(1);
    expect(requestAllocations).to.have.lengthOf(1);
    expect(requestAllocations[0].donationId).to.equal(1n);
    expect(requestAllocations[0].used).to.equal(false);

    const donationAllocations = await registry.getDonationAllocations(1);
    expect(donationAllocations).to.have.lengthOf(1);
    expect(donationAllocations[0].requestId).to.equal(1n);
    expect(donationAllocations[0].used).to.equal(false);

    await registry.connect(hospital).approveByHospital(1, true, "Approved for transfusion");
    request = await registry.getRequest(1);
    expect(request.status).to.equal(4n);
    expect(request.hospitalApprover).to.equal(hospital.address);

    const finalDonation = await registry.getDonation(1);
    expect(finalDonation.status).to.equal(2n);
    expect(finalDonation.unitsAvailable).to.equal(0n);

    const finalAllocations = await registry.getRequestAllocations(1);
    expect(finalAllocations[0].used).to.equal(true);
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
    const { registry, admin, donor, patient, lab, bloodBank, hospital } = await deployFixture();

    await registry.connect(admin).setLab(lab.address, true);
    await registry.connect(admin).setBloodBank(bloodBank.address, true);
    await registry.connect(admin).setHospital(hospital.address, true);
    await registry.connect(admin).setDonor(donor.address, true);

    await registry.connect(donor).donateBlood("Meera Rao", "B+", 4, "2026-04-10", bloodBank.address);

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

    const donation = await registry.getDonation(1);
    expect(donation.status).to.equal(0n);
    expect(donation.unitsAvailable).to.equal(4n);
  });

  it("blocks unauthorized blood bank inventory updates", async function () {
    const { registry, patient } = await deployFixture();

    await expect(registry.connect(patient).updateInventory("O+", 8)).to.be.revertedWith(
      "Only blood bank wallet can manage inventory"
    );
  });
});
