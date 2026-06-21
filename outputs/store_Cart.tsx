import React from 'react';
import type { CartItem } from '../lib/types';

// Inlined (prices are in cents) so it never depends on module load order.
const formatCurrency = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

interface CartProps {
  items: CartItem[];
  onRemoveFromCart: (productId: string) => void;
}

const Cart: React.FC<CartProps> = ({ items, onRemoveFromCart }) => {
  const total = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <div className="fixed right-0 top-0 w-72 h-full bg-[#0a0a0f] border-l border-white/10 shadow-lg p-4 overflow-y-auto">
      <h2 className="text-2xl font-bold text-white mb-4">Your Cart</h2>
      {items.length === 0 ? (
        <p className="text-slate-400">Your cart is empty.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.product.id} className="flex justify-between items-center gap-2">
              <span className="text-white text-sm flex-1">
                {item.product.name} <span className="text-slate-500">×{item.quantity}</span>
              </span>
              <span className="text-white text-sm">{formatCurrency(item.product.price * item.quantity)}</span>
              <button className="text-red-500 text-xs hover:text-red-400" onClick={() => onRemoveFromCart(item.product.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex justify-between text-white font-semibold mb-3">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <button className="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold hover:opacity-90 active:scale-95 transition-all">
            Checkout
          </button>
        </div>
      )}
    </div>
  );
};

export default Cart;
