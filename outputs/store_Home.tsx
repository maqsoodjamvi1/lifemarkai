import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Footer from '../components/Footer';
import ProductList from '../components/ProductList';
import { MOCK_PRODUCTS } from '../data/mock';
import { useCart } from '../hooks/useCart';

const FEATURES = [
  { icon: '🚚', title: 'Free Shipping', text: 'On every order over $50, delivered fast.' },
  { icon: '↩️', title: 'Easy Returns', text: '30-day hassle-free return policy.' },
  { icon: '🔒', title: 'Secure Checkout', text: 'Your payment is encrypted and protected.' },
];

const Home: React.FC = () => {
  const { addToCart } = useCart();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <Hero />
      <main className="max-w-6xl mx-auto px-4 pb-24 space-y-16">
        {/* Featured products */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Featured Products</h2>
            <Link to="/shop" className="text-sm text-violet-300 hover:text-violet-200">
              View all →
            </Link>
          </div>
          <ProductList products={MOCK_PRODUCTS} onAddToCart={addToCart} />
        </section>

        {/* Value props */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center"
            >
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-slate-400 mt-1">{f.text}</p>
            </div>
          ))}
        </section>

        {/* Newsletter */}
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
    </div>
  );
};

export default Home;
