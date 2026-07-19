import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const projectId = "df9dd882-ec56-450f-b9ce-dbddd227af31";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SERVICES = `import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Check, ArrowRight, Clock, DollarSign } from 'lucide-react'
import { MOCK_SERVICES } from '../data/mock'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import type { Service } from '../lib/types'

function titleCase(value: unknown): string {
  const s = String(value ?? '').trim() || 'Item'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type CategoryFilter = 'all' | 'wellness' | 'beauty' | 'lifestyle' | 'nutrition'

const categoryColors = {
  wellness: 'green' as const,
  beauty: 'rose' as const,
  lifestyle: 'gold' as const,
  nutrition: 'amber' as const,
}

const PROCESS_STEPS = [
  { step: '01', title: 'Discovery Consultation', description: 'A complimentary 30-minute call with a senior practitioner to understand your goals, history, and vision.' },
  { step: '02', title: 'Personalised Assessment', description: 'A comprehensive evaluation — physical, nutritional, emotional — to establish your baseline and design your protocol.' },
  { step: '03', title: 'Bespoke Programme Design', description: 'Your dedicated practitioner crafts a fully personalised programme, selecting and sequencing the optimal treatments and interventions.' },
  { step: '04', title: 'Transformative Journey', description: 'You embark on your programme with full support, regular reviews, and adjustments as you evolve and progress.' },
  { step: '05', title: 'Integration & Continuation', description: 'At programme completion, we design a sustainable maintenance protocol to protect and build upon your transformation.' },
]

export default function Services() {
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = activeFilter === 'all'
    ? (MOCK_SERVICES ?? [])
    : (MOCK_SERVICES ?? []).filter((s) => s.category === activeFilter)

  return (
    <div className="pt-20">
      <section className="relative py-24 bg-stone-900 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://loremflickr.com/1920/600/spa,luxury,wellness?lock=300"
            alt=""
            className="w-full h-full object-cover opacity-30"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-900 to-stone-900/80" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-gold-400 text-xs tracking-[0.4em] uppercase font-sans mb-6">Our Offerings</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-white font-light mb-6">
              Services Crafted for
              <span className="italic block text-gold-300">the Exceptional</span>
            </h1>
            <p className="text-stone-300 text-lg leading-relaxed max-w-2xl mx-auto">
              Each service is a meticulously designed journey, delivered by world-class practitioners in an environment of absolute beauty and discretion.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-8 bg-white border-b border-stone-200 sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-3 justify-center">
            {(['all', 'wellness', 'beauty', 'lifestyle', 'nutrition'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={\`px-5 py-2 rounded-full text-sm font-medium transition-all \${
                  activeFilter === cat
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }\`}
              >
                {titleCase(cat)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {filtered.map((service: Service, i) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden hover:border-gold-200 hover:shadow-lg transition-all duration-300"
              >
                <div className="relative aspect-[16/8] overflow-hidden">
                  <img
                    src={service.image}
                    alt={service.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 to-transparent" />
                  <div className="absolute top-4 left-4">
                    <Badge variant={categoryColors[(service.category as keyof typeof categoryColors) ?? 'wellness'] ?? 'gold'}>
                      {titleCase(service.category ?? 'wellness')}
                    </Badge>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="font-serif text-2xl text-white">{service.title}</h3>
                    <p className="text-gold-300 text-sm italic">{service.subtitle}</p>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-stone-600 text-sm leading-relaxed mb-4">{service.description}</p>
                  <div className="flex items-center gap-6 mb-4 text-sm text-stone-500">
                    <span className="flex items-center gap-1"><Clock size={13} /> {service.duration}</span>
                    <span className="flex items-center gap-1"><DollarSign size={13} /> {service.price}</span>
                  </div>

                  {expandedId === service.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4"
                    >
                      <p className="text-stone-600 text-sm leading-relaxed mb-4">{service.longDescription}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(service.features ?? []).map((f) => (
                          <div key={f} className="flex items-start gap-2 text-sm text-stone-600">
                            <Check size={13} className="text-gold-500 mt-0.5 shrink-0" />
                            {f}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setExpandedId(expandedId === service.id ? null : service.id)}
                      className="text-sm text-gold-600 font-medium hover:text-gold-700 transition-colors"
                    >
                      {expandedId === service.id ? 'Show less' : 'Read more'}
                    </button>
                    <Link to="/contact" className="ml-auto">
                      <Button variant="primary" size="sm">
                        Book Now <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-gold-600 text-xs tracking-[0.4em] uppercase font-sans mb-4">How It Works</p>
            <h2 className="font-serif text-4xl text-stone-900 font-light">
              The Lumière
              <span className="italic block text-gold-600">Experience</span>
            </h2>
          </motion.div>
          <div className="space-y-8">
            {PROCESS_STEPS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-6"
              >
                <div className="shrink-0 w-12 h-12 rounded-full border-2 border-gold-300 flex items-center justify-center">
                  <span className="text-gold-600 text-xs font-medium">{step.step}</span>
                </div>
                <div className="pt-2">
                  <h3 className="font-serif text-xl text-stone-900 mb-2">{step.title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-stone-50">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl text-stone-900 font-light mb-4">Ready to Begin?</h2>
          <p className="text-stone-500 text-sm mb-8">Schedule your complimentary discovery consultation and take the first step toward your most extraordinary self.</p>
          <Link to="/contact">
            <Button variant="primary" size="lg">Book Your Free Consultation</Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
`;

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error } = await sb
    .from("project_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("path", "src/pages/Services.tsx")
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("missing Services.tsx");
  const { error: upErr } = await sb
    .from("project_files")
    .update({ content: SERVICES, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (upErr) throw upErr;
  console.log("ok", SERVICES.startsWith("import"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
