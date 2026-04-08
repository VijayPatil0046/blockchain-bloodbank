# Blood Donation Blockchain Application

This project is a multi-role blood request workflow built with Solidity, Hardhat, React, MetaMask, and Ethers.js.

It is designed to simulate a more realistic healthcare flow where a patient request is not approved immediately. Instead, the request passes through medical verification, blood stock checking, and final hospital approval.

## Problem It Solves

Blood requests often involve multiple parties:

- patient or family creating the request
- lab confirming the medical validity
- blood bank checking actual stock availability
- hospital giving final approval

Without a shared trusted system, status tracking becomes unclear and approvals are difficult to audit.

This application creates a transparent, role-based workflow where every step is recorded and visible in the request lifecycle.

## Updated Workflow

The application now follows this sequence:

1. Patient creates a blood request
2. Lab verifies the medical validity
3. Blood Bank checks whether blood units are available
4. Hospital gives final approval only if blood is available

If blood is not available, the request is marked as unavailable.

## Roles

### Admin

- authorizes lab wallets
- authorizes blood bank wallets
- authorizes hospital wallets
- views all requests
- views full lifecycle and blockchain activity

### Patient

- creates a new request
- views only their own requests

### Lab

- views requests waiting for medical verification
- verifies or rejects requests

### Blood Bank

- manages inventory by blood group
- views requests waiting for availability check
- marks requests as available or not available

### Hospital

- views requests that passed lab and blood bank stages
- gives final approval or rejection

## Strict Role-Based UI

Each role has its own dashboard and should only use its own module:

- Patient does not see admin or hospital tools
- Lab only sees medical verification tools
- Blood Bank only sees inventory and availability tools
- Hospital only sees final approval tools
- Admin is the only role that sees the complete system view

## Blockchain Visualization

The frontend includes a blockchain view that shows lifecycle events in a chain-style visual layout.

This helps demonstrate:

- request creation
- lab verification
- blood bank availability checks
- hospital decisions

## Stack

- Solidity smart contract
- Hardhat for compile, test, deployment
- React + Vite frontend
- Ethers.js for blockchain interaction
- MetaMask for wallet-based role access

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

2. Compile and test:

```bash
npm run compile
npm run test
```

3. Start local blockchain in terminal 1:

```bash
npx hardhat node
```

4. Deploy contract in terminal 2:

```bash
npm run deploy:local
```

5. Put the deployed address into `frontend/.env`:

```env
VITE_CONTRACT_ADDRESS=your_deployed_contract_address
```

6. Start frontend in terminal 3:

```bash
npm run frontend:dev
```

7. Open:

```text
http://localhost:5173
```

## Role Endpoints

The frontend now supports separate dashboard endpoints:

- `/`
- `/admin`
- `/lifecycle`
- `/patient`
- `/lab`
- `/blood-bank`
- `/hospital`
- `/blockchain`

Examples:

- `http://localhost:5173/admin`
- `http://localhost:5173/patient`
- `http://localhost:5173/lab`
- `http://localhost:5173/blood-bank`
- `http://localhost:5173/hospital`
- `http://localhost:5173/blockchain`

If a wallet is not allowed to access a route, the app redirects back to the overview page.

## Local Configuration

The local blockchain uses:

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

The frontend reads the deployed contract address from `frontend/.env`.

Example:

```env
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

## MetaMask Setup

1. Add a custom network in MetaMask:
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. Import test accounts from the Hardhat node output.
3. Use account `#0` as Admin.
4. Use separate accounts for Patient, Lab, Blood Bank, and Hospital.

## Suggested Demo Flow

1. Connect Admin wallet
2. Approve one Lab wallet
3. Approve one Blood Bank wallet
4. Approve one Hospital wallet
5. Switch to Blood Bank wallet and add inventory
6. Switch to Patient wallet and create request
7. Switch to Lab wallet and verify request
8. Switch to Blood Bank wallet and confirm availability
9. Switch to Hospital wallet and give final approval
10. Open `/blockchain` to view the event chain

## Troubleshooting

### Port 8545 Already In Use

If `npx hardhat node` shows:

```text
EADDRINUSE: address already in use 127.0.0.1:8545
```

Find the process:

```powershell
netstat -ano | findstr :8545
```

Stop it:

```powershell
taskkill /PID <PID> /F
```

Then start the node again:

```bash
npx hardhat node
```

### Role Not Updating

If a wallet still shows `Observer`, usually one of these is true:

- the role was not assigned on the current deployed contract
- the Hardhat node was restarted and roles were reset
- the contract was redeployed and the frontend still points to an old address

In that case:

1. reconnect Admin wallet
2. assign the role again
3. make sure `frontend/.env` contains the latest deployed contract address

## Notes

- Do not store raw medical documents directly on-chain
- Use only references, hashes, or encrypted metadata
- This project is intended as a realistic demo/MVP for blockchain-based healthcare workflow
