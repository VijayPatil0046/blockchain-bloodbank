async function main() {
  const [admin, lab, bloodBank, hospital] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("BloodDonationRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();

  await (await registry.connect(admin).setLab(lab.address, true)).wait();
  await (await registry.connect(admin).setBloodBank(bloodBank.address, true)).wait();
  await (await registry.connect(admin).setHospital(hospital.address, true)).wait();

  await (await registry.connect(bloodBank).updateInventory("A+", 12)).wait();
  await (await registry.connect(bloodBank).updateInventory("A-", 6)).wait();
  await (await registry.connect(bloodBank).updateInventory("B+", 10)).wait();
  await (await registry.connect(bloodBank).updateInventory("B-", 5)).wait();
  await (await registry.connect(bloodBank).updateInventory("AB+", 4)).wait();
  await (await registry.connect(bloodBank).updateInventory("AB-", 2)).wait();
  await (await registry.connect(bloodBank).updateInventory("O+", 14)).wait();
  await (await registry.connect(bloodBank).updateInventory("O-", 8)).wait();

  console.log("BloodDonationRegistry deployed to:", address);
  console.log("Admin:", admin.address);
  console.log("Lab:", lab.address);
  console.log("Blood Bank:", bloodBank.address);
  console.log("Hospital:", hospital.address);
  console.log("Starter inventory seeded for all blood groups.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
