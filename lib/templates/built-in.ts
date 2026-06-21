/**
 * Built-in template definitions.
 * Each template ships with enough files to render immediately in Vite.
 * Scaffold files (vite.config.ts, tsconfig.json, etc.) are added automatically
 * by the WebContainer preview — only app-specific files live here.
 */

export interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

export interface BuiltInTemplate {
  id: string; // stable slug — also used as DB lookup key
  name: string;
  description: string;
  category: string;
  is_featured: boolean;
  fork_count: number;
  tags: string[];
  files: TemplateFile[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared scaffold helpers
// ─────────────────────────────────────────────────────────────────────────────

const PACKAGE_JSON = (extra: Record<string, string> = {}): TemplateFile => ({
  path: "package.json",
  language: "json",
  content: JSON.stringify({
    name: "lifemarkai-app",
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: { dev: "vite --host", build: "vite build" },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      "lucide-react": "^0.414.0",
      "framer-motion": "^11.0.0",
      "clsx": "^2.1.0",
      ...extra,
    },
    devDependencies: {
      "@types/react": "^18.3.1",
      "@types/react-dom": "^18.3.1",
      "@vitejs/plugin-react": "^4.3.0",
      typescript: "^5.5.0",
      vite: "^5.4.0",
      tailwindcss: "^3.4.0",
      autoprefixer: "^10.4.0",
      postcss: "^8.4.0",
    },
  }, null, 2),
});

const MAIN_TSX: TemplateFile = {
  path: "src/main.tsx",
  language: "typescriptreact",
  content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)`,
};

const INDEX_CSS: TemplateFile = {
  path: "src/index.css",
  language: "css",
  content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, -apple-system, sans-serif; }`,
};

const VITE_CONFIG: TemplateFile = {
  path: "vite.config.ts",
  language: "typescript",
  content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react({ babel: { plugins: [] } })] })`,
};

const INDEX_HTML: TemplateFile = {
  path: "index.html",
  language: "html",
  content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>`,
};

const TSCONFIG: TemplateFile = {
  path: "tsconfig.json",
  language: "json",
  content: JSON.stringify({
    compilerOptions: {
      target: "ES2020", useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext", skipLibCheck: true,
      moduleResolution: "bundler", allowImportingTsExtensions: true,
      resolveJsonModule: true, isolatedModules: true,
      noEmit: true, jsx: "react-jsx", strict: true,
    },
    include: ["src"],
  }, null, 2),
};

const TAILWIND_CONFIG: TemplateFile = {
  path: "tailwind.config.js",
  language: "javascript",
  content: `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n  theme: { extend: {} },\n  plugins: [],\n}`,
};

const POSTCSS_CONFIG: TemplateFile = {
  path: "postcss.config.js",
  language: "javascript",
  content: `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`,
};

