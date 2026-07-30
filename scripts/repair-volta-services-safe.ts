/**
 * Rewrite ServicesPreview + Services with safe titleCase AFTER imports.
 */
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

const SERVICES_PREVIEW = `import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { MOCK_SERVICES } from '../../data/mock'
import { Badge } from '../ui/Badge'

function titleCase(value: unknown): string {
  const s = String(value ?? '').trim() || 'Item'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const categoryColors = {
  wellness: 'green' as const,
  beauty: 'rose' as const,
  lifestyle: 'gold' as const,
  nutrition: 'amber' as const,
}

export function ServicesPreview() {
  const featured = (MOCK_SERVICES ?? []).slice(0, 4)

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-gold-600 text-xs tracking-[0.4em] uppercase font-sans mb-4">What We Offer</p>
          <h2 className="font-serif text-4xl sm:text-5xl text-stone-900 font-light mb-4">
            Curated Pathways to
            <span className="italic block text-gold-600"> Your Flourishing</span>
          </h2>
          <p className="text-stone-500 max-w-xl mx-auto leading-relaxed">
            Each Lumière service is a meticulously crafted experience, designed to address the whole person — body, mind, and spirit.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {featured.map((service, i) => {
            const category = service?.category ?? 'wellness'
            return (
              <motion.div
                key={service?.id ?? i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group bg-white rounded-2xl border border-stone-200 hover:border-gold-200 hover:shadow-lg transition-all duration-300 overflow-hidden"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-stone-100">
                  <img
                    src={service?.image}
                    alt={service?.title ?? 'Service'}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-900/50 to-transparent" />
                  <div className="absolute top-4 left-4">
                    <Badge variant={categoryColors[category as keyof typeof categoryColors] ?? 'gold'}>
                      {titleCase(category)}
                    </Badge>
                  </div>
                  <div className="absolute bottom-4 right-4 text-3xl">{service?.icon}</div>
                </div>
                <div className="p-6">
                  <h3 className="font-serif text-xl text-stone-900 mb-1">{service?.title}</h3>
                  <p className="text-gold-600 text-sm mb-3 font-light italic">{service?.subtitle ?? service?.title}</p>
                  <p className="text-stone-500 text-sm leading-relaxed mb-4">{service?.description}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-stone-900 font-medium text-sm">{service?.price ?? 'Upon request'}</p>
                      <p className="text-stone-400 text-xs">{service?.duration ?? ''}</p>
                    </div>
                    <Link
                      to="/services"
                      className="flex items-center gap-1 text-gold-600 text-sm font-medium hover:gap-2 transition-all"
                    >
                      Learn more <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="text-center mt-12">
          <Link to="/services">
            <button className="inline-flex items-center gap-2 text-gold-600 font-medium hover:gap-3 transition-all text-sm border-b border-gold-300 pb-1">
              View all six services <ArrowRight size={14} />
            </button>
          </Link>
        </div>
      </div>
    </section>
  )
}
`;

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ServicesPreview — full safe rewrite
  {
    const { data: row } = await sb
      .from("project_files")
      .select("id")
      .eq("project_id", projectId)
      .eq("path", "src/components/home/ServicesPreview.tsx")
      .maybeSingle();
    if (!row) throw new Error("ServicesPreview missing");
    const { error } = await sb
      .from("project_files")
      .update({ content: SERVICES_PREVIEW, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw error;
    console.log("wrote ServicesPreview", SERVICES_PREVIEW.startsWith("import"));
  }

  // Services page — move helper after imports without full rewrite
  {
    const { data: row } = await sb
      .from("project_files")
      .select("id,content")
      .eq("project_id", projectId)
      .eq("path", "src/pages/Services.tsx")
      .maybeSingle();
    if (!row) throw new Error("Services missing");
    let c = (row.content ?? "").replace(/\r\n/g, "\n");
    c = c.replace(/^function titleCase\([\s\S]*?\n\}\n+/m, "");
    if (!c.startsWith("import")) {
      // strip anything before first import
      const idx = c.indexOf("import ");
      if (idx > 0) c = c.slice(idx);
    }
    if (!/function titleCase\(/.test(c)) {
      const m = c.match(/^(?:import[\s\S]*?;\n)+/);
      if (!m) throw new Error("no imports in Services");
      c =
        m[0] +
        `\nfunction titleCase(value: unknown): string {\n  const s = String(value ?? '').trim() || 'Item'\n  return s.charAt(0).toUpperCase() + s.slice(1)\n}\n\n` +
        c.slice(m[0].length);
    }
    c = c.replace(
      /\{\s*([A-Za-z_$][\w$]*)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\1\.slice\(1\)\s*\}/g,
      "{titleCase($1)}",
    );
    c = c.replace(
      /\{\s*\(([^)]+)\)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\(([^)]+)\)\.slice\(1\)\s*\}/g,
      "{titleCase($1)}",
    );
    c = c.replace(
      /categoryColors\[service\.category\]/g,
      "categoryColors[(service.category as keyof typeof categoryColors) ?? 'wellness'] ?? 'gold'",
    );
    const { error } = await sb
      .from("project_files")
      .update({ content: c, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw error;
    console.log("wrote Services", c.startsWith("import"), /function titleCase\(/.test(c));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
