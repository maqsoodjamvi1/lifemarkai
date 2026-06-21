import React, { useState } from 'react';
import { CartProvider, useCart } from './context/CartContext';
import Hero from './components/Hero';
import Footer from './components/Footer';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import { MOCK_PRODUCTS } from './data/mock';

const FEATURES = [
  { icon: '🚚', title: 'Free Shipping', text: 'On every order over $50, delivered fast.' },
  { icon: '↩️', title: 'Easy Returns', text: '30-day hassle-free return policy.' },
  { icon: '🔒', title: 'Secure Checkout', text: 'Your payment is encrypted and protected.' },
];

function StoreFront() {
  const { items, addToCart, removeFromCart, totalItems } = useCart();
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header (router-free so the preview always renders) */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛍️</span>
            <span className="text-lg font-bold tracking-tight">E-Shop</span>
          </div>
          <nav className="hidden sm:flex gap-4">
            <a href="#featured" className="text-sm text-slate-400 hover:text-white">Shop</a>
            <a href="#features" className="text-sm text-slate-400 hover:text-white">Why us</a>
          </nav>
          <button
            onClick={() => setCartOpen((o) => !o)}
            className="relative inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium transition-colors"
          >
            Cart
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-white/20 text-xs font-semibold">
              {totalItems}
            </span>
          </button>
        </div>
      </header>

      <Hero />

      <main className="max-w-6xl mx-auto px-4 pb-24 space-y-16">
        <section id="featured">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">Featured Products</h2>
          <ProductList products={MOCK_PRODUCTS} onAddToCart={addToCart} />
        </section>

        <section id="features" className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-slate-400 mt-1">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-600/15 to-indigo-600/10 p-8 text-center">
          <h2 className="text-2xl font-bold">Get 10% off your first order</h2>
          <p className="text-slate-300 mt-1">Join our newsletter for deals and new arrivals.</p>
          <div className="mt-4 flex max-w-md mx-auto gap-2">
            <input
              type="email"
              placeholder="you@example.com"
              className="flex-1 rounded-lg bg-white/[0.06] border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-500"
            />
            <button className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium transition-colors">
              Subscribe
            </button>
          </div>
        </section>
      </main>

      <Footer />

      {/* Cart drawer */}
      {cartOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setCartOpen(false)} />
          <div className="z-40">
            <Cart items={items} onRemoveFromCart={removeFromCart} />
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <StoreFront />
    </CartProvider>
  );
}