function scaffold(appFile: TemplateFile, extra: TemplateFile[] = [], pkgExtra: Record<string, string> = {}): TemplateFile[] {
  return [INDEX_HTML, VITE_CONFIG, TSCONFIG, TAILWIND_CONFIG, POSTCSS_CONFIG, PACKAGE_JSON(pkgExtra), MAIN_TSX, INDEX_CSS, appFile, ...extra];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SaaS Landing Page
// ─────────────────────────────────────────────────────────────────────────────
const saasLanding: BuiltInTemplate = {
  id: "saas-landing",
  name: "SaaS Landing Page",
  description: "Conversion-optimized landing with hero, features, pricing, testimonials, and CTA.",
  category: "landing",
  is_featured: true,
  fork_count: 2140,
  tags: ["landing", "saas", "marketing"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { motion } from 'framer-motion'
import { CheckCircle, Zap, Shield, BarChart3, Star, ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'

const NAV_LINKS = ['Features', 'Pricing', 'Testimonials', 'FAQ']

const FEATURES = [
  { icon: Zap, title: 'Blazing Fast', desc: 'Built for performance. Ships in milliseconds, scales to millions.' },
  { icon: Shield, title: 'Secure by Default', desc: 'End-to-end encryption, SOC2 compliant, GDPR ready out of the box.' },
  { icon: BarChart3, title: 'Deep Analytics', desc: 'Real-time insights into every user action, funnel, and conversion.' },
]

const PLANS = [
  { name: 'Starter', price: '$0', features: ['5 projects', '1 team member', 'Community support'], cta: 'Get started free', accent: false },
  { name: 'Pro', price: '$29', features: ['Unlimited projects', '10 team members', 'Priority support', 'Analytics'], cta: 'Start free trial', accent: true },
  { name: 'Enterprise', price: 'Custom', features: ['Everything in Pro', 'Custom SSO', 'SLA guarantee', 'Dedicated CSM'], cta: 'Contact sales', accent: false },
]

const TESTIMONIALS = [
  { name: 'Sarah Kim', role: 'CTO at Verve', text: 'Shipped our MVP in 2 weeks. The DX is unmatched.', rating: 5 },
  { name: 'Marcus Lee', role: 'Founder at Lightpath', text: 'Replaced 3 tools with this one. Costs down 60%.', rating: 5 },
  { name: 'Priya Nair', role: 'Head of Eng at Trove', text: 'Our team productivity doubled in the first month.', rating: 5 },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg"><Zap className="w-5 h-5 text-violet-400" /> Launchpad</div>
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => <a key={l} href={\`#\${l.toLowerCase()}\`} className="text-sm text-slate-400 hover:text-white transition-colors">{l}</a>)}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button className="text-sm text-slate-300 hover:text-white">Log in</button>
            <button className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors">Get started</button>
          </div>
          <button className="md:hidden text-slate-400" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#0a0a0f] p-4 space-y-3">
            {NAV_LINKS.map(l => <a key={l} href={\`#\${l.toLowerCase()}\`} className="block text-slate-400 py-1" onClick={() => setMenuOpen(false)}>{l}</a>)}
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-violet-600/10 via-transparent to-transparent" style={{background:'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(139,92,246,0.15), transparent)'}} />
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.6}} className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm mb-6">
            <Star className="w-3.5 h-3.5" /> Rated #1 on Product Hunt
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            Build faster.<br />Ship smarter.
          </h1>
          <p className="text-xl text-slate-400 mb-10 max-w-xl mx-auto">The all-in-one platform that turns your ideas into production-ready software — in hours, not months.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="px-8 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold text-lg flex items-center gap-2 transition-colors">
              Start for free <ArrowRight className="w-5 h-5" />
            </button>
            <button className="px-8 py-3 border border-white/10 hover:border-white/20 rounded-xl font-semibold text-lg text-slate-300 transition-colors">
              See demo
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-6">No credit card required · 14-day free trial</p>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Everything you need</h2>
          <p className="text-slate-400 text-center mb-16 max-w-lg mx-auto">One platform. Zero compromises. Built for teams that care about quality.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.1}}
                className="p-6 rounded-2xl bg-white/[0.04] border border-white/[0.06] hover:border-violet-500/30 transition-all">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4"><f.icon className="w-5 h-5 text-violet-400" /></div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Simple pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.name} initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.1}}
                className={\`p-6 rounded-2xl border transition-all \${plan.accent ? 'bg-violet-600/10 border-violet-500/40 ring-1 ring-violet-500/20' : 'bg-white/[0.04] border-white/[0.06]'}\`}>
                {plan.accent && <div className="text-xs text-violet-300 font-semibold mb-3 uppercase tracking-wider">Most popular</div>}
                <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
                <div className="text-4xl font-extrabold mb-1">{plan.price}<span className="text-lg font-normal text-slate-400">{plan.price !== 'Custom' ? '/mo' : ''}</span></div>
                <ul className="space-y-2 my-6">
                  {plan.features.map(f => <li key={f} className="flex items-center gap-2 text-sm text-slate-300"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />{f}</li>)}
                </ul>
                <button className={\`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors \${plan.accent ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-white/[0.06] hover:bg-white/10 text-slate-300'}\`}>{plan.cta}</button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Loved by builders</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={t.name} initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.1}}
                className="p-6 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex gap-0.5 mb-4">{Array.from({length:t.rating}).map((_,j)=><Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div>
                <p className="text-slate-300 mb-4 text-sm">"{t.text}"</p>
                <div><div className="font-medium text-sm">{t.name}</div><div className="text-xs text-slate-500">{t.role}</div></div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 px-4 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Launchpad. Built with LifemarkAI.
      </footer>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────
const adminDashboard: BuiltInTemplate = {
  id: "admin-dashboard",
  name: "Admin Dashboard",
  description: "Full admin panel with sidebar navigation, KPI cards, data tables, and charts.",
  category: "dashboard",
  is_featured: true,
  fork_count: 1560,
  tags: ["dashboard", "admin", "analytics"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { LayoutDashboard, Users, ShoppingBag, Settings, Bell, Search, TrendingUp, TrendingDown, Menu, X, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

const revenue = [
  {m:'Jan',v:42000},{m:'Feb',v:48000},{m:'Mar',v:44000},{m:'Apr',v:62000},
  {m:'May',v:58000},{m:'Jun',v:72000},{m:'Jul',v:68000},{m:'Aug',v:81000},
]
const users = [
  {m:'Jan',v:1200},{m:'Feb',v:1900},{m:'Mar',v:1600},{m:'Apr',v:2400},
  {m:'May',v:2100},{m:'Jun',v:3100},{m:'Jul',v:2900},{m:'Aug',v:3800},
]
const STATS = [
  { label:'Total Revenue', value:'$81,240', change:'+12.5%', up:true, color:'violet' },
  { label:'Active Users', value:'3,842', change:'+8.2%', up:true, color:'blue' },
  { label:'New Orders', value:'284', change:'-3.1%', up:false, color:'emerald' },
  { label:'Churn Rate', value:'2.4%', change:'-0.8%', up:true, color:'amber' },
]
const ORDERS = [
  { id:'#4521', customer:'Alice Chen', product:'Pro Plan', amount:'$99', status:'paid' },
  { id:'#4520', customer:'Bob Wang', product:'Starter', amount:'$0', status:'active' },
  { id:'#4519', customer:'Carol Diaz', product:'Enterprise', amount:'$499', status:'paid' },
  { id:'#4518', customer:'Dave Kim', product:'Pro Plan', amount:'$99', status:'pending' },
  { id:'#4517', customer:'Eve Park', product:'Pro Plan', amount:'$99', status:'paid' },
]
const NAV = [
  { icon: LayoutDashboard, label:'Dashboard', active:true },
  { icon: Users, label:'Users', active:false },
  { icon: ShoppingBag, label:'Orders', active:false },
  { icon: Settings, label:'Settings', active:false },
]
const STATUS_COLORS: Record<string,string> = {
  paid:'bg-emerald-500/15 text-emerald-400',
  active:'bg-blue-500/15 text-blue-400',
  pending:'bg-amber-500/15 text-amber-400',
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={\`\${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-40 w-64 h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300\`}>
        <div className="h-16 flex items-center px-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center mr-3">A</div>
          <span className="font-bold">AdminPro</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(n => (
            <button key={n.label} className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors \${n.active ? 'bg-violet-600/20 text-violet-300' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}\`}>
              <n.icon className="w-4 h-4" />{n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">A</div>
            <div><div className="text-sm font-medium">Admin</div><div className="text-xs text-slate-500">admin@co.com</div></div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
          <button className="md:hidden text-slate-400" onClick={() => setSidebarOpen(v=>!v)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1 flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 max-w-sm">
            <Search className="w-4 h-4 text-slate-400" />
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" placeholder="Search..." />
          </div>
          <button className="relative p-2 rounded-lg hover:bg-slate-800"><Bell className="w-5 h-5 text-slate-400" /><span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" /></button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div><h1 className="text-xl font-bold">Dashboard</h1><p className="text-sm text-slate-400">Welcome back, Admin</p></div>
            <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors">
              View reports <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map(s => (
              <div key={s.label} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-xs text-slate-400 mb-2">{s.label}</p>
                <p className="text-2xl font-bold mb-1">{s.value}</p>
                <div className={\`flex items-center gap-1 text-xs \${s.up ? 'text-emerald-400' : 'text-red-400'}\`}>
                  {s.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {s.change} vs last month
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="font-semibold mb-4">Revenue</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenue}><defs><linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="m" tick={{fill:'#64748b',fontSize:11}} /><YAxis tick={{fill:'#64748b',fontSize:11}} /><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:8}} /><Area type="monotone" dataKey="v" stroke="#7c3aed" fill="url(#rv)" strokeWidth={2} /></AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="font-semibold mb-4">New Users</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={users}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="m" tick={{fill:'#64748b',fontSize:11}} /><YAxis tick={{fill:'#64748b',fontSize:11}} /><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:8}} /><Bar dataKey="v" fill="#3b82f6" radius={[4,4,0,0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Orders table */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800"><h3 className="font-semibold">Recent Orders</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-800">{['Order','Customer','Product','Amount','Status'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">{h}</th>)}</tr></thead>
                <tbody>{ORDERS.map(o=><tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"><td className="px-4 py-3 font-mono text-slate-400 text-xs">{o.id}</td><td className="px-4 py-3 font-medium">{o.customer}</td><td className="px-4 py-3 text-slate-400">{o.product}</td><td className="px-4 py-3 font-semibold">{o.amount}</td><td className="px-4 py-3"><span className={\`px-2 py-0.5 rounded-full text-xs font-medium \${STATUS_COLORS[o.status]}\`}>{o.status}</span></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}`,
  }, [], { recharts: "^2.12.0" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. E-Commerce Store
// ─────────────────────────────────────────────────────────────────────────────
const ecommerceStore: BuiltInTemplate = {
  id: "ecommerce-store",
  name: "E-Commerce Store",
  description: "Product catalog with cart, checkout flow, filters, and order summary.",
  category: "ecommerce",
  is_featured: true,
  fork_count: 1890,
  tags: ["ecommerce", "shop", "cart"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { ShoppingCart, Star, Plus, Minus, X, Search, SlidersHorizontal } from 'lucide-react'

interface Product { id:number; name:string; price:number; category:string; rating:number; reviews:number; image:string; badge?:string }
interface CartItem { product:Product; qty:number }

const PRODUCTS: Product[] = [
  { id:1, name:'Premium Wireless Headphones', price:299, category:'Electronics', rating:4.8, reviews:2341, image:'🎧', badge:'Best Seller' },
  { id:2, name:'Ergonomic Office Chair', price:449, category:'Furniture', rating:4.7, reviews:891, image:'🪑', badge:'New' },
  { id:3, name:'Mechanical Keyboard', price:189, category:'Electronics', rating:4.9, reviews:1205, image:'⌨️' },
  { id:4, name:'Ceramic Pour-Over Set', price:89, category:'Kitchen', rating:4.6, reviews:543, image:'☕' },
  { id:5, name:'Minimalist Watch', price:349, category:'Accessories', rating:4.8, reviews:723, image:'⌚', badge:'Limited' },
  { id:6, name:'Yoga Mat Pro', price:79, category:'Sports', rating:4.7, reviews:1890, image:'🧘' },
]

const CATEGORIES = ['All', 'Electronics', 'Furniture', 'Kitchen', 'Accessories', 'Sports']

export default function App() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')

  const addToCart = (p: Product) => setCart(c => { const ex = c.find(i=>i.product.id===p.id); return ex ? c.map(i=>i.product.id===p.id?{...i,qty:i.qty+1}:i) : [...c,{product:p,qty:1}] })
  const removeFromCart = (id:number) => setCart(c => c.filter(i=>i.product.id!==id))
  const changeQty = (id:number, delta:number) => setCart(c => c.map(i=>i.product.id===id?{...i,qty:Math.max(1,i.qty+delta)}:i))
  const total = cart.reduce((s,i)=>s+i.product.price*i.qty, 0)
  const totalItems = cart.reduce((s,i)=>s+i.qty, 0)
  const filtered = PRODUCTS.filter(p=>(category==='All'||p.category===category)&&p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="font-bold text-xl text-slate-900">🛍️ ShopCo</div>
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 max-w-md mx-auto">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder="Search products..." />
          </div>
          <button onClick={()=>setCartOpen(true)} className="relative flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-slate-700 transition-colors">
            <ShoppingCart className="w-4 h-4" /> Cart
            {totalItems>0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center text-xs font-bold">{totalItems}</span>}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          {CATEGORIES.map(c=><button key={c} onClick={()=>setCategory(c)} className={\`px-3 py-1.5 rounded-full text-sm font-medium transition-colors \${category===c?'bg-slate-900 text-white':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}\`}>{c}</button>)}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(p=>(
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group">
              <div className="h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-5xl relative">
                {p.image}
                {p.badge && <span className="absolute top-2 left-2 px-2 py-0.5 bg-violet-600 text-white text-xs font-semibold rounded-full">{p.badge}</span>}
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-400 mb-1">{p.category}</p>
                <h3 className="font-semibold text-sm mb-2 line-clamp-2">{p.name}</h3>
                <div className="flex items-center gap-1 mb-3">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-medium">{p.rating}</span>
                  <span className="text-xs text-gray-400">({p.reviews.toLocaleString()})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">\${p.price}</span>
                  <button onClick={()=>addToCart(p)} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors">Add to cart</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={()=>setCartOpen(false)} />
          <div className="w-96 bg-white flex flex-col shadow-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">Cart ({totalItems})</h2>
              <button onClick={()=>setCartOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length===0 ? <div className="text-center py-12 text-gray-400"><ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Your cart is empty</p></div> :
                cart.map(item=>(
                  <div key={item.product.id} className="flex gap-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center text-3xl shrink-0">{item.product.image}</div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.product.name}</p>
                      <p className="font-bold">\${item.product.price}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={()=>changeQty(item.product.id,-1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                        <span className="text-sm font-medium">{item.qty}</span>
                        <button onClick={()=>changeQty(item.product.id,1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <button onClick={()=>removeFromCart(item.product.id)} className="text-gray-300 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                ))
              }
            </div>
            {cart.length>0 && (
              <div className="p-4 border-t space-y-3">
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span>\${total.toFixed(2)}</span></div>
                <button className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition-colors">Checkout</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. SaaS Starter (auth + dashboard)
// ─────────────────────────────────────────────────────────────────────────────
const saasStarter: BuiltInTemplate = {
  id: "saas-starter",
  name: "SaaS Starter",
  description: "Complete SaaS boilerplate with auth screens, onboarding, billing, and settings.",
  category: "saas",
  is_featured: true,
  fork_count: 3240,
  tags: ["saas", "auth", "billing"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Check, Eye, EyeOff, ArrowRight, Github, Mail } from 'lucide-react'

type Screen = 'landing' | 'login' | 'signup' | 'dashboard'

const FEATURES = ['Unlimited projects','AI-powered tools','Team collaboration','Priority support']

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [showPass, setShowPass] = useState(false)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <motion.div key="landing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center mb-6"><Zap className="w-6 h-6" /></div>
            <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">Your SaaS, fast.</h1>
            <p className="text-slate-400 text-xl mb-10 max-w-md">Everything you need to launch — authentication, billing, and a beautiful dashboard included.</p>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <button onClick={()=>setScreen('signup')} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold flex items-center gap-2 transition-colors">Get started <ArrowRight className="w-4 h-4" /></button>
              <button onClick={()=>setScreen('login')} className="px-8 py-3 border border-white/10 hover:border-white/20 rounded-xl font-semibold text-slate-300 transition-colors">Sign in</button>
            </div>
            <ul className="flex flex-col sm:flex-row gap-4 text-sm text-slate-400">
              {FEATURES.map(f=><li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{f}</li>)}
            </ul>
          </motion.div>
        )}

        {(screen === 'login' || screen === 'signup') && (
          <motion.div key="auth" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="flex items-center justify-center min-h-screen px-4">
            <div className="w-full max-w-sm">
              <div className="flex justify-center mb-8"><div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center"><Zap className="w-5 h-5" /></div></div>
              <h2 className="text-2xl font-bold text-center mb-2">{screen==='login'?'Welcome back':'Create account'}</h2>
              <p className="text-slate-400 text-center text-sm mb-8">{screen==='login'?'Sign in to your account':'Start your 14-day free trial'}</p>
              <div className="space-y-3">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 border border-white/10 rounded-lg text-sm hover:bg-white/5 transition-colors"><Github className="w-4 h-4" /> Continue with GitHub</button>
                <button className="w-full flex items-center justify-center gap-2 py-2.5 border border-white/10 rounded-lg text-sm hover:bg-white/5 transition-colors"><Mail className="w-4 h-4" /> Continue with Google</button>
              </div>
              <div className="flex items-center gap-3 my-6"><div className="flex-1 h-px bg-white/10" /><span className="text-xs text-slate-500">or</span><div className="flex-1 h-px bg-white/10" /></div>
              <div className="space-y-3">
                {screen==='signup' && <input className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-500 transition-colors" placeholder="Full name" />}
                <input className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-500 transition-colors" placeholder="Email address" type="email" />
                <div className="relative">
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-500 transition-colors pr-10" placeholder="Password" type={showPass?'text':'password'} />
                  <button onClick={()=>setShowPass(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPass?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button>
                </div>
                <button onClick={()=>setScreen('dashboard')} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg font-semibold text-sm transition-colors">
                  {screen==='login'?'Sign in':'Create account'}
                </button>
              </div>
              <p className="text-center text-sm text-slate-400 mt-6">
                {screen==='login'?<>Don't have an account? <button onClick={()=>setScreen('signup')} className="text-violet-400 hover:underline">Sign up</button></> : <>Already have an account? <button onClick={()=>setScreen('login')} className="text-violet-400 hover:underline">Sign in</button></>}
              </p>
            </div>
          </motion.div>
        )}

        {screen === 'dashboard' && (
          <motion.div key="dash" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div><h1 className="text-2xl font-bold">Good morning! 👋</h1><p className="text-slate-400 text-sm">Here's what's happening today</p></div>
                <button onClick={()=>setScreen('landing')} className="text-sm text-slate-400 hover:text-white">Sign out</button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[{l:'MRR',v:'$8,430',c:'+22%'},{l:'Active Users',v:'1,284',c:'+8%'},{l:'Churn',v:'1.2%',c:'-0.3%'}].map(s=>(
                  <div key={s.l} className="p-5 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-sm text-slate-400 mb-1">{s.l}</p>
                    <p className="text-2xl font-bold">{s.v}</p>
                    <p className="text-xs text-emerald-400 mt-1">{s.c} this month</p>
                  </div>
                ))}
              </div>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h3 className="font-semibold mb-4">Recent activity</h3>
                {['New signup: alice@example.com','Upgrade: Bob Kim → Pro plan','Payment received: $99','New signup: carol@example.com'].map((item,i)=>(
                  <div key={i} className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0"><div className="w-2 h-2 rounded-full bg-violet-400 shrink-0" /><span className="text-sm text-slate-300">{item}</span></div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Kanban Board
// ─────────────────────────────────────────────────────────────────────────────
const kanbanBoard: BuiltInTemplate = {
  id: "kanban-board",
  name: "Kanban Board",
  description: "Drag-and-drop project board with columns, cards, labels, and priority indicators.",
  category: "saas",
  is_featured: true,
  fork_count: 1240,
  tags: ["kanban", "project", "productivity"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { Plus, X, GripVertical, Circle, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Card { id:string; title:string; priority:'low'|'medium'|'high'; label:string }
interface Column { id:string; title:string; color:string; cards:Card[] }

const PRIORITY_CONFIG = {
  low: { icon: Circle, color:'text-slate-400', bg:'bg-slate-400/10' },
  medium: { icon: AlertCircle, color:'text-amber-400', bg:'bg-amber-400/10' },
  high: { icon: CheckCircle2, color:'text-red-400', bg:'bg-red-400/10' },
}

const LABELS = ['Design','Frontend','Backend','Bug','Feature','Docs']

const INITIAL: Column[] = [
  { id:'todo', title:'To Do', color:'bg-slate-400', cards:[
    { id:'1', title:'Design new onboarding flow', priority:'high', label:'Design' },
    { id:'2', title:'Update API documentation', priority:'low', label:'Docs' },
    { id:'3', title:'Refactor auth module', priority:'medium', label:'Backend' },
  ]},
  { id:'progress', title:'In Progress', color:'bg-blue-400', cards:[
    { id:'4', title:'Build settings page UI', priority:'medium', label:'Frontend' },
    { id:'5', title:'Fix payment webhook race condition', priority:'high', label:'Bug' },
  ]},
  { id:'review', title:'In Review', color:'bg-amber-400', cards:[
    { id:'6', title:'Mobile responsive layout', priority:'medium', label:'Frontend' },
  ]},
  { id:'done', title:'Done', color:'bg-emerald-400', cards:[
    { id:'7', title:'Set up CI/CD pipeline', priority:'low', label:'Backend' },
    { id:'8', title:'Add dark mode', priority:'low', label:'Frontend' },
  ]},
]

export default function App() {
  const [columns, setColumns] = useState<Column[]>(INITIAL)
  const [dragging, setDragging] = useState<{cardId:string;fromCol:string}|null>(null)
  const [addingTo, setAddingTo] = useState<string|null>(null)
  const [newTitle, setNewTitle] = useState('')

  const onDragStart = (cardId:string, fromCol:string) => setDragging({cardId,fromCol})
  const onDrop = (toCol:string) => {
    if (!dragging || dragging.fromCol===toCol) { setDragging(null); return }
    setColumns(cols => {
      const from = cols.find(c=>c.id===dragging.fromCol)!
      const card = from.cards.find(c=>c.id===dragging.cardId)!
      return cols.map(col => {
        if (col.id===dragging.fromCol) return {...col,cards:col.cards.filter(c=>c.id!==dragging.cardId)}
        if (col.id===toCol) return {...col,cards:[...col.cards,card]}
        return col
      })
    })
    setDragging(null)
  }

  const addCard = (colId:string) => {
    if (!newTitle.trim()) return
    const card: Card = { id: Date.now().toString(), title:newTitle.trim(), priority:'medium', label:'Feature' }
    setColumns(cols => cols.map(c => c.id===colId ? {...c,cards:[...c.cards,card]} : c))
    setNewTitle(''); setAddingTo(null)
  }

  const removeCard = (colId:string, cardId:string) => setColumns(cols => cols.map(c => c.id===colId ? {...c,cards:c.cards.filter(ca=>ca.id!==cardId)} : c))

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Project Board</h1>
            <p className="text-slate-400 text-sm">{columns.reduce((s,c)=>s+c.cards.length,0)} tasks across {columns.length} columns</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> Add task</button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(col => (
            <div key={col.id} className="shrink-0 w-72 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex flex-col max-h-[calc(100vh-160px)]"
              onDragOver={e=>{e.preventDefault()}} onDrop={()=>onDrop(col.id)}>
              <div className="p-3 border-b border-slate-700/50 flex items-center gap-2 shrink-0">
                <div className={\`w-2 h-2 rounded-full \${col.color}\`} />
                <span className="font-medium text-sm">{col.title}</span>
                <span className="ml-auto text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">{col.cards.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {col.cards.map(card => {
                  const P = PRIORITY_CONFIG[card.priority]
                  return (
                    <div key={card.id} draggable onDragStart={()=>onDragStart(card.id,col.id)}
                      className="bg-slate-800 rounded-xl border border-slate-700/50 p-3 cursor-grab active:cursor-grabbing hover:border-violet-500/30 transition-all group">
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{card.title}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs px-2 py-0.5 bg-violet-500/15 text-violet-300 rounded-full">{card.label}</span>
                            <div className={\`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full \${P.bg} \${P.color}\`}>
                              <P.icon className="w-3 h-3" />{card.priority}
                            </div>
                          </div>
                        </div>
                        <button onClick={()=>removeCard(col.id,card.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-all shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-3 border-t border-slate-700/50 shrink-0">
                {addingTo===col.id ? (
                  <div className="space-y-2">
                    <input autoFocus value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCard(col.id);if(e.key==='Escape')setAddingTo(null)}}
                      className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none border border-slate-600 focus:border-violet-500" placeholder="Task title..." />
                    <div className="flex gap-2"><button onClick={()=>addCard(col.id)} className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors">Add</button><button onClick={()=>setAddingTo(null)} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-colors">Cancel</button></div>
                  </div>
                ) : (
                  <button onClick={()=>setAddingTo(col.id)} className="w-full flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm py-1 transition-colors">
                    <Plus className="w-4 h-4" /> Add a card
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Todo App
// ─────────────────────────────────────────────────────────────────────────────
const todoApp: BuiltInTemplate = {
  id: "todo-app",
  name: "Todo App",
  description: "Minimal GTD-style task manager with views, projects, priorities, and due dates.",
  category: "saas",
  is_featured: false,
  fork_count: 3400,
  tags: ["todo", "tasks", "productivity"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Plus, Check, Trash2, Circle, Flag, Calendar, Inbox, Star, Sun } from 'lucide-react'

interface Task { id:string; title:string; done:boolean; priority:'low'|'medium'|'high'; due?:string; project:string }

const PROJECTS = ['Inbox','Work','Personal','Side Project']
const PRIORITY: Record<string,string> = { low:'text-slate-400', medium:'text-amber-400', high:'text-red-400' }

const INITIAL: Task[] = [
  { id:'1', title:'Finish quarterly report', done:false, priority:'high', due:'Today', project:'Work' },
  { id:'2', title:'Reply to design feedback', done:false, priority:'medium', due:'Today', project:'Work' },
  { id:'3', title:'Book dentist appointment', done:false, priority:'low', due:'Tomorrow', project:'Personal' },
  { id:'4', title:'Ship v2 landing page', done:false, priority:'high', due:'Tomorrow', project:'Side Project' },
  { id:'5', title:'Read design systems article', done:true, priority:'low', project:'Personal' },
]

const VIEWS = [
  { id:'today', label:'Today', icon:Sun },
  { id:'upcoming', label:'Upcoming', icon:Calendar },
  { id:'all', label:'All Tasks', icon:Inbox },
  { id:'important', label:'Important', icon:Star },
]

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL)
  const [view, setView] = useState('today')
  const [input, setInput] = useState('')
  const [project, setProject] = useState('Inbox')

  const add = () => {
    if (!input.trim()) return
    setTasks(t => [{ id:Date.now().toString(), title:input.trim(), done:false, priority:'medium', due:'Today', project }, ...t])
    setInput('')
  }
  const toggle = (id:string) => setTasks(t => t.map(x => x.id===id ? {...x, done:!x.done} : x))
  const remove = (id:string) => setTasks(t => t.filter(x => x.id!==id))

  const visible = tasks.filter(t => {
    if (view==='today') return t.due==='Today'
    if (view==='upcoming') return t.due==='Tomorrow'
    if (view==='important') return t.priority==='high'
    return true
  })
  const remaining = visible.filter(t=>!t.done).length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-60 border-r border-slate-800 p-4 hidden md:block">
        <div className="font-bold text-lg mb-6 flex items-center gap-2"><Check className="w-5 h-5 text-violet-400" /> Tasks</div>
        <nav className="space-y-1 mb-6">
          {VIEWS.map(v => (
            <button key={v.id} onClick={()=>setView(v.id)}
              className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                view===v.id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
              <v.icon className="w-4 h-4" /> {v.label}
            </button>
          ))}
        </nav>
        <p className="text-xs uppercase text-slate-500 px-3 mb-2 tracking-wider">Projects</p>
        <div className="space-y-1">
          {PROJECTS.map(p => (
            <div key={p} className="flex items-center gap-3 px-3 py-1.5 text-sm text-slate-400">
              <Circle className="w-2 h-2 fill-violet-400 text-violet-400" /> {p}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 max-w-2xl mx-auto p-6 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold capitalize">{VIEWS.find(v=>v.id===view)?.label}</h1>
          <p className="text-sm text-slate-400">{remaining} task{remaining!==1?'s':''} remaining</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 mb-4 focus-within:border-violet-500 transition-colors">
          <Plus className="w-4 h-4 text-slate-500" />
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" placeholder="Add a task and press Enter..." />
          <select value={project} onChange={e=>setProject(e.target.value)} className="bg-slate-800 text-xs rounded-md px-2 py-1 outline-none text-slate-300">
            {PROJECTS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          {visible.map(t => (
            <div key={t.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-900 transition-colors">
              <button onClick={()=>toggle(t.id)}
                className={clsx('w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                  t.done ? 'bg-violet-600 border-violet-600' : 'border-slate-600 hover:border-violet-500')}>
                {t.done && <Check className="w-3 h-3" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={clsx('text-sm', t.done && 'line-through text-slate-500')}>{t.title}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span>{t.project}</span>
                  {t.due && <><span>·</span><span>{t.due}</span></>}
                </div>
              </div>
              <Flag className={clsx('w-3.5 h-3.5 shrink-0', PRIORITY[t.priority])} />
              <button onClick={()=>remove(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {visible.length===0 && (
            <div className="text-center py-16 text-slate-500"><Check className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Nothing here. Enjoy the calm.</p></div>
          )}
        </div>
      </main>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Developer Portfolio
// ─────────────────────────────────────────────────────────────────────────────
const portfolio: BuiltInTemplate = {
  id: "portfolio",
  name: "Developer Portfolio",
  description: "Minimal dark portfolio with projects grid, animated skills, and contact section.",
  category: "landing",
  is_featured: false,
  fork_count: 2100,
  tags: ["portfolio", "resume", "personal"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { motion } from 'framer-motion'
import { Github, Linkedin, Twitter, Mail, ArrowUpRight, MapPin } from 'lucide-react'

const PROJECTS = [
  { name:'Orbit Analytics', desc:'Real-time product analytics processing 2B+ events/day.', tags:['React','Node','ClickHouse'], emoji:'📊' },
  { name:'Pulse', desc:'Open-source uptime monitor with 4k+ GitHub stars.', tags:['TypeScript','Go','Redis'], emoji:'💓' },
  { name:'Canvas AI', desc:'Generative design tool used by 12k creators.', tags:['Next.js','Python','WebGL'], emoji:'🎨' },
  { name:'Ledger', desc:'Personal finance app with bank sync and budgeting.', tags:['React Native','Supabase'], emoji:'💸' },
]
const SKILLS = [ { name:'Frontend', level:95 }, { name:'Backend', level:88 }, { name:'Design', level:78 }, { name:'DevOps', level:72 } ]
const SOCIALS = [ { icon:Github, href:'#' }, { icon:Linkedin, href:'#' }, { icon:Twitter, href:'#' }, { icon:Mail, href:'#' } ]

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/70 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-bold">Alex Rivera</span>
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="#work" className="hover:text-white transition-colors">Work</a>
            <a href="#about" className="hover:text-white transition-colors">About</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-6 pt-40 pb-24">
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>
          <div className="flex items-center gap-2 text-sm text-emerald-400 mb-4"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Available for freelance</div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6">Hi, I'm Alex.<br /><span className="text-slate-500">I build delightful software.</span></h1>
          <p className="text-lg text-slate-400 max-w-xl mb-8">Full-stack engineer and designer crafting fast, accessible products. Previously at Stripe and Linear.</p>
          <div className="flex items-center gap-4 text-sm text-slate-400 mb-8"><span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> San Francisco, CA</span></div>
          <div className="flex gap-3">
            {SOCIALS.map((s,i)=><a key={i} href={s.href} className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/10 transition-colors"><s.icon className="w-4 h-4" /></a>)}
          </div>
        </motion.div>
      </section>

      <section id="work" className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-sm uppercase tracking-wider text-slate-500 mb-8">Selected Work</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {PROJECTS.map((p,i)=>(
            <motion.a key={p.name} href="#" initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.1}}
              className="group p-5 rounded-2xl bg-white/[0.04] border border-white/[0.06] hover:border-violet-500/30 transition-all">
              <div className="flex items-start justify-between mb-3"><span className="text-3xl">{p.emoji}</span><ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors" /></div>
              <h3 className="font-semibold mb-1">{p.name}</h3>
              <p className="text-sm text-slate-400 mb-3">{p.desc}</p>
              <div className="flex flex-wrap gap-1.5">{p.tags.map(t=><span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-400">{t}</span>)}</div>
            </motion.a>
          ))}
        </div>
      </section>

      <section id="about" className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-sm uppercase tracking-wider text-slate-500 mb-8">Skills</h2>
        <div className="space-y-4">
          {SKILLS.map((s,i)=>(
            <div key={s.name}>
              <div className="flex justify-between text-sm mb-1.5"><span>{s.name}</span><span className="text-slate-500">{s.level}%</span></div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div initial={{width:0}} whileInView={{width:s.level+'%'}} viewport={{once:true}} transition={{duration:0.8,delay:i*0.1}} className="h-full bg-gradient-to-r from-violet-500 to-purple-500" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">Let's work together</h2>
        <p className="text-slate-400 mb-8">Have a project in mind? I'd love to hear about it.</p>
        <a href="#" className="inline-flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold transition-colors">Get in touch <Mail className="w-4 h-4" /></a>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-sm text-slate-500">Built with LifemarkAI</footer>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Finance Tracker
// ─────────────────────────────────────────────────────────────────────────────
const financeTracker: BuiltInTemplate = {
  id: "finance-tracker",
  name: "Finance Tracker",
  description: "Track net worth, income, spending by category, and recent transactions.",
  category: "dashboard",
  is_featured: true,
  fork_count: 1670,
  tags: ["finance", "budget", "money"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft, ShoppingBag, Coffee, Home, Car } from 'lucide-react'
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, Tooltip, CartesianGrid } from 'recharts'

const NET_WORTH = [
  {m:'Jan',v:38200},{m:'Feb',v:39800},{m:'Mar',v:41200},{m:'Apr',v:40500},{m:'May',v:43900},{m:'Jun',v:46800},
]
const CATEGORIES = [
  { name:'Housing', value:1800, color:'#7c3aed' },
  { name:'Food', value:640, color:'#3b82f6' },
  { name:'Transport', value:320, color:'#10b981' },
  { name:'Shopping', value:480, color:'#f59e0b' },
  { name:'Utilities', value:210, color:'#ef4444' },
]
const TX = [
  { name:'Whole Foods', cat:'Food', amount:-84.20, icon:Coffee, when:'Today' },
  { name:'Salary — Acme Inc', cat:'Income', amount:5400, icon:ArrowDownLeft, when:'Yesterday' },
  { name:'Rent', cat:'Housing', amount:-1800, icon:Home, when:'2 days ago' },
  { name:'Uber', cat:'Transport', amount:-23.50, icon:Car, when:'3 days ago' },
  { name:'Amazon', cat:'Shopping', amount:-129.99, icon:ShoppingBag, when:'4 days ago' },
]

function money(n:number) { return (n<0?'-':'') + '$' + Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) }

export default function App() {
  const [range, setRange] = useState('6M')
  const totalSpend = CATEGORIES.reduce((s,c)=>s+c.value,0)
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Finances</h1><p className="text-sm text-slate-400">Your money at a glance</p></div>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {['1M','6M','1Y'].map(r=><button key={r} onClick={()=>setRange(r)} className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors', range===r?'bg-violet-600 text-white':'text-slate-400 hover:text-white')}>{r}</button>)}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {label:'Net Worth', value:money(46800), change:'+6.6%', up:true, icon:Wallet},
            {label:'Income (mo)', value:money(5400), change:'+0%', up:true, icon:ArrowDownLeft},
            {label:'Spending (mo)', value:money(totalSpend), change:'-4.2%', up:true, icon:ArrowUpRight},
          ].map(s=>(
            <div key={s.label} className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2"><p className="text-xs text-slate-400">{s.label}</p><s.icon className="w-4 h-4 text-slate-500" /></div>
              <p className="text-2xl font-bold mb-1">{s.value}</p>
              <div className={clsx('flex items-center gap-1 text-xs', s.up?'text-emerald-400':'text-red-400')}>{s.up?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}{s.change} vs last month</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-semibold mb-4">Net Worth</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={NET_WORTH}><defs><linearGradient id="nw" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="m" tick={{fill:'#64748b',fontSize:11}} /><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:8}} /><Area type="monotone" dataKey="v" stroke="#7c3aed" fill="url(#nw)" strokeWidth={2} /></AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-semibold mb-4">Spending</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart><Pie data={CATEGORIES} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>{CATEGORIES.map(c=><Cell key={c.name} fill={c.color} stroke="none" />)}</Pie><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:8}} /></PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">{CATEGORIES.map(c=><div key={c.name} className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full" style={{background:c.color}} /><span className="text-slate-400 flex-1">{c.name}</span><span className="font-medium">{money(c.value)}</span></div>)}</div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800"><h3 className="font-semibold">Recent Transactions</h3></div>
          <div>{TX.map((t,i)=>(
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 last:border-0">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0"><t.icon className="w-4 h-4 text-slate-400" /></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium">{t.name}</p><p className="text-xs text-slate-500">{t.cat} · {t.when}</p></div>
              <span className={clsx('text-sm font-semibold', t.amount<0?'text-slate-200':'text-emerald-400')}>{money(t.amount)}</span>
            </div>
          ))}</div>
        </div>
      </div>
    </div>
  )
}`,
  }, [], { recharts: "^2.12.0" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. Notes App
// ─────────────────────────────────────────────────────────────────────────────
const notesApp: BuiltInTemplate = {
  id: "notes-app",
  name: "Notes App",
  description: "Notion-inspired notes with a searchable sidebar, tags, stars, and live editing.",
  category: "saas",
  is_featured: false,
  fork_count: 2890,
  tags: ["notes", "writing", "knowledge"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Search, Plus, FileText, Star, Hash, Trash2, MoreHorizontal } from 'lucide-react'

interface Note { id:string; title:string; body:string; tag:string; starred:boolean; edited:string }

const TAGS = ['Ideas','Work','Personal','Research']
const INITIAL: Note[] = [
  { id:'1', title:'Product roadmap Q3', body:'Focus areas: onboarding revamp, mobile app beta, and the new analytics dashboard. Key metric: activation rate from 34% to 50%.', tag:'Work', starred:true, edited:'2h ago' },
  { id:'2', title:'Book notes — Shape Up', body:'Six-week cycles. Appetite, not estimates. The betting table decides what to build. Hill charts over burndown.', tag:'Research', starred:false, edited:'Yesterday' },
  { id:'3', title:'Weekend trip ideas', body:'Big Sur camping, Tahoe hike, or the Mendocino coast. Check weather and book early for the long weekend.', tag:'Personal', starred:false, edited:'2 days ago' },
  { id:'4', title:'Startup idea: habit OS', body:'A calm app that connects habits to identity. Less streak-shaming, more reflection. Could pair with journaling.', tag:'Ideas', starred:true, edited:'3 days ago' },
]

export default function App() {
  const [notes, setNotes] = useState<Note[]>(INITIAL)
  const [activeId, setActiveId] = useState('1')
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('All')

  const active = notes.find(n=>n.id===activeId)
  const filtered = notes.filter(n => (tag==='All'||n.tag===tag) && (n.title+n.body).toLowerCase().includes(search.toLowerCase()))

  const update = (field:'title'|'body', value:string) => setNotes(ns => ns.map(n => n.id===activeId ? {...n, body:field==='body'?value:n.body, title:field==='title'?value:n.title, edited:'just now'} : n))
  const create = () => { const n:Note = { id:Date.now().toString(), title:'Untitled', body:'', tag:'Ideas', starred:false, edited:'just now' }; setNotes(x=>[n,...x]); setActiveId(n.id) }
  const remove = (id:string) => { setNotes(x=>x.filter(n=>n.id!==id)); if(activeId===id) setActiveId(notes[0]?.id??'') }
  const star = (id:string) => setNotes(ns=>ns.map(n=>n.id===id?{...n,starred:!n.starred}:n))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-72 border-r border-slate-800 flex flex-col">
        <div className="p-3 border-b border-slate-800">
          <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 mb-3"><Search className="w-4 h-4 text-slate-500" /><input value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" placeholder="Search notes..." /></div>
          <div className="flex gap-1 flex-wrap">
            {['All',...TAGS].map(t=><button key={t} onClick={()=>setTag(t)} className={clsx('px-2 py-1 rounded-md text-xs font-medium transition-colors', tag===t?'bg-violet-600/20 text-violet-300':'text-slate-400 hover:bg-slate-800')}>{t}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(n=>(
            <button key={n.id} onClick={()=>setActiveId(n.id)} className={clsx('w-full text-left px-4 py-3 border-b border-slate-800/50 transition-colors group', activeId===n.id?'bg-slate-900':'hover:bg-slate-900/50')}>
              <div className="flex items-center gap-2 mb-1"><FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" /><span className="text-sm font-medium truncate flex-1">{n.title}</span>{n.starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}</div>
              <p className="text-xs text-slate-500 line-clamp-2 mb-1">{n.body || 'No content'}</p>
              <div className="flex items-center gap-2 text-xs text-slate-600"><span className="flex items-center gap-1"><Hash className="w-2.5 h-2.5" />{n.tag}</span><span>·</span><span>{n.edited}</span></div>
            </button>
          ))}
        </div>
        <button onClick={create} className="m-3 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> New note</button>
      </aside>

      <main className="flex-1 flex flex-col">
        {active ? (
          <>
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6">
              <span className="text-xs text-slate-500">Edited {active.edited}</span>
              <div className="flex items-center gap-1">
                <button onClick={()=>star(active.id)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors"><Star className={clsx('w-4 h-4', active.starred?'fill-amber-400 text-amber-400':'text-slate-400')} /></button>
                <button onClick={()=>remove(active.id)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                <button className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400"><MoreHorizontal className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-8 max-w-2xl mx-auto w-full">
              <input value={active.title} onChange={e=>update('title',e.target.value)} className="w-full bg-transparent text-3xl font-bold outline-none mb-4 placeholder:text-slate-600" placeholder="Untitled" />
              <textarea value={active.body} onChange={e=>update('body',e.target.value)} className="w-full bg-transparent text-slate-300 outline-none resize-none leading-relaxed min-h-[60vh] placeholder:text-slate-600" placeholder="Start writing..." />
            </div>
          </>
        ) : <div className="flex-1 flex items-center justify-center text-slate-500"><div className="text-center"><FileText className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Select or create a note</p></div></div>}
      </main>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. Analytics Dashboard
// ─────────────────────────────────────────────────────────────────────────────
const analyticsDashboard: BuiltInTemplate = {
  id: "analytics-dashboard",
  name: "Analytics Dashboard",
  description: "Real-time analytics with KPI cards, traffic charts, sources, and a conversion funnel.",
  category: "analytics",
  is_featured: true,
  fork_count: 1560,
  tags: ["analytics", "charts", "metrics"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Users, Eye, MousePointerClick, Timer, TrendingUp, TrendingDown, Globe } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

const TRAFFIC = [
  {d:'Mon',v:3200},{d:'Tue',v:4100},{d:'Wed',v:3800},{d:'Thu',v:5200},{d:'Fri',v:4900},{d:'Sat',v:3100},{d:'Sun',v:2800},
]
const DEVICES = [ {name:'Desktop',v:5200},{name:'Mobile',v:6800},{name:'Tablet',v:1200} ]
const KPIS = [
  {label:'Active Users', value:'12,840', change:'+14.2%', up:true, icon:Users},
  {label:'Page Views', value:'48.2k', change:'+8.1%', up:true, icon:Eye},
  {label:'Click Rate', value:'3.8%', change:'-0.4%', up:false, icon:MousePointerClick},
  {label:'Avg. Session', value:'4m 12s', change:'+0.9%', up:true, icon:Timer},
]
const SOURCES = [
  {src:'Google', visits:18400, pct:42, color:'bg-blue-500'},
  {src:'Direct', visits:9200, pct:21, color:'bg-violet-500'},
  {src:'Twitter / X', visits:6100, pct:14, color:'bg-sky-500'},
  {src:'GitHub', visits:4800, pct:11, color:'bg-slate-400'},
  {src:'Newsletter', visits:5200, pct:12, color:'bg-emerald-500'},
]
const FUNNEL = [
  {step:'Visited', count:12840, pct:100},
  {step:'Signed up', count:4210, pct:33},
  {step:'Activated', count:2380, pct:19},
  {step:'Subscribed', count:840, pct:7},
]

export default function App() {
  const [range, setRange] = useState('7D')
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h1 className="text-2xl font-bold">Analytics</h1><p className="text-sm text-slate-400">Overview of your traffic and conversions</p></div>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {['24H','7D','30D','90D'].map(r=><button key={r} onClick={()=>setRange(r)} className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors', range===r?'bg-violet-600 text-white':'text-slate-400 hover:text-white')}>{r}</button>)}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map(k=>(
            <div key={k.label} className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2"><p className="text-xs text-slate-400">{k.label}</p><k.icon className="w-4 h-4 text-slate-500" /></div>
              <p className="text-2xl font-bold mb-1">{k.value}</p>
              <div className={clsx('flex items-center gap-1 text-xs', k.up?'text-emerald-400':'text-red-400')}>{k.up?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}{k.change}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-semibold mb-4">Traffic</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={TRAFFIC}><defs><linearGradient id="tr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:11}} /><YAxis tick={{fill:'#64748b',fontSize:11}} /><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:8}} /><Area type="monotone" dataKey="v" stroke="#7c3aed" fill="url(#tr)" strokeWidth={2} /></AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-semibold mb-4">By Device</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={DEVICES}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="name" tick={{fill:'#64748b',fontSize:11}} /><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:8}} /><Bar dataKey="v" fill="#3b82f6" radius={[4,4,0,0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-semibold mb-4">Traffic Sources</h3>
            <div className="space-y-3">
              {SOURCES.map(s=>(
                <div key={s.src}>
                  <div className="flex items-center justify-between text-sm mb-1"><span className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-slate-500" />{s.src}</span><span className="text-slate-400">{s.visits.toLocaleString()}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className={clsx('h-full rounded-full', s.color)} style={{width:s.pct+'%'}} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-semibold mb-4">Conversion Funnel</h3>
            <div className="space-y-2">
              {FUNNEL.map(f=>(
                <div key={f.step} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-20 shrink-0">{f.step}</span>
                  <div className="flex-1 h-7 rounded-lg bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 flex items-center px-2" style={{width:f.pct+'%'}}><span className="text-xs font-medium">{f.count.toLocaleString()}</span></div>
                  </div>
                  <span className="text-xs text-slate-500 w-10 text-right">{f.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}`,
  }, [], { recharts: "^2.12.0" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. Weather App
// ─────────────────────────────────────────────────────────────────────────────
const weatherApp: BuiltInTemplate = {
  id: "weather-app",
  name: "Weather App",
  description: "Weather dashboard with current conditions, hourly chart, and a 7-day forecast.",
  category: "dashboard",
  is_featured: false,
  fork_count: 1890,
  tags: ["weather", "forecast", "dashboard"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Search, Droplets, Wind, Eye, Sunrise, MapPin } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts'

const HOURLY = [
  {t:'9AM',temp:62},{t:'12PM',temp:68},{t:'3PM',temp:72},{t:'6PM',temp:69},{t:'9PM',temp:64},{t:'12AM',temp:58},
]
const WEEK = [
  {day:'Mon',icon:'☀️',hi:74,lo:58},{day:'Tue',icon:'⛅',hi:71,lo:56},{day:'Wed',icon:'🌧️',hi:64,lo:54},
  {day:'Thu',icon:'🌦️',hi:66,lo:55},{day:'Fri',icon:'☀️',hi:73,lo:57},{day:'Sat',icon:'☀️',hi:76,lo:60},{day:'Sun',icon:'⛅',hi:70,lo:58},
]

export default function App() {
  const [unit, setUnit] = useState<'F'|'C'>('F')
  const [city, setCity] = useState('San Francisco')
  const conv = (f:number) => unit==='F' ? f : Math.round((f-32)*5/9)
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-900 via-slate-900 to-indigo-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 max-w-sm">
            <Search className="w-4 h-4 text-white/60" />
            <input value={city} onChange={e=>setCity(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/50" placeholder="Search city..." />
          </div>
          <div className="flex gap-1 bg-white/10 backdrop-blur rounded-full p-1">
            {(['F','C'] as const).map(u=><button key={u} onClick={()=>setUnit(u)} className={clsx('px-3 py-1 rounded-full text-xs font-semibold transition-colors', unit===u?'bg-white text-slate-900':'text-white/70')}>°{u}</button>)}
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-white/70 text-sm mb-1"><MapPin className="w-4 h-4" />{city}</div>
            <div className="flex items-start gap-2"><span className="text-7xl font-extralight">{conv(68)}°</span><span className="text-2xl mt-3">{unit}</span></div>
            <p className="text-white/80">Partly cloudy · Feels like {conv(66)}°</p>
          </div>
          <div className="text-8xl">⛅</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{icon:Droplets,label:'Humidity',val:'64%'},{icon:Wind,label:'Wind',val:'8 mph'},{icon:Eye,label:'Visibility',val:'10 mi'},{icon:Sunrise,label:'UV Index',val:'5 of 10'}].map(s=>(
            <div key={s.label} className="p-4 rounded-2xl bg-white/10 backdrop-blur border border-white/10">
              <s.icon className="w-4 h-4 text-white/60 mb-2" />
              <p className="text-xs text-white/60">{s.label}</p>
              <p className="text-lg font-semibold">{s.val}</p>
            </div>
          ))}
        </div>

        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur border border-white/10">
          <h3 className="font-semibold mb-4 text-sm">Hourly</h3>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={HOURLY.map(h=>({...h,temp:conv(h.temp)}))}><defs><linearGradient id="wt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/><stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="t" tick={{fill:'rgba(255,255,255,0.6)',fontSize:11}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:'#0f172a',border:'1px solid #334155',borderRadius:8}} /><Area type="monotone" dataKey="temp" stroke="#38bdf8" fill="url(#wt)" strokeWidth={2} /></AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur border border-white/10">
          <h3 className="font-semibold mb-4 text-sm">7-Day Forecast</h3>
          <div className="space-y-1">
            {WEEK.map(d=>(
              <div key={d.day} className="flex items-center gap-4 py-2 border-b border-white/5 last:border-0">
                <span className="w-12 text-sm text-white/80">{d.day}</span>
                <span className="text-2xl">{d.icon}</span>
                <div className="flex-1" />
                <span className="text-sm font-semibold w-10 text-right">{conv(d.hi)}°</span>
                <span className="text-sm text-white/50 w-10 text-right">{conv(d.lo)}°</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}`,
  }, [], { recharts: "^2.12.0" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. Music Player
// ─────────────────────────────────────────────────────────────────────────────
const musicPlayer: BuiltInTemplate = {
  id: "music-player",
  name: "Music Player",
  description: "Spotify-inspired player with library sidebar, track list, and a now-playing bar.",
  category: "dashboard",
  is_featured: false,
  fork_count: 2240,
  tags: ["music", "player", "audio"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Heart, Volume2, Search, Home, Library, ListMusic } from 'lucide-react'

interface Track { id:string; title:string; artist:string; album:string; duration:string; art:string }

const TRACKS: Track[] = [
  { id:'1', title:'Midnight City', artist:'Neon Waves', album:'Afterglow', duration:'3:42', art:'🌃' },
  { id:'2', title:'Golden Hour', artist:'Sunset Drive', album:'Coastline', duration:'4:08', art:'🌅' },
  { id:'3', title:'Echoes', artist:'Pale Blue', album:'Reverb', duration:'3:21', art:'🌊' },
  { id:'4', title:'Paper Planes', artist:'The Lanterns', album:'Skyward', duration:'2:58', art:'🪁' },
  { id:'5', title:'Velvet', artist:'Mara', album:'Soft Focus', duration:'3:55', art:'🌙' },
  { id:'6', title:'Citrus', artist:'Good Company', album:'Fresh', duration:'3:12', art:'🍊' },
]
const NAV = [ {icon:Home,label:'Home'},{icon:Search,label:'Search'},{icon:Library,label:'Your Library'} ]
const PLAYLISTS = ['Liked Songs','Chill Vibes','Focus Flow','Late Night','Roadtrip']

export default function App() {
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [liked, setLiked] = useState<Set<string>>(()=>new Set(['1']))
  const track = TRACKS[current]
  const toggleLike = (id:string) => setLiked(s=>{const n=new Set(s); if(n.has(id))n.delete(id); else n.add(id); return n})

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-60 bg-black p-2 hidden md:flex flex-col gap-2">
          <div className="bg-slate-900 rounded-lg p-4 space-y-4">
            {NAV.map((n,i)=><button key={n.label} className={clsx('flex items-center gap-4 text-sm font-semibold transition-colors', i===0?'text-white':'text-slate-400 hover:text-white')}><n.icon className="w-5 h-5" />{n.label}</button>)}
          </div>
          <div className="bg-slate-900 rounded-lg p-4 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-400 mb-3"><ListMusic className="w-4 h-4" /> Playlists</div>
            <div className="space-y-1">{PLAYLISTS.map(p=><button key={p} className="block w-full text-left text-sm text-slate-400 hover:text-white py-1 transition-colors truncate">{p}</button>)}</div>
          </div>
        </aside>

        <main className="flex-1 bg-gradient-to-b from-violet-900/40 to-black overflow-y-auto md:m-2 md:rounded-lg">
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-1">Good evening</h1>
            <p className="text-slate-300 mb-6 text-sm">Popular right now</p>
            <div className="space-y-1">
              {TRACKS.map((t,i)=>(
                <div key={t.id} onClick={()=>{setCurrent(i);setPlaying(true)}}
                  className={clsx('group flex items-center gap-4 px-3 py-2 rounded-md cursor-pointer transition-colors', i===current?'bg-white/20':'hover:bg-white/10')}>
                  <span className="w-5 text-center text-sm text-slate-400">{i===current && playing ? '♪' : i+1}</span>
                  <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-xl shrink-0">{t.art}</div>
                  <div className="flex-1 min-w-0"><p className={clsx('text-sm font-medium truncate', i===current && 'text-violet-300')}>{t.title}</p><p className="text-xs text-slate-400 truncate">{t.artist}</p></div>
                  <span className="text-xs text-slate-400 hidden sm:block truncate">{t.album}</span>
                  <button onClick={(e)=>{e.stopPropagation();toggleLike(t.id)}} className="opacity-0 group-hover:opacity-100 transition-opacity"><Heart className={clsx('w-4 h-4', liked.has(t.id)?'fill-violet-500 text-violet-500 opacity-100':'text-slate-400')} /></button>
                  <span className="text-xs text-slate-400 w-10 text-right">{t.duration}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      <div className="h-20 bg-slate-950 border-t border-slate-800 flex items-center px-4 gap-4">
        <div className="flex items-center gap-3 w-1/4 min-w-0">
          <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center text-2xl shrink-0">{track.art}</div>
          <div className="min-w-0 hidden sm:block"><p className="text-sm font-medium truncate">{track.title}</p><p className="text-xs text-slate-400 truncate">{track.artist}</p></div>
          <button onClick={()=>toggleLike(track.id)}><Heart className={clsx('w-4 h-4', liked.has(track.id)?'fill-violet-500 text-violet-500':'text-slate-400')} /></button>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-white transition-colors"><Shuffle className="w-4 h-4" /></button>
            <button onClick={()=>setCurrent(c=>(c-1+TRACKS.length)%TRACKS.length)} className="text-slate-300 hover:text-white transition-colors"><SkipBack className="w-5 h-5" /></button>
            <button onClick={()=>setPlaying(p=>!p)} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}</button>
            <button onClick={()=>setCurrent(c=>(c+1)%TRACKS.length)} className="text-slate-300 hover:text-white transition-colors"><SkipForward className="w-5 h-5" /></button>
            <button className="text-slate-400 hover:text-white transition-colors"><Repeat className="w-4 h-4" /></button>
          </div>
          <div className="w-full max-w-md flex items-center gap-2">
            <span className="text-[10px] text-slate-400">1:24</span>
            <div className="flex-1 h-1 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-violet-500" style={{width:'38%'}} /></div>
            <span className="text-[10px] text-slate-400">{track.duration}</span>
          </div>
        </div>
        <div className="w-1/4 justify-end items-center gap-2 hidden md:flex">
          <Volume2 className="w-4 h-4 text-slate-400" />
          <div className="w-24 h-1 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-slate-400" style={{width:'70%'}} /></div>
        </div>
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. Minimal Product Page
// ─────────────────────────────────────────────────────────────────────────────
const landingMinimal: BuiltInTemplate = {
  id: "landing-minimal",
  name: "Minimal Product Page",
  description: "Apple-style product page with full-screen scroll-reveal sections and a sticky nav.",
  category: "landing",
  is_featured: false,
  fork_count: 3100,
  tags: ["minimal", "product", "showcase"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'

const SCREENS = [
  { kicker:'Introducing Halo', title:'Simplicity, refined.', sub:'The tool that gets out of your way so you can do your best work.', emoji:'◯' },
  { kicker:'Designed to focus', title:'Nothing extra.', sub:'Every pixel earns its place. No clutter, no noise — just what matters.', emoji:'◐' },
  { kicker:'Built to last', title:'Quietly powerful.', sub:'Instant everywhere. Thoughtful defaults. Power when you want it.', emoji:'●' },
]

export default function App() {
  return (
    <div className="bg-white text-slate-900">
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-tight">Halo</span>
          <button className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-full hover:bg-slate-700 transition-colors">Get Halo</button>
        </div>
      </nav>

      {SCREENS.map((s, i) => (
        <section key={i} className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <motion.div initial={{opacity:0,y:40}} whileInView={{opacity:1,y:0}} viewport={{once:true,margin:'-100px'}} transition={{duration:0.7,ease:[0.22,1,0.36,1]}}>
            <div className="text-7xl mb-8 text-slate-300">{s.emoji}</div>
            <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-4">{s.kicker}</p>
            <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-3xl">{s.title}</h2>
            <p className="text-xl text-slate-500 max-w-xl mx-auto">{s.sub}</p>
          </motion.div>
        </section>
      ))}

      <section className="bg-slate-50 py-24 px-6">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-12 text-center">
          {[{n:'0ms',l:'Perceived latency'},{n:'100%',l:'Keyboard driven'},{n:'∞',l:'Undo history'}].map(x=>(
            <motion.div key={x.l} initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:0.5}}>
              <div className="text-5xl font-bold tracking-tight mb-2">{x.n}</div>
              <div className="text-sm text-slate-500">{x.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="py-32 px-6 text-center">
        <motion.div initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:0.6}}>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Do less. Better.</h2>
          <p className="text-lg text-slate-500 mb-10 max-w-md mx-auto">Try Halo free for 14 days. No card required.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="inline-flex items-center gap-2 bg-slate-900 text-white px-7 py-3 rounded-full font-medium hover:bg-slate-700 transition-colors">Get started <ArrowRight className="w-4 h-4" /></button>
            <button className="text-slate-600 font-medium hover:text-slate-900 transition-colors">Watch the film</button>
          </div>
          <div className="flex items-center justify-center gap-6 mt-10 text-sm text-slate-400 flex-wrap">
            {['No setup','Cancel anytime','Free updates'].map(f=><span key={f} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-slate-400" />{f}</span>)}
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">Built with LifemarkAI</footer>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 14. Social Feed
// ─────────────────────────────────────────────────────────────────────────────
const socialFeed: BuiltInTemplate = {
  id: "social-feed",
  name: "Social Feed",
  description: "Twitter-style feed with composer, likes, replies, reposts, and a trends rail.",
  category: "chat",
  is_featured: false,
  fork_count: 1560,
  tags: ["social", "feed", "twitter"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Home, Search, Bell, Mail, User, Sparkles, Heart, MessageCircle, Repeat2, Share, MoreHorizontal, Image as ImageIcon } from 'lucide-react'

interface Post { id:string; name:string; handle:string; avatar:string; time:string; text:string; likes:number; replies:number; reposts:number }

const NAV = [ {icon:Home,label:'Home'},{icon:Search,label:'Explore'},{icon:Bell,label:'Notifications'},{icon:Mail,label:'Messages'},{icon:User,label:'Profile'} ]
const TRENDS = [ {topic:'Technology',tag:'#WebGPU',posts:'42.1K'},{topic:'Design',tag:'#DesignSystems',posts:'18.6K'},{topic:'Programming',tag:'#TypeScript',posts:'31.9K'},{topic:'AI',tag:'#LocalLLMs',posts:'27.3K'} ]
const INITIAL: Post[] = [
  { id:'1', name:'Dev Patel', handle:'devp', avatar:'🦊', time:'2m', text:'shipped a thing today. it works on my machine, which is the only machine that matters.', likes:248, replies:18, reposts:32 },
  { id:'2', name:'Mara Lin', handle:'maralin', avatar:'🐙', time:'14m', text:'hot take: the best design system is the one your team actually uses. ship the boring one.', likes:1240, replies:96, reposts:210 },
  { id:'3', name:'Sol', handle:'sol_builds', avatar:'🌞', time:'1h', text:'spent 3 hours debugging. it was a typo. it is always a typo.', likes:890, replies:44, reposts:71 },
]

export default function App() {
  const [posts, setPosts] = useState<Post[]>(INITIAL)
  const [liked, setLiked] = useState<Set<string>>(()=>new Set())
  const [draft, setDraft] = useState('')

  const toggleLike = (id:string) => setLiked(s=>{const n=new Set(s); if(n.has(id))n.delete(id); else n.add(id); return n})
  const submit = () => {
    if (!draft.trim()) return
    setPosts(p => [{ id:Date.now().toString(), name:'You', handle:'you', avatar:'⭐', time:'now', text:draft.trim(), likes:0, replies:0, reposts:0 }, ...p])
    setDraft('')
  }

  return (
    <div className="min-h-screen bg-black text-slate-100 flex justify-center">
      <div className="w-full max-w-6xl flex">
        <aside className="w-20 xl:w-64 px-2 xl:px-4 py-4 border-r border-slate-800 shrink-0 sticky top-0 h-screen">
          <div className="text-2xl px-3 mb-6">✦</div>
          <nav className="space-y-1">
            {NAV.map((n,i)=>(
              <button key={n.label} className={clsx('flex items-center gap-4 px-3 py-2.5 rounded-full text-lg transition-colors w-full', i===0?'font-bold':'text-slate-300 hover:bg-slate-900')}>
                <n.icon className="w-6 h-6 shrink-0" /><span className="hidden xl:inline">{n.label}</span>
              </button>
            ))}
          </nav>
          <button className="mt-4 w-full bg-violet-600 hover:bg-violet-500 rounded-full py-3 font-bold transition-colors flex items-center justify-center gap-2"><Sparkles className="w-5 h-5" /><span className="hidden xl:inline">Post</span></button>
        </aside>

        <main className="flex-1 border-r border-slate-800 min-w-0">
          <div className="px-4 py-3 border-b border-slate-800 sticky top-0 bg-black/80 backdrop-blur z-10 font-bold">Home</div>

          <div className="flex gap-3 p-4 border-b border-slate-800">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xl shrink-0">⭐</div>
            <div className="flex-1">
              <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2} className="w-full bg-transparent text-lg outline-none resize-none placeholder:text-slate-500" placeholder="What is happening?!" />
              <div className="flex items-center justify-between mt-2">
                <ImageIcon className="w-5 h-5 text-violet-400" />
                <button onClick={submit} disabled={!draft.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-full px-4 py-1.5 text-sm font-bold transition-colors">Post</button>
              </div>
            </div>
          </div>

          {posts.map(p=>(
            <article key={p.id} className="flex gap-3 p-4 border-b border-slate-800 hover:bg-slate-950 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xl shrink-0">{p.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-bold truncate">{p.name}</span>
                  <span className="text-slate-500 truncate">@{p.handle}</span>
                  <span className="text-slate-500">· {p.time}</span>
                  <MoreHorizontal className="w-4 h-4 text-slate-500 ml-auto" />
                </div>
                <p className="text-[15px] mt-0.5 mb-3">{p.text}</p>
                <div className="flex items-center justify-between max-w-md text-slate-500">
                  <button className="flex items-center gap-1.5 text-sm hover:text-sky-400 transition-colors"><MessageCircle className="w-4 h-4" />{p.replies}</button>
                  <button className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition-colors"><Repeat2 className="w-4 h-4" />{p.reposts}</button>
                  <button onClick={(e)=>{e.stopPropagation();toggleLike(p.id)}} className={clsx('flex items-center gap-1.5 text-sm transition-colors', liked.has(p.id)?'text-pink-500':'hover:text-pink-500')}>
                    <Heart className={clsx('w-4 h-4', liked.has(p.id) && 'fill-pink-500')} />{p.likes + (liked.has(p.id)?1:0)}
                  </button>
                  <button className="hover:text-sky-400 transition-colors"><Share className="w-4 h-4" /></button>
                </div>
              </div>
            </article>
          ))}
        </main>

        <aside className="w-80 px-4 py-4 hidden lg:block shrink-0 sticky top-0 h-screen">
          <div className="bg-slate-900 rounded-2xl p-4">
            <h2 className="font-bold text-lg mb-3">Trends for you</h2>
            <div className="space-y-3">
              {TRENDS.map(t=>(
                <div key={t.tag} className="cursor-pointer hover:bg-slate-800 -mx-2 px-2 py-1 rounded-lg transition-colors">
                  <p className="text-xs text-slate-500">{t.topic} · Trending</p>
                  <p className="font-bold text-sm">{t.tag}</p>
                  <p className="text-xs text-slate-500">{t.posts} posts</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 15. Real-Time Chat
// ─────────────────────────────────────────────────────────────────────────────
const chatApp: BuiltInTemplate = {
  id: "chat-app",
  name: "Real-Time Chat",
  description: "Slack-style chat with channels, DMs, unread badges, presence, and a composer.",
  category: "chat",
  is_featured: false,
  fork_count: 980,
  tags: ["chat", "messaging", "realtime"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Hash, Lock, Search, Send, Smile, Paperclip, Bell, Phone } from 'lucide-react'

interface Msg { id:string; user:string; avatar:string; time:string; text:string }
interface Channel { id:string; name:string; private?:boolean; unread?:number }

const CHANNELS: Channel[] = [
  { id:'general', name:'general' },
  { id:'design', name:'design', unread:3 },
  { id:'eng', name:'engineering' },
  { id:'random', name:'random', unread:1 },
  { id:'launch', name:'launch-plan', private:true },
]
const DMS = [ {name:'Mara Lin',avatar:'🐙',online:true},{name:'Dev Patel',avatar:'🦊',online:true},{name:'Sol',avatar:'🌞',online:false} ]
const INITIAL: Record<string,Msg[]> = {
  design: [
    { id:'1', user:'Mara Lin', avatar:'🐙', time:'9:24 AM', text:'pushed the new color tokens to the figma lib' },
    { id:'2', user:'Dev Patel', avatar:'🦊', time:'9:26 AM', text:'nice. does it cover the dark theme too?' },
    { id:'3', user:'Mara Lin', avatar:'🐙', time:'9:27 AM', text:'yep, both themes. semantic names so we can re-theme later without touching components.' },
    { id:'4', user:'You', avatar:'⭐', time:'9:31 AM', text:'love it. wiring it into the dashboard now.' },
  ],
}

export default function App() {
  const [active, setActive] = useState('design')
  const [messages, setMessages] = useState<Record<string,Msg[]>>(INITIAL)
  const [draft, setDraft] = useState('')
  const list = messages[active] ?? []

  const send = () => {
    if (!draft.trim()) return
    const m: Msg = { id:Date.now().toString(), user:'You', avatar:'⭐', time:'now', text:draft.trim() }
    setMessages(s => ({ ...s, [active]: [...(s[active] ?? []), m] }))
    setDraft('')
  }

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex">
      <aside className="w-60 bg-slate-950 flex flex-col shrink-0">
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 font-bold">
          Acme HQ <Bell className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-xs uppercase text-slate-500 px-2 py-1 tracking-wider">Channels</p>
          {CHANNELS.map(c=>(
            <button key={c.id} onClick={()=>setActive(c.id)} className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors', active===c.id?'bg-violet-600 text-white':'text-slate-400 hover:bg-slate-800')}>
              {c.private ? <Lock className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
              <span className="flex-1 text-left truncate">{c.name}</span>
              {c.unread && <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{c.unread}</span>}
            </button>
          ))}
          <p className="text-xs uppercase text-slate-500 px-2 py-1 mt-3 tracking-wider">Direct Messages</p>
          {DMS.map(d=>(
            <button key={d.name} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-slate-400 hover:bg-slate-800 transition-colors">
              <span className="relative"><span className="text-base">{d.avatar}</span><span className={clsx('absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950', d.online?'bg-emerald-400':'bg-slate-600')} /></span>
              <span className="flex-1 text-left truncate">{d.name}</span>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-slate-800 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center text-sm font-bold">⭐</div>
          <div className="text-sm"><div className="font-medium">You</div><div className="text-xs text-emerald-400">Active</div></div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 flex items-center px-4 gap-2 shrink-0">
          <Hash className="w-4 h-4 text-slate-400" /><span className="font-bold">{CHANNELS.find(c=>c.id===active)?.name ?? active}</span>
          <span className="text-slate-500 text-sm ml-2 hidden sm:block">design reviews and critique</span>
          <div className="ml-auto flex items-center gap-3 text-slate-400"><Phone className="w-4 h-4" /><Search className="w-4 h-4" /></div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {list.map(m=>(
            <div key={m.id} className="flex gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-lg shrink-0">{m.avatar}</div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2"><span className="font-semibold text-sm">{m.user}</span><span className="text-xs text-slate-500">{m.time}</span></div>
                <p className="text-sm text-slate-200 mt-0.5">{m.text}</p>
              </div>
            </div>
          ))}
          {list.length===0 && <div className="text-center text-slate-500 py-16 text-sm">No messages yet. Say hi 👋</div>}
        </div>

        <div className="p-4 shrink-0">
          <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2 border border-slate-700 focus-within:border-violet-500 transition-colors">
            <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
            <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" placeholder="Message the channel" />
            <Smile className="w-4 h-4 text-slate-400 shrink-0" />
            <button onClick={send} className="text-violet-400 hover:text-violet-300 transition-colors shrink-0"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 16. Startup Landing
// ─────────────────────────────────────────────────────────────────────────────
const startupLanding: BuiltInTemplate = {
  id: "startup-landing",
  name: "Startup Landing",
  description: "Product Hunt-style launch page with a working waitlist, press logos, and FAQ.",
  category: "landing",
  is_featured: false,
  fork_count: 1450,
  tags: ["landing", "waitlist", "launch"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, Star, Zap } from 'lucide-react'

const FEATURES = [
  { emoji:'⚡', title:'Instant setup', desc:'Connect your stack in under a minute. No config files, no yak-shaving.' },
  { emoji:'🤖', title:'AI built in', desc:'Smart suggestions and automations that learn how your team works.' },
  { emoji:'🔒', title:'Private by default', desc:'Your data stays yours. Encrypted, isolated, and never used for training.' },
]
const LOGOS = ['TechCrunch','The Verge','Wired','Fast Company','Product Hunt']
const FAQS = [
  { q:'Is there a free plan?', a:'Yes. The free plan includes core features for solo builders, forever.' },
  { q:'When does it launch?', a:'We are rolling out to the waitlist in batches over the coming weeks.' },
  { q:'Can I cancel anytime?', a:'Absolutely. No contracts, no lock-in. Cancel from settings in one click.' },
]

export default function App() {
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState(false)
  const [count, setCount] = useState(2847)
  const [open, setOpen] = useState<number|null>(0)

  const join = () => { if (!email.trim()) return; setJoined(true); setCount(c=>c+1) }

  return (
    <div className="min-h-screen bg-[#0b0b12] text-white">
      <nav className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold"><Zap className="w-5 h-5 text-violet-400" /> Beacon</div>
        <button className="text-sm bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full transition-colors">Sign in</button>
      </nav>

      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm mb-6"><Star className="w-3.5 h-3.5" /> #1 Product of the Day</div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6">The launchpad for<br />your next big thing.</h1>
          <p className="text-xl text-slate-400 mb-8 max-w-xl mx-auto">Beacon helps founders go from idea to launch without the busywork. Join the waitlist.</p>

          {joined ? (
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"><Check className="w-5 h-5" /> You are on the list! We will be in touch soon.</div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@startup.com" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500 transition-colors" />
              <button onClick={join} className="bg-violet-600 hover:bg-violet-500 rounded-xl px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-colors">Join waitlist <ArrowRight className="w-4 h-4" /></button>
            </div>
          )}
          <p className="text-sm text-slate-500 mt-4"><span className="text-white font-semibold">{count.toLocaleString()}</span> founders already waiting</p>
        </motion.div>

        <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} transition={{duration:0.7,delay:0.2}} className="mt-14 rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-2">
          <div className="rounded-xl bg-[#11111c] h-64 flex items-center justify-center text-slate-600">
            <div className="text-center"><div className="text-5xl mb-2">🛰️</div><p className="text-sm">Product preview</p></div>
          </div>
        </motion.div>
      </section>

      <section className="py-10">
        <p className="text-center text-xs uppercase tracking-widest text-slate-600 mb-6">As seen in</p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-slate-500 font-semibold">
          {LOGOS.map(l=><span key={l}>{l}</span>)}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-6">
        {FEATURES.map((f,i)=>(
          <motion.div key={f.title} initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.1}} className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-3xl mb-3">{f.emoji}</div><h3 className="font-semibold mb-2">{f.title}</h3><p className="text-sm text-slate-400">{f.desc}</p>
          </motion.div>
        ))}
      </section>

      <section className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-2xl font-medium leading-relaxed mb-6">“We built Beacon because we were tired of duct-taping ten tools together just to ship. This is the tool we wished we had.”</p>
        <div className="flex items-center justify-center gap-3"><div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center">A</div><div className="text-left"><div className="font-semibold text-sm">Avery Stone</div><div className="text-xs text-slate-500">Founder and CEO</div></div></div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-8">Questions</h2>
        <div className="space-y-2">
          {FAQS.map((f,i)=>(
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button onClick={()=>setOpen(open===i?null:i)} className="w-full flex items-center justify-between px-5 py-4 text-left font-medium text-sm">
                {f.q} <ChevronDown className={'w-4 h-4 text-slate-400 transition-transform '+(open===i?'rotate-180':'')} />
              </button>
              {open===i && <p className="px-5 pb-4 text-sm text-slate-400">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-500">Built with LifemarkAI</footer>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 17. Video Platform
// ─────────────────────────────────────────────────────────────────────────────
const videoPlatform: BuiltInTemplate = {
  id: "video-platform",
  name: "Video Platform",
  description: "YouTube-style player page with a video grid, channel info, and recommendations.",
  category: "dashboard",
  is_featured: false,
  fork_count: 1320,
  tags: ["video", "media", "streaming"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Search, Home, Flame, Clock, ThumbsUp, ThumbsDown, Share2, Menu, Bell, Video } from 'lucide-react'

interface Vid { id:string; title:string; channel:string; views:string; age:string; len:string; grad:string }

const VIDEOS: Vid[] = [
  { id:'1', title:'Building a design system from scratch in 2026', channel:'Design Lab', views:'248K', age:'2 days ago', len:'18:42', grad:'from-violet-500 to-indigo-600' },
  { id:'2', title:'I rebuilt my startup in Rust (here is what happened)', channel:'Sol Builds', views:'1.2M', age:'1 week ago', len:'24:10', grad:'from-orange-500 to-red-600' },
  { id:'3', title:'The calm productivity setup', channel:'Quiet Work', views:'89K', age:'3 days ago', len:'11:05', grad:'from-emerald-500 to-teal-600' },
  { id:'4', title:'Type-safe APIs end to end', channel:'Mara Codes', views:'412K', age:'5 days ago', len:'31:27', grad:'from-sky-500 to-blue-600' },
  { id:'5', title:'A weekend with the new framework', channel:'Dev Patel', views:'156K', age:'1 day ago', len:'14:33', grad:'from-pink-500 to-rose-600' },
  { id:'6', title:'Why we left the cloud', channel:'Backbone', views:'672K', age:'2 weeks ago', len:'09:58', grad:'from-amber-500 to-yellow-600' },
]
const NAV = [ {icon:Home,label:'Home'},{icon:Flame,label:'Trending'},{icon:Clock,label:'Watch later'} ]

export default function App() {
  const [active, setActive] = useState<Vid>(VIDEOS[0])
  const related = VIDEOS.filter(v=>v.id!==active.id)

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <header className="h-14 flex items-center gap-4 px-4 sticky top-0 bg-[#0f0f0f] z-20 border-b border-white/5">
        <Menu className="w-5 h-5 text-slate-300" />
        <div className="flex items-center gap-1 font-bold"><Video className="w-5 h-5 text-red-500" /> Streamly</div>
        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 max-w-xl mx-auto">
          <Search className="w-4 h-4 text-slate-400" /><input className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" placeholder="Search" />
        </div>
        <Bell className="w-5 h-5 text-slate-300" />
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">⭐</div>
      </header>

      <div className="flex">
        <aside className="w-56 shrink-0 p-3 hidden lg:block sticky top-14 h-[calc(100vh-3.5rem)]">
          {NAV.map((n,i)=>(
            <button key={n.label} className={clsx('w-full flex items-center gap-4 px-3 py-2 rounded-lg text-sm transition-colors', i===0?'bg-white/10 font-medium':'text-slate-300 hover:bg-white/5')}>
              <n.icon className="w-5 h-5" />{n.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 p-4 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className={clsx('aspect-video rounded-xl bg-gradient-to-br flex items-center justify-center', active.grad)}>
              <div className="w-16 h-16 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-2xl">▶</div>
            </div>
            <h1 className="text-lg font-bold">{active.title}</h1>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold">{active.channel[0]}</div>
                <div><div className="font-medium text-sm">{active.channel}</div><div className="text-xs text-slate-400">182K subscribers</div></div>
                <button className="ml-2 bg-white text-black text-sm font-medium px-4 py-1.5 rounded-full hover:bg-slate-200 transition-colors">Subscribe</button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white/5 rounded-full overflow-hidden">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"><ThumbsUp className="w-4 h-4" /> 24K</button>
                  <span className="w-px h-5 bg-white/10" />
                  <button className="px-3 py-1.5 hover:bg-white/10 transition-colors"><ThumbsDown className="w-4 h-4" /></button>
                </div>
                <button className="flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"><Share2 className="w-4 h-4" /> Share</button>
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-sm">
              <p className="font-medium mb-1">{active.views} views · {active.age}</p>
              <p className="text-slate-300">In this video we go deep on the ideas behind the build. Chapters, links, and resources in the description.</p>
            </div>
          </div>

          <div className="space-y-3">
            {related.map(v=>(
              <button key={v.id} onClick={()=>setActive(v)} className="w-full flex gap-2 text-left group">
                <div className={clsx('w-40 aspect-video rounded-lg bg-gradient-to-br shrink-0 relative', v.grad)}>
                  <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 px-1 rounded">{v.len}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium line-clamp-2 group-hover:text-violet-300 transition-colors">{v.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{v.channel}</p>
                  <p className="text-xs text-slate-500">{v.views} views · {v.age}</p>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 18. Calendar App
// ─────────────────────────────────────────────────────────────────────────────
const calendarApp: BuiltInTemplate = {
  id: "calendar-app",
  name: "Calendar App",
  description: "Monthly calendar with month navigation, event dots, and an event-creation panel.",
  category: "saas",
  is_featured: false,
  fork_count: 1120,
  tags: ["calendar", "events", "scheduling"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Plus, X, Clock } from 'lucide-react'

interface Ev { id:string; day:number; title:string; time:string; color:string }

const COLORS = ['bg-violet-500','bg-sky-500','bg-emerald-500','bg-amber-500','bg-pink-500']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const INITIAL: Ev[] = [
  { id:'1', day:4, title:'Team standup', time:'9:00 AM', color:'bg-violet-500' },
  { id:'2', day:4, title:'Design review', time:'2:00 PM', color:'bg-sky-500' },
  { id:'3', day:11, title:'1:1 with Mara', time:'11:00 AM', color:'bg-emerald-500' },
  { id:'4', day:18, title:'Launch day', time:'All day', color:'bg-pink-500' },
  { id:'5', day:22, title:'Quarterly planning', time:'10:00 AM', color:'bg-amber-500' },
]

export default function App() {
  const [month, setMonth] = useState(5)
  const [year] = useState(2026)
  const [events, setEvents] = useState<Ev[]>(INITIAL)
  const [selected, setSelected] = useState<number|null>(null)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells: (number|null)[] = Array.from({length:firstDay},()=>null).concat(Array.from({length:daysInMonth},(_,i)=>i+1) as any)
  const today = 4

  const dayEvents = (d:number) => events.filter(e=>e.day===d)
  const addEvent = () => {
    if (!title.trim() || selected===null) return
    setEvents(ev => [...ev, { id:Date.now().toString(), day:selected, title:title.trim(), time:time||'All day', color:COLORS[ev.length%COLORS.length] }])
    setTitle(''); setTime('')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{MONTHS[month]} {year}</h1>
            <div className="flex gap-1">
              <button onClick={()=>setMonth(m=>(m+11)%12)} className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={()=>setMonth(m=>(m+1)%12)} className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <button onClick={()=>setSelected(today)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> New event</button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800">
          {DAYS.map(d=><div key={d} className="bg-slate-900 py-2 text-center text-xs font-semibold text-slate-400">{d}</div>)}
          {cells.map((d,i)=>(
            <div key={i} onClick={()=>d && setSelected(d)} className={clsx('bg-slate-950 min-h-[92px] p-1.5 transition-colors', d && 'cursor-pointer hover:bg-slate-900')}>
              {d && (
                <>
                  <div className={clsx('text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1', d===today?'bg-violet-600 text-white font-bold':'text-slate-400')}>{d}</div>
                  <div className="space-y-0.5">
                    {dayEvents(d).slice(0,3).map(e=>(
                      <div key={e.id} className="flex items-center gap-1 text-[10px] truncate"><span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', e.color)} /><span className="truncate text-slate-300">{e.title}</span></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {selected!==null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setSelected(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">{MONTHS[month]} {selected}</h2><button onClick={()=>setSelected(null)}><X className="w-4 h-4 text-slate-400" /></button></div>
            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
              {dayEvents(selected).length===0 ? <p className="text-sm text-slate-500">No events yet.</p> :
                dayEvents(selected).map(e=>(
                  <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800"><span className={clsx('w-2 h-2 rounded-full', e.color)} /><span className="text-sm flex-1">{e.title}</span><span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{e.time}</span></div>
                ))}
            </div>
            <div className="space-y-2">
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Event title" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition-colors" />
              <input value={time} onChange={e=>setTime(e.target.value)} placeholder="Time (e.g. 3:00 PM)" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition-colors" />
              <button onClick={addEvent} className="w-full bg-violet-600 hover:bg-violet-500 rounded-lg py-2 text-sm font-medium transition-colors">Add event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 19. Recipe App
// ─────────────────────────────────────────────────────────────────────────────
const recipeApp: BuiltInTemplate = {
  id: "recipe-app",
  name: "Recipe App",
  description: "Recipe discovery with cuisine filters, save-to-favorites, and a full detail view.",
  category: "landing",
  is_featured: false,
  fork_count: 1230,
  tags: ["recipes", "food", "cooking"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Search, Clock, Flame, Heart, ChevronLeft, Users } from 'lucide-react'

interface Recipe { id:string; name:string; emoji:string; cuisine:string; time:number; difficulty:string; servings:number; kcal:number; ingredients:string[]; steps:string[] }

const RECIPES: Recipe[] = [
  { id:'1', name:'Creamy Tomato Pasta', emoji:'🍝', cuisine:'Italian', time:25, difficulty:'Easy', servings:2, kcal:540, ingredients:['200g pasta','1 can crushed tomatoes','100ml cream','2 cloves garlic','Fresh basil','Parmesan'], steps:['Boil pasta until al dente.','Saute garlic, add tomatoes, simmer 10 min.','Stir in cream and season.','Toss pasta, top with basil and parmesan.'] },
  { id:'2', name:'Rainbow Buddha Bowl', emoji:'🥗', cuisine:'Vegan', time:20, difficulty:'Easy', servings:1, kcal:420, ingredients:['Quinoa','Chickpeas','Avocado','Red cabbage','Carrot','Tahini dressing'], steps:['Cook quinoa and let cool.','Roast chickpeas with spices.','Arrange veg over quinoa.','Drizzle tahini dressing.'] },
  { id:'3', name:'Spicy Miso Ramen', emoji:'🍜', cuisine:'Japanese', time:40, difficulty:'Medium', servings:2, kcal:610, ingredients:['Ramen noodles','Miso paste','Soft-boiled egg','Green onion','Chili oil','Stock'], steps:['Simmer stock with miso.','Cook noodles separately.','Assemble bowl with toppings.','Finish with chili oil.'] },
  { id:'4', name:'Berry Breakfast Bowl', emoji:'🍓', cuisine:'Breakfast', time:10, difficulty:'Easy', servings:1, kcal:310, ingredients:['Greek yogurt','Mixed berries','Granola','Honey','Chia seeds'], steps:['Spoon yogurt into a bowl.','Top with berries and granola.','Drizzle honey, sprinkle chia.'] },
  { id:'5', name:'Smash Burger', emoji:'🍔', cuisine:'American', time:30, difficulty:'Medium', servings:2, kcal:720, ingredients:['Ground beef','Burger buns','Cheddar','Onion','Pickles','Special sauce'], steps:['Smash beef on a hot griddle.','Add cheese to melt.','Toast buns, build burger.','Add sauce and pickles.'] },
  { id:'6', name:'Green Curry', emoji:'🍛', cuisine:'Thai', time:35, difficulty:'Medium', servings:3, kcal:480, ingredients:['Green curry paste','Coconut milk','Chicken or tofu','Bamboo shoots','Thai basil','Jasmine rice'], steps:['Fry curry paste.','Add coconut milk and protein.','Simmer with veg.','Serve over rice.'] },
]
const CUISINES = ['All','Italian','Vegan','Japanese','American','Thai','Breakfast']

export default function App() {
  const [cuisine, setCuisine] = useState('All')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<Recipe|null>(null)
  const [saved, setSaved] = useState<Set<string>>(()=>new Set())
  const toggleSave = (id:string) => setSaved(s=>{const n=new Set(s); if(n.has(id))n.delete(id); else n.add(id); return n})
  const filtered = RECIPES.filter(r=>(cuisine==='All'||r.cuisine===cuisine)&&r.name.toLowerCase().includes(search.toLowerCase()))

  if (active) return (
    <div className="min-h-screen bg-orange-50 text-slate-900">
      <div className="max-w-2xl mx-auto p-6">
        <button onClick={()=>setActive(null)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="text-center mb-6"><div className="text-7xl mb-3">{active.emoji}</div><h1 className="text-3xl font-bold">{active.name}</h1><p className="text-slate-500">{active.cuisine}</p></div>
        <div className="flex justify-center gap-6 mb-8 text-sm">
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-orange-500" />{active.time} min</span>
          <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-orange-500" />{active.servings} servings</span>
          <span className="flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" />{active.kcal} kcal</span>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div><h2 className="font-bold mb-3">Ingredients</h2><ul className="space-y-2">{active.ingredients.map(ing=><li key={ing} className="flex items-center gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />{ing}</li>)}</ul></div>
          <div><h2 className="font-bold mb-3">Steps</h2><ol className="space-y-3">{active.steps.map((s,i)=><li key={i} className="flex gap-3 text-sm"><span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>{s}</li>)}</ol></div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-orange-50 text-slate-900">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-xl font-bold">🍳 Cookbook</h1>
            <div className="flex-1 flex items-center gap-2 bg-orange-50 rounded-full px-4 py-2 max-w-md mx-auto"><Search className="w-4 h-4 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder="Search recipes..." /></div>
          </div>
          <div className="flex gap-2 flex-wrap">{CUISINES.map(c=><button key={c} onClick={()=>setCuisine(c)} className={clsx('px-3 py-1 rounded-full text-sm font-medium transition-colors', cuisine===c?'bg-orange-500 text-white':'bg-orange-50 text-slate-600 hover:bg-orange-100')}>{c}</button>)}</div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-3 gap-5">
        {filtered.map(r=>(
          <div key={r.id} className="bg-white rounded-2xl overflow-hidden border border-orange-100 hover:shadow-lg transition-shadow cursor-pointer" onClick={()=>setActive(r)}>
            <div className="h-32 bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center text-5xl relative">{r.emoji}
              <button onClick={(e)=>{e.stopPropagation();toggleSave(r.id)}} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"><Heart className={clsx('w-4 h-4', saved.has(r.id)?'fill-red-500 text-red-500':'text-slate-400')} /></button>
            </div>
            <div className="p-3">
              <p className="text-xs text-orange-500 font-medium mb-0.5">{r.cuisine}</p>
              <h3 className="font-semibold text-sm mb-2 line-clamp-1">{r.name}</h3>
              <div className="flex items-center gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.time}m</span><span>{r.difficulty}</span></div>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 20. Blog Platform
// ─────────────────────────────────────────────────────────────────────────────
const blogPlatform: BuiltInTemplate = {
  id: "blog-platform",
  name: "Blog Platform",
  description: "Editorial blog with a posts list, beautiful reading view, and newsletter CTA.",
  category: "blog",
  is_featured: false,
  fork_count: 890,
  tags: ["blog", "writing", "publishing"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { ChevronLeft, Calendar, Clock, ArrowRight } from 'lucide-react'

interface Post { id:string; title:string; excerpt:string; author:string; avatar:string; date:string; read:string; tag:string; body:string[] }

const POSTS: Post[] = [
  { id:'1', title:'Designing for calm', excerpt:'Why the best software gets out of your way, and how to build interfaces that respect attention.', author:'Mara Lin', avatar:'🐙', date:'Jun 1, 2026', read:'6 min', tag:'Design', body:['Good software is quiet. It does the work and then disappears, leaving you with the result and none of the noise.','We obsess over adding features, but the real craft is in deciding what to leave out. Every element on screen is a small tax on attention.','Calm design is not minimalism for its own sake. It is a set of decisions that consistently favor the user goal over the product goal.'] },
  { id:'2', title:'Shipping is a skill', excerpt:'Momentum beats perfection. A short field guide to finishing the things you start.', author:'Dev Patel', avatar:'🦊', date:'May 24, 2026', read:'4 min', tag:'Process', body:['The hardest part of any project is the last ten percent, where the interesting problems are solved and only the tedious ones remain.','Shipping is a muscle. The more often you take something all the way to done, the easier it gets to do it again.','Set a date, cut the scope to fit, and ship. You can always iterate, but only on something that exists.'] },
  { id:'3', title:'The case for boring tech', excerpt:'Choose tools your team understands. Novelty is a cost you pay every day.', author:'Sol', avatar:'🌞', date:'May 12, 2026', read:'5 min', tag:'Engineering', body:['Every new tool you adopt is a new thing to learn, debug, and maintain. Boring technology is boring because it is well understood.','Spend your innovation budget where it actually differentiates you, and use proven, stable tools for everything else.','Your future self, debugging at 2am, will thank you for choosing the option with the most search results.'] },
]

export default function App() {
  const [active, setActive] = useState<Post|null>(null)

  if (active) return (
    <article className="min-h-screen bg-white text-slate-900">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={()=>setActive(null)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-8 transition-colors"><ChevronLeft className="w-4 h-4" /> All posts</button>
        <span className="text-sm font-medium text-violet-600">{active.tag}</span>
        <h1 className="text-4xl font-bold tracking-tight mt-2 mb-4">{active.title}</h1>
        <div className="flex items-center gap-3 text-sm text-slate-500 mb-10 pb-8 border-b">
          <span className="text-xl">{active.avatar}</span><span className="font-medium text-slate-700">{active.author}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{active.date}</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{active.read}</span>
        </div>
        <div className="space-y-6 text-lg leading-relaxed text-slate-700">{active.body.map((p,i)=><p key={i}>{p}</p>)}</div>
      </div>
    </article>
  )

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-3">The Quiet Letter</h1>
          <p className="text-slate-500">Essays on craft, calm, and shipping good software.</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-12 divide-y">
        {POSTS.map(p=>(
          <article key={p.id} className="py-8 group cursor-pointer" onClick={()=>setActive(p)}>
            <span className="text-xs font-medium text-violet-600">{p.tag}</span>
            <h2 className="text-2xl font-bold mt-1 mb-2 group-hover:text-violet-700 transition-colors">{p.title}</h2>
            <p className="text-slate-600 mb-4">{p.excerpt}</p>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="text-lg">{p.avatar}</span><span>{p.author}</span><span>·</span><span>{p.date}</span><span>·</span><span>{p.read}</span>
              <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </article>
        ))}
        <div className="py-12 text-center">
          <h3 className="font-bold text-lg mb-2">Get new essays by email</h3>
          <div className="flex gap-2 max-w-sm mx-auto mt-4">
            <input placeholder="you@email.com" className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition-colors" />
            <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">Subscribe</button>
          </div>
        </div>
      </main>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 21. Job Board
// ─────────────────────────────────────────────────────────────────────────────
const jobBoard: BuiltInTemplate = {
  id: "job-board",
  name: "Job Board",
  description: "Tech job board with search, filters, job cards, and a slide-in detail panel.",
  category: "landing",
  is_featured: false,
  fork_count: 890,
  tags: ["jobs", "hiring", "careers"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Search, MapPin, Briefcase, DollarSign, ChevronLeft, Building2 } from 'lucide-react'

interface Job { id:string; title:string; company:string; logo:string; location:string; remote:boolean; salary:string; type:string; tags:string[]; desc:string[] }

const JOBS: Job[] = [
  { id:'1', title:'Senior Frontend Engineer', company:'Verve', logo:'🟣', location:'San Francisco', remote:true, salary:'$160k–200k', type:'Full-time', tags:['React','TypeScript','Tailwind'], desc:['Own the design system and core product surfaces.','Partner with design to ship polished, accessible UI.','5+ years building production web apps.'] },
  { id:'2', title:'Product Designer', company:'Lightpath', logo:'🟡', location:'Remote', remote:true, salary:'$130k–165k', type:'Full-time', tags:['Figma','Prototyping','Research'], desc:['Lead design end to end for a major product area.','Run research and turn insight into shipped work.','Strong portfolio of shipped product work.'] },
  { id:'3', title:'Backend Engineer', company:'Trove', logo:'🔵', location:'New York', remote:false, salary:'$150k–190k', type:'Full-time', tags:['Go','Postgres','AWS'], desc:['Design and scale the core API and data layer.','Own reliability and performance of key services.','Experience with distributed systems.'] },
  { id:'4', title:'Founding Growth Lead', company:'Beacon', logo:'🟢', location:'Austin', remote:true, salary:'$120k–160k plus equity', type:'Full-time', tags:['SEO','Lifecycle','Analytics'], desc:['Build the growth function from zero.','Own acquisition, activation, and retention loops.','Scrappy, data-driven, and fast.'] },
]
const FILTERS = ['All','Remote','Engineering','Design']

export default function App() {
  const [active, setActive] = useState<Job|null>(null)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const filtered = JOBS.filter(j=>{
    if (filter==='Remote' && !j.remote) return false
    if (filter==='Engineering' && !j.title.toLowerCase().includes('engineer')) return false
    if (filter==='Design' && !j.title.toLowerCase().includes('design')) return false
    return (j.title+j.company).toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <div className={clsx('flex-1', active && 'hidden md:block')}>
        <header className="bg-white border-b">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <h1 className="text-2xl font-bold mb-1">Find your next role</h1>
            <p className="text-slate-500 text-sm mb-5">{JOBS.length} open roles at fast-growing startups</p>
            <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-4 py-2.5"><Search className="w-4 h-4 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder="Search roles or companies..." /></div>
            <div className="flex gap-2 mt-3">{FILTERS.map(f=><button key={f} onClick={()=>setFilter(f)} className={clsx('px-3 py-1 rounded-full text-sm font-medium transition-colors', filter===f?'bg-slate-900 text-white':'bg-white border text-slate-600 hover:bg-slate-50')}>{f}</button>)}</div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-6 space-y-3">
          {filtered.map(j=>(
            <button key={j.id} onClick={()=>setActive(j)} className={clsx('w-full text-left bg-white rounded-2xl border p-4 hover:border-violet-400 hover:shadow-sm transition-all', active?.id===j.id&&'border-violet-500 ring-1 ring-violet-200')}>
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl shrink-0">{j.logo}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{j.title}</h3>
                  <p className="text-sm text-slate-500">{j.company}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 flex-wrap">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{j.location}</span>
                    {j.remote && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">Remote</span>}
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{j.salary}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </main>
      </div>

      {active && (
        <div className="w-full md:w-[420px] bg-white border-l overflow-y-auto">
          <div className="p-6">
            <button onClick={()=>setActive(null)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors md:hidden"><ChevronLeft className="w-4 h-4" /> Back</button>
            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center text-3xl mb-4">{active.logo}</div>
            <h1 className="text-xl font-bold">{active.title}</h1>
            <p className="text-slate-500 flex items-center gap-1.5 mt-1"><Building2 className="w-4 h-4" />{active.company}</p>
            <div className="flex flex-wrap gap-2 my-5 text-sm">
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100"><MapPin className="w-3.5 h-3.5" />{active.location}</span>
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100"><Briefcase className="w-3.5 h-3.5" />{active.type}</span>
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100"><DollarSign className="w-3.5 h-3.5" />{active.salary}</span>
            </div>
            <h2 className="font-semibold mb-2 text-sm">What you will do</h2>
            <ul className="space-y-2 mb-5">{active.desc.map((d,i)=><li key={i} className="flex gap-2 text-sm text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />{d}</li>)}</ul>
            <div className="flex flex-wrap gap-1.5 mb-6">{active.tags.map(t=><span key={t} className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">{t}</span>)}</div>
            <button className="w-full bg-violet-600 hover:bg-violet-500 text-white rounded-xl py-3 font-semibold transition-colors">Apply now</button>
          </div>
        </div>
      )}
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 22. Form Builder
// ─────────────────────────────────────────────────────────────────────────────
const formBuilder: BuiltInTemplate = {
  id: "form-builder",
  name: "Form Builder",
  description: "Click-to-add form builder with a field palette, live canvas, settings, and preview.",
  category: "saas",
  is_featured: false,
  fork_count: 760,
  tags: ["forms", "builder", "survey"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Type, Mail, List, CheckSquare, Calendar, Star, Trash2, Eye, Pencil, GripVertical } from 'lucide-react'

interface Field { id:string; type:string; label:string; placeholder:string; required:boolean }

const PALETTE = [
  { type:'text', label:'Text', icon:Type },
  { type:'email', label:'Email', icon:Mail },
  { type:'select', label:'Dropdown', icon:List },
  { type:'checkbox', label:'Checkbox', icon:CheckSquare },
  { type:'date', label:'Date', icon:Calendar },
  { type:'rating', label:'Rating', icon:Star },
]
const DEFAULT_LABELS: Record<string,string> = { text:'Your name', email:'Email address', select:'Choose an option', checkbox:'I agree to the terms', date:'Pick a date', rating:'Rate your experience' }

export default function App() {
  const [fields, setFields] = useState<Field[]>([
    { id:'1', type:'text', label:'Your name', placeholder:'Jane Doe', required:true },
    { id:'2', type:'email', label:'Email address', placeholder:'jane@email.com', required:true },
    { id:'3', type:'rating', label:'Rate your experience', placeholder:'', required:false },
  ])
  const [selected, setSelected] = useState<string|null>('1')
  const [preview, setPreview] = useState(false)

  const add = (type:string) => { const f:Field = { id:Date.now().toString(), type, label:DEFAULT_LABELS[type]??'Field', placeholder:'', required:false }; setFields(x=>[...x,f]); setSelected(f.id) }
  const update = (id:string, patch:Partial<Field>) => setFields(x=>x.map(f=>f.id===id?{...f,...patch}:f))
  const remove = (id:string) => { setFields(x=>x.filter(f=>f.id!==id)); if(selected===id) setSelected(null) }
  const sel = fields.find(f=>f.id===selected)

  const renderField = (f:Field) => {
    if (f.type==='checkbox') return <label className="flex items-center gap-2 text-sm"><input type="checkbox" />{f.label}</label>
    if (f.type==='rating') return <div className="flex gap-1">{Array.from({length:5}).map((_,i)=><Star key={i} className="w-6 h-6 text-amber-300" />)}</div>
    if (f.type==='select') return <select className="w-full border rounded-lg px-3 py-2 text-sm"><option>Option A</option><option>Option B</option></select>
    return <input type={f.type==='email'?'email':f.type==='date'?'date':'text'} placeholder={f.placeholder} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" />
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">
      <aside className="w-44 bg-white border-r p-3 hidden md:block">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Fields</p>
        <div className="space-y-1">{PALETTE.map(p=><button key={p.type} onClick={()=>add(p.type)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-violet-50 hover:text-violet-700 transition-colors"><p.icon className="w-4 h-4" />{p.label}</button>)}</div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-bold">Contact form</h1>
            <button onClick={()=>setPreview(p=>!p)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white border hover:bg-slate-50 transition-colors">{preview?<Pencil className="w-3.5 h-3.5" />:<Eye className="w-3.5 h-3.5" />}{preview?'Edit':'Preview'}</button>
          </div>
          <div className="bg-white rounded-2xl border p-6 space-y-4">
            {fields.map(f=>(
              <div key={f.id} onClick={()=>!preview&&setSelected(f.id)} className={clsx('rounded-lg', !preview&&'cursor-pointer -m-2 p-2 transition-colors', !preview&&selected===f.id&&'bg-violet-50 ring-1 ring-violet-200', !preview&&selected!==f.id&&'hover:bg-slate-50')}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">{f.label}{f.required&&<span className="text-red-500"> *</span>}</label>
                  {!preview && <div className="flex items-center gap-1 text-slate-400"><GripVertical className="w-3.5 h-3.5" /><button onClick={(e)=>{e.stopPropagation();remove(f.id)}} className="hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></div>}
                </div>
                {renderField(f)}
              </div>
            ))}
            {preview && <button className="w-full bg-violet-600 text-white rounded-lg py-2.5 text-sm font-semibold">Submit</button>}
          </div>
        </div>
      </main>

      <aside className="w-64 bg-white border-l p-4 hidden lg:block">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Field settings</p>
        {sel ? (
          <div className="space-y-3">
            <div><label className="text-xs text-slate-500">Label</label><input value={sel.label} onChange={e=>update(sel.id,{label:e.target.value})} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-1 outline-none focus:border-violet-500" /></div>
            <div><label className="text-xs text-slate-500">Placeholder</label><input value={sel.placeholder} onChange={e=>update(sel.id,{placeholder:e.target.value})} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-1 outline-none focus:border-violet-500" /></div>
            <label className="flex items-center justify-between text-sm"><span>Required</span><input type="checkbox" checked={sel.required} onChange={e=>update(sel.id,{required:e.target.checked})} /></label>
          </div>
        ) : <p className="text-sm text-slate-400">Select a field to edit.</p>}
      </aside>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 23. CRM System
// ─────────────────────────────────────────────────────────────────────────────
const crmSystem: BuiltInTemplate = {
  id: "crm-system",
  name: "CRM System",
  description: "Sales CRM with summary cards, a deals pipeline (Kanban), and a contacts table.",
  category: "saas",
  is_featured: false,
  fork_count: 720,
  tags: ["crm", "sales", "pipeline"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Search, Plus, TrendingUp, Users, Target, DollarSign } from 'lucide-react'

interface Contact { id:string; name:string; company:string; email:string; stage:string; value:number; avatar:string }

const STAGES = ['Lead','Qualified','Proposal','Won']
const STAGE_COLORS: Record<string,string> = { Lead:'bg-slate-500', Qualified:'bg-sky-500', Proposal:'bg-amber-500', Won:'bg-emerald-500' }
const CONTACTS: Contact[] = [
  { id:'1', name:'Alice Chen', company:'Verve', email:'alice@verve.io', stage:'Proposal', value:24000, avatar:'🦊' },
  { id:'2', name:'Bob Wang', company:'Lightpath', email:'bob@lightpath.com', stage:'Qualified', value:12000, avatar:'🐙' },
  { id:'3', name:'Carol Diaz', company:'Trove', email:'carol@trove.co', stage:'Won', value:48000, avatar:'🌞' },
  { id:'4', name:'Dave Kim', company:'Beacon', email:'dave@beacon.app', stage:'Lead', value:8000, avatar:'🦉' },
  { id:'5', name:'Eve Park', company:'Backbone', email:'eve@backbone.io', stage:'Proposal', value:32000, avatar:'🦅' },
  { id:'6', name:'Frank Li', company:'Quiet', email:'frank@quiet.work', stage:'Qualified', value:15000, avatar:'🐢' },
]

function money(n:number) { return '$' + n.toLocaleString() }

export default function App() {
  const [view, setView] = useState<'pipeline'|'table'>('pipeline')
  const [search, setSearch] = useState('')
  const filtered = CONTACTS.filter(c=>(c.name+c.company).toLowerCase().includes(search.toLowerCase()))
  const pipelineValue = CONTACTS.reduce((s,c)=>s+c.value,0)
  const won = CONTACTS.filter(c=>c.stage==='Won')
  const winRate = Math.round(won.length/CONTACTS.length*100)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h1 className="text-2xl font-bold">Pipeline</h1><p className="text-sm text-slate-400">{CONTACTS.length} deals in progress</p></div>
          <button className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> Add deal</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {label:'Pipeline value', value:money(pipelineValue), icon:DollarSign},
            {label:'Deals', value:String(CONTACTS.length), icon:Users},
            {label:'Win rate', value:winRate+'%', icon:Target},
            {label:'Avg deal', value:money(Math.round(pipelineValue/CONTACTS.length)), icon:TrendingUp},
          ].map(s=>(
            <div key={s.label} className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2"><p className="text-xs text-slate-400">{s.label}</p><s.icon className="w-4 h-4 text-slate-500" /></div>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {(['pipeline','table'] as const).map(v=><button key={v} onClick={()=>setView(v)} className={clsx('px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors', view===v?'bg-violet-600 text-white':'text-slate-400 hover:text-white')}>{v}</button>)}
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 max-w-xs flex-1"><Search className="w-4 h-4 text-slate-500" /><input value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" placeholder="Search deals..." /></div>
        </div>

        {view==='pipeline' ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STAGES.map(stage=>{
              const items = filtered.filter(c=>c.stage===stage)
              return (
                <div key={stage} className="bg-slate-900/50 rounded-xl border border-slate-800 p-3">
                  <div className="flex items-center gap-2 mb-3"><span className={clsx('w-2 h-2 rounded-full', STAGE_COLORS[stage])} /><span className="text-sm font-medium">{stage}</span><span className="ml-auto text-xs text-slate-500">{items.length}</span></div>
                  <div className="space-y-2">{items.map(c=>(
                    <div key={c.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-1"><span className="text-lg">{c.avatar}</span><span className="text-sm font-medium truncate">{c.name}</span></div>
                      <p className="text-xs text-slate-400 mb-2">{c.company}</p>
                      <p className="text-sm font-semibold text-emerald-400">{money(c.value)}</p>
                    </div>
                  ))}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800">{['Name','Company','Stage','Value'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">{h}</th>)}</tr></thead>
              <tbody>{filtered.map(c=>(
                <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium flex items-center gap-2"><span className="text-lg">{c.avatar}</span>{c.name}</td>
                  <td className="px-4 py-3 text-slate-400">{c.company}</td>
                  <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs text-white', STAGE_COLORS[c.stage])}>{c.stage}</span></td>
                  <td className="px-4 py-3 font-semibold">{money(c.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 24. Invoice Generator
// ─────────────────────────────────────────────────────────────────────────────
const invoiceApp: BuiltInTemplate = {
  id: "invoice-app",
  name: "Invoice Generator",
  description: "Build invoices with live line items and tax, alongside a styled printable preview.",
  category: "saas",
  is_featured: false,
  fork_count: 640,
  tags: ["invoicing", "billing", "finance"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import clsx from 'clsx'
import { Plus, Trash2, Download, FileText } from 'lucide-react'

interface Line { id:string; desc:string; qty:number; price:number }

function money(n:number) { return '$' + n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) }

const INVOICES = [
  { num:'INV-0042', client:'Verve Inc', amount:2400, status:'paid' },
  { num:'INV-0041', client:'Lightpath', amount:1800, status:'sent' },
  { num:'INV-0040', client:'Trove Co', amount:5200, status:'overdue' },
  { num:'INV-0039', client:'Beacon', amount:960, status:'draft' },
]
const STATUS: Record<string,string> = { paid:'bg-emerald-500/15 text-emerald-400', sent:'bg-sky-500/15 text-sky-400', overdue:'bg-red-500/15 text-red-400', draft:'bg-slate-500/15 text-slate-400' }

export default function App() {
  const [client, setClient] = useState('Verve Inc')
  const [lines, setLines] = useState<Line[]>([
    { id:'1', desc:'Design system audit', qty:1, price:1200 },
    { id:'2', desc:'Component library build', qty:20, price:60 },
  ])
  const [taxRate, setTaxRate] = useState(8)

  const addLine = () => setLines(l=>[...l,{ id:Date.now().toString(), desc:'', qty:1, price:0 }])
  const update = (id:string, patch:Partial<Line>) => setLines(l=>l.map(x=>x.id===id?{...x,...patch}:x))
  const remove = (id:string) => setLines(l=>l.filter(x=>x.id!==id))
  const subtotal = lines.reduce((s,l)=>s+l.qty*l.price,0)
  const tax = subtotal*taxRate/100
  const total = subtotal+tax

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col lg:flex-row">
      <div className="lg:w-1/2 p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center gap-2 font-bold text-lg"><FileText className="w-5 h-5 text-violet-600" /> New invoice</div>
        <div><label className="text-xs text-slate-500">Bill to</label><input value={client} onChange={e=>setClient(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:border-violet-500 bg-white" /></div>

        <div>
          <div className="flex items-center justify-between mb-2"><label className="text-xs text-slate-500">Line items</label><button onClick={addLine} className="flex items-center gap-1 text-xs text-violet-600 font-medium"><Plus className="w-3.5 h-3.5" /> Add</button></div>
          <div className="space-y-2">{lines.map(l=>(
            <div key={l.id} className="flex gap-2 items-center bg-white rounded-lg border p-2">
              <input value={l.desc} onChange={e=>update(l.id,{desc:e.target.value})} placeholder="Description" className="flex-1 text-sm outline-none" />
              <input type="number" value={l.qty} onChange={e=>update(l.id,{qty:Number(e.target.value)})} className="w-12 text-sm text-center border rounded px-1 py-0.5 outline-none" />
              <input type="number" value={l.price} onChange={e=>update(l.id,{price:Number(e.target.value)})} className="w-20 text-sm text-right border rounded px-2 py-0.5 outline-none" />
              <button onClick={()=>remove(l.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}</div>
        </div>

        <div className="flex items-center gap-2"><label className="text-xs text-slate-500">Tax rate %</label><input type="number" value={taxRate} onChange={e=>setTaxRate(Number(e.target.value))} className="w-16 border rounded-lg px-2 py-1 text-sm outline-none bg-white" /></div>

        <p className="text-xs font-semibold text-slate-400 uppercase pt-4">Recent</p>
        <div className="space-y-1">{INVOICES.map(inv=>(
          <div key={inv.num} className="flex items-center gap-3 bg-white rounded-lg border p-2.5 text-sm">
            <span className="font-mono text-xs text-slate-500">{inv.num}</span><span className="flex-1">{inv.client}</span>
            <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS[inv.status])}>{inv.status}</span>
            <span className="font-semibold">{money(inv.amount)}</span>
          </div>
        ))}</div>
      </div>

      <div className="lg:w-1/2 p-6 bg-slate-200/50 flex items-start justify-center">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
          <div className="flex items-center justify-between mb-8"><div><div className="font-bold text-lg">Invoice</div><div className="text-xs text-slate-400">INV-0043</div></div><div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold">A</div></div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div><p className="text-xs text-slate-400 mb-1">From</p><p className="font-medium">Acme Studio</p></div>
            <div><p className="text-xs text-slate-400 mb-1">Bill to</p><p className="font-medium">{client}</p></div>
          </div>
          <table className="w-full text-sm mb-6">
            <thead><tr className="border-b text-xs text-slate-400"><th className="text-left py-1.5 font-medium">Item</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Amount</th></tr></thead>
            <tbody>{lines.map(l=>(<tr key={l.id} className="border-b border-slate-100"><td className="py-2">{l.desc||'Item'}</td><td className="text-right">{l.qty}</td><td className="text-right">{money(l.qty*l.price)}</td></tr>))}</tbody>
          </table>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Tax ({taxRate}%)</span><span>{money(tax)}</span></div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2"><span>Total</span><span>{money(total)}</span></div>
          </div>
          <button className="w-full mt-6 bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors"><Download className="w-4 h-4" /> Download PDF</button>
        </div>
      </div>
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Shopify Storefront Starter
// ─────────────────────────────────────────────────────────────────────────────
const shopifyStorefront: BuiltInTemplate = {
  id: "shopify-storefront",
  name: "Shopify Storefront",
  description: "Headless Shopify storefront with product grid, cart drawer, and Storefront API setup guide.",
  category: "ecommerce",
  is_featured: true,
  fork_count: 620,
  tags: ["shopify", "ecommerce", "storefront", "hydrogen"],
  files: scaffold({
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { useState } from 'react'
import { ShoppingBag, X, Plus, Minus, ExternalLink, Store } from 'lucide-react'

interface Product { id: string; title: string; price: number; image: string; handle: string }

const DEMO_PRODUCTS: Product[] = [
  { id: '1', title: 'Classic Tee', price: 32, image: '👕', handle: 'classic-tee' },
  { id: '2', title: 'Canvas Tote', price: 24, image: '👜', handle: 'canvas-tote' },
  { id: '3', title: 'Ceramic Mug', price: 18, image: '☕', handle: 'ceramic-mug' },
  { id: '4', title: 'Studio Cap', price: 28, image: '🧢', handle: 'studio-cap' },
]

export default function App() {
  const [cart, setCart] = useState<Array<{ product: Product; qty: number }>>([])
  const [open, setOpen] = useState(false)

  const add = (p: Product) => setCart(c => {
    const ex = c.find(i => i.product.id === p.id)
    return ex ? c.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { product: p, qty: 1 }]
  })
  const total = cart.reduce((s, i) => s + i.product.price * i.qty, 0)
  const count = cart.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Store className="w-4 h-4" /> My Shopify Store</div>
          <button onClick={() => setOpen(true)} className="relative p-2 rounded-full hover:bg-stone-100">
            <ShoppingBag className="w-5 h-5" />
            {count > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-600 text-white text-[10px] rounded-full flex items-center justify-center">{count}</span>}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm">
          <p className="font-medium text-emerald-900 mb-1">Connect your Shopify store</p>
          <p className="text-emerald-800/80 text-xs leading-relaxed">Add SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN in Env, then ask AI to wire the Storefront GraphQL API. Demo products shown until connected.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DEMO_PRODUCTS.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-square bg-stone-100 flex items-center justify-center text-4xl">{p.image}</div>
              <div className="p-3">
                <div className="text-sm font-medium truncate">{p.title}</div>
                <div className="text-emerald-700 font-semibold mt-0.5">\${p.price}</div>
                <button onClick={() => add(p)} className="mt-2 w-full py-1.5 text-xs font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700">Add to cart</button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {open && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold">Cart ({count})</span>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? <p className="text-sm text-stone-500">Your cart is empty</p> : cart.map(i => (
                <div key={i.product.id} className="flex gap-3 items-center">
                  <span className="text-2xl">{i.product.image}</span>
                  <div className="flex-1"><div className="text-sm font-medium">{i.product.title}</div><div className="text-xs text-stone-500">Qty {i.qty}</div></div>
                  <div className="font-medium">\${i.product.price * i.qty}</div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t">
                <div className="flex justify-between font-semibold mb-3"><span>Total</span><span>\${total}</span></div>
                <button className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1">Checkout <ExternalLink className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  saasLanding,
  adminDashboard,
  ecommerceStore,
  shopifyStorefront,
  saasStarter,
  kanbanBoard,
  todoApp,
  portfolio,
  financeTracker,
  notesApp,
  analyticsDashboard,
  weatherApp,
  musicPlayer,
  landingMinimal,
  socialFeed,
  chatApp,
  startupLanding,
  videoPlatform,
  calendarApp,
  recipeApp,
  blogPlatform,
  jobBoard,
  formBuilder,
  crmSystem,
  invoiceApp,
];

export function getTemplateById(id: string): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id);
}
