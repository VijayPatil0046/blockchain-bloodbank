# Blood Donation Blockchain Application

This project is an MVP decentralized application for blood-donation and emergency blood-request verification.

## Workflow

1. A patient registers a blood request on-chain.
2. The admin authorizes trusted lab and hospital wallet addresses.
3. A lab verifies the patient request through MetaMask.
4. A hospital gives final approval through MetaMask.

## Stack

- Solidity smart contract
- Hardhat for compile, test, and deployment
- React + Vite frontend
- Ethers.js for wallet and contract calls
- MetaMask for admin, lab, and hospital verification

## Project Structure

- `contracts/BloodDonationRegistry.sol`
- `scripts/deploy.js`
- `test/BloodDonationRegistry.js`
- `frontend/`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Compile and test the contract:

```bash
npm run compile
npm run test
```

3. Start a local blockchain in the first terminal:

```bash
npx hardhat node
```

4. In a second terminal, deploy the contract to the local Hardhat network:

```bash
npm run deploy:local
```

5. Copy the deployed contract address printed by the deploy script into `frontend/.env`:

```bash
VITE_CONTRACT_ADDRESS=your_deployed_contract_address
```

6. In a third terminal, start the frontend:

```bash
npm run frontend:dev
```

7. Open the app:

```text
http://localhost:5173
```

## Local Configuration

The frontend reads the deployed contract address from `frontend/.env`.

Example:

```env
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

The local blockchain uses:

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

## MetaMask Setup

1. Add a custom network in MetaMask with the local Hardhat settings:
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. Import test accounts from the `npx hardhat node` output.
3. Use account `#0` as the admin wallet.
4. Use separate imported wallets for patient, lab, and hospital roles.

## Demo Flow

1. Connect the admin wallet in the frontend.
2. Add an allowed lab wallet address.
3. Add an allowed hospital wallet address.
4. Switch to a patient wallet and register a blood request.
5. Switch to the lab wallet and verify the request.
6. Switch to the hospital wallet and approve the request.

## Troubleshooting

If `npx hardhat node` shows `EADDRINUSE: address already in use 127.0.0.1:8545`, another process is already using the local blockchain port.

Find the process:

```powershell
netstat -ano | findstr :8545
```

Stop it with the PID shown in the last column:

```powershell
taskkill /PID <PID> /F
```

Then start the local blockchain again:

```bash
npx hardhat node
```

## Notes

- Store only references, hashes, or encrypted metadata on-chain. Do not put raw medical records on a public blockchain.
- For production, add IPFS or another secure storage layer for patient documents.
- You can map MetaMask accounts in Hardhat to admin, lab, and hospital roles for demos.
