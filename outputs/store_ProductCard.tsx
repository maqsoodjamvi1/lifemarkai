import React from 'react';
import type { Product } from '../lib/types';

// Inlined (prices are in cents) so it never depends on module load order.
const formatCurrency = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart }) => (
  <div className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 hover:border-white/[0.12] transition-all duration-300">
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="flex justify-between items-start">
      <div>
        <h3 className="text-xl font-semibold text-white">{product.name}</h3>
        <p className="text-sm text-slate-400">{product.description}</p>
        <p className="text-lg font-bold text-white mt-2">{formatCurrency(product.price)}</p>
      </div>
      <span className="text-3xl">{product.emoji}</span>
    </div>
    <button
      className="mt-4 w-full py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 active:scale-95 transition-all"
      onClick={() => onAddToCart(product)}
    >
      Add to Cart
    </button>
  </div>
);

export default ProductCard;
