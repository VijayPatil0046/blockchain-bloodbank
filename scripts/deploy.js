async function main() {
  const Registry = await ethers.getContractFactory("BloodDonationRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  console.log("BloodDonationRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
