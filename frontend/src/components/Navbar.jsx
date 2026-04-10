import React from 'react';
import Button from './Button';
import Badge from './Badge';

export default function Navbar({ account, role, connectWallet, shortAddress }) {
  return (
    <header className="flex items-center justify-between bg-white/90 backdrop-blur-md rounded-xl shadow-md px-6 py-3 mb-4">
      <h1 className="text-2xl font-semibold text-gray-800">BloodChain</h1>
      <div className="flex items-center space-x-4">
        {account && (
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-600">{shortAddress(account)}</span>
            <Badge variant="role">{role}</Badge>
          </div>
        )}
        <Button variant="primary" onClick={connectWallet}>
          {account ? 'Reconnect Wallet' : 'Connect MetaMask'}
        </Button>
      </div>
    </header>
  );
}
