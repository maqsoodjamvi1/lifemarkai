import React, { useState } from 'react';
import { MOCK_PRODUCTS } from './data/mock';
import { formatCurrency } from './lib/utils';
import type { Product, CartItem } from './lib/types';

export default function App() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paid, setPaid] = useState(false);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== id));
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛍️</span>
            <span className="text-lg font-bold tracking-tight">Lumen Store</span>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            className="relative inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium transition-colors"
          >
            Cart
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-white/20 text-xs font-semibold">
              {itemCount}
            </span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Shop the collection</h1>
        <p className="text-slate-400 mt-2">Hand-picked gear. Fast checkout. Free returns.</p>
      </section>

      {/* Product grid */}
      <main className="max-w-6xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MOCK_PRODUCTS.map((product) => (
            <div
              key={product.id}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col hover:border-violet-500/40 transition-colors"
            >
              <div className="aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-5xl">
                {product.emoji ?? '📦'}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{product.name}</h3>
                  <span className="text-violet-300 font-bold whitespace-nowrap">
                    {formatCurrency(product.price)}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1 flex-1">{product.description}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-500">{product.stock} in stock</span>
                  <button
                    onClick={() => addToCart(product)}
                    className="rounded-lg bg-white/10 hover:bg-violet-600 px-3 py-1.5 text-sm font-medium transition-colors"
                  >
                    Add to cart
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Cart / checkout drawer */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setCheckoutOpen(false); setPaid(false); }}
          />
          <aside className="relative w-full max-w-md h-full bg-slate-900 border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
              <h2 className="font-semibold">{paid ? 'Order confirmed' : 'Your cart'}</h2>
              <button
                onClick={() => { setCheckoutOpen(false); setPaid(false); }}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {paid ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
                <div className="text-5xl">✅</div>
                <p className="text-lg font-semibold">Payment successful</p>
                <p className="text-slate-400 text-sm">
                  A receipt for {formatCurrency(total)} has been sent. (Mock Stripe checkout.)
                </p>
                <button
                  onClick={() => { setCart([]); setPaid(false); setCheckoutOpen(false); }}
                  className="mt-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium"
                >
                  Continue shopping
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {cart.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-12">Your cart is empty.</p>
                  )}
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-2xl shrink-0">
                        {item.product.emoji ?? '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product.name}</p>
                        <p className="text-xs text-slate-400">{formatCurrency(item.product.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(item.product.id, -1)} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20">−</button>
                        <span className="w-5 text-center text-sm">{item.quantity}</span>
                        <button onClick={() => changeQty(item.product.id, 1)} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20">+</button>
                      </div>
                      <button onClick={() => removeFromCart(item.product.id)} className="text-slate-500 hover:text-red-400 text-sm">Remove</button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Subtotal</span>
                    <span className="font-semibold">{formatCurrency(total)}</span>
                  </div>
                  <button
                    disabled={cart.length === 0}
                    onClick={() => setPaid(true)}
                    className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Pay {formatCurrency(total)} with Stripe
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">Mock checkout — no real charge.</p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
