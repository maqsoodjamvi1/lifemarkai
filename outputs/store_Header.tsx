import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../hooks/useCart';

const Header: React.FC = () => {
  const { totalItems } = useCart();

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🛍️</span>
          <span className="text-lg font-bold tracking-tight">E-Shop</span>
        </Link>
        <nav className="hidden sm:flex gap-4">
          <Link to="/" className="text-sm text-slate-400 hover:text-white">Home</Link>
          <Link to="/shop" className="text-sm text-slate-400 hover:text-white">Shop</Link>
        </nav>
        <Link
          to="/shop"
          className="relative inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium transition-colors"
        >
          Cart
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-white/20 text-xs font-semibold">
            {totalItems}
          </span>
        </Link>
      </div>
    </header>
  );
};

export default Header;
