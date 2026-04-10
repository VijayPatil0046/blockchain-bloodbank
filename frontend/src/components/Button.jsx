import React from 'react';

// Button component supporting variants: primary, secondary, subtle, disabled
export default function Button({ variant = 'primary', disabled = false, onClick, children, className = '' }) {
  const base = 'rounded-xl font-medium transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variants = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-500',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
    subtle: 'bg-transparent text-teal-600 hover:bg-teal-50 focus:ring-teal-300',
    disabled: 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50',
  };
  const variantClass = disabled ? variants['disabled'] : variants[variant] || variants['primary'];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${variantClass} ${className}`}
    >
      {children}
    </button>
  );
}
