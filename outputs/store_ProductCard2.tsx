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
  <div className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm overflow-hidden hover:border-white/[0.12] transition-all duration-300">
    {/* Real product photo with emoji fallback if the image fails to load */}
    <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900">
      <span className="absolute inset-0 flex items-center justify-center text-5xl">{product.emoji}</span>
      {product.image && (
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
    <div className="p-5">
      <div className="flex justify-between items-start gap-2">
        <h3 className="text-lg font-semibold text-white">{product.name}</h3>
        <span className="text-lg font-bold text-violet-300 whitespace-nowrap">{formatCurrency(product.price)}</span>
      </div>
      <p className="text-sm text-slate-400 mt-1">{product.description}</p>
      <button
        className="mt-4 w-full py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 active:scale-95 transition-all"
        onClick={() => onAddToCart(product)}
      >
        Add to Cart
      </button>
    </div>
  </div>
);

export default ProductCard;
