/**
 * Fix data/UI shape mismatches that white-screen project df9dd882.
 * Usage: npx tsx scripts/repair-volta-runtime.ts [projectId]
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2] ?? "df9dd882-ec56-450f-b9ce-dbddd227af31";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const CATEGORIES = ["wellness", "beauty", "lifestyle", "nutrition", "wellness", "lifestyle"] as const;
const PRICES = ["From $180", "From $220", "From $260", "From $150", "From $190", "From $320"];
const DURATIONS = ["60–90 min", "75 min", "90 min", "45 min", "60 min", "Half day"];

function enrichMock(content: string): string {
  let next = content;

  // Add category/subtitle/price/duration onto each MOCK_SERVICES object if missing.
  if (!/category:\s*['"]wellness['"]/.test(next)) {
    let i = 0;
    next = next.replace(
      /(id:\s*'[^']+',\s*\n\s*title:\s*'([^']+)',\s*\n\s*description:)/g,
      (full, head, title: string) => {
        const cat = CATEGORIES[i % CATEGORIES.length];
        const price = PRICES[i % PRICES.length];
        const duration = DURATIONS[i % DURATIONS.length];
        i += 1;
        return `id: '${full.match(/id:\s*'([^']+)'/)?.[1] ?? "svc"}',\n    title: '${title}',\n    category: '${cat}',\n    subtitle: '${title} experience',\n    price: '${price}',\n    duration: '${duration}',\n    description:`;
      },
    );
    // The regex above may have duplicated id/title — use a cleaner approach instead.
  }

  return next;
}

/** Safer rewrite of MOCK_SERVICES block fields via structured patch. */
function patchMockServices(content: string): string {
  if (/category:\s*'wellness'/.test(content) && /subtitle:/.test(content)) return content;

  return content.replace(
    /export const MOCK_SERVICES: Service\[\] = \[[\s\S]*?\];/,
    `export const MOCK_SERVICES: Service[] = [
  {
    id: 'brand-identity',
    title: 'Brand Identity',
    category: 'lifestyle',
    subtitle: 'Signature visual systems',
    price: 'From $180',
    duration: '60–90 min',
    description: 'We craft distinctive brand identities that resonate deeply with your audience. From logo design to comprehensive brand guidelines, every element is thoughtfully considered.',
    icon: 'Palette',
    image: 'https://loremflickr.com/800/600/branding?lock=1',
    features: ['Logo & Visual Identity', 'Brand Strategy', 'Tone of Voice', 'Brand Guidelines', 'Packaging Design'],
  },
  {
    id: 'interior-design',
    title: 'Interior Curation',
    category: 'wellness',
    subtitle: 'Spaces that restore',
    price: 'From $220',
    duration: '75 min',
    description: 'Our interior curation service transforms spaces into immersive brand experiences. We blend aesthetics with functionality to create environments that inspire.',
    icon: 'Sofa',
    image: 'https://loremflickr.com/800/600/interior%20design?lock=2',
    features: ['Residential Design', 'Commercial Spaces', 'Showroom Design', 'Spatial Planning', 'Furniture Curation'],
  },
  {
    id: 'art-direction',
    title: 'Art Direction',
    category: 'beauty',
    subtitle: 'Editorial visual storytelling',
    price: 'From $260',
    duration: '90 min',
    description: 'Elevate your visual storytelling with our art direction services. We bring a cinematic, editorial eye to every project, from campaigns to content.',
    icon: 'Camera',
    image: 'https://loremflickr.com/800/600/art%20direction?lock=3',
    features: ['Campaign Direction', 'Editorial Photography', 'Video Production', 'Creative Strategy', 'Visual Storytelling'],
  },
  {
    id: 'digital-experience',
    title: 'Digital Experience',
    category: 'nutrition',
    subtitle: 'Refined digital journeys',
    price: 'From $150',
    duration: '45 min',
    description: 'We design digital experiences that feel as refined as they function. Every interaction is crafted with intention, blending beauty with usability.',
    icon: 'Monitor',
    image: 'https://loremflickr.com/800/600/digital%20design?lock=4',
    features: ['Web Design', 'UI/UX Design', 'Digital Strategy', 'E-commerce Design', 'Motion Design'],
  },
  {
    id: 'editorial-content',
    title: 'Editorial Content',
    category: 'lifestyle',
    subtitle: 'Narratives that endure',
    price: 'From $190',
    duration: '60 min',
    description: 'Our editorial team creates compelling narratives that elevate your brand. From long-form features to social content, every word is purposeful.',
    icon: 'Pen',
    image: 'https://loremflickr.com/800/600/editorial%20writing?lock=5',
    features: ['Content Strategy', 'Copywriting', 'Brand Journalism', 'Social Content', 'Publishing'],
  },
  {
    id: 'events-experiences',
    title: 'Events & Experiences',
    category: 'wellness',
    subtitle: 'Moments worth remembering',
    price: 'From $320',
    duration: 'Half day',
    description: 'We produce memorable events and experiences that bring your brand to life. Every detail is curated to create lasting impressions.',
    icon: 'Sparkles',
    image: 'https://loremflickr.com/800/600/event%20design?lock=6',
    features: ['Event Design', 'Experiential Marketing', 'Pop-up Spaces', 'Private Events', 'Production Management'],
  },
];`,
  );
}

function patchMockTestimonials(content: string): string {
  if (/quote:/.test(content) && /rating:/.test(content)) {
    // Still ensure quote exists even if rating was stubbed elsewhere
  }
  return content.replace(
    /export const MOCK_TESTIMONIALS: Testimonial\[\] = \[[\s\S]*?\];/,
    `export const MOCK_TESTIMONIALS: Testimonial[] = [
  {
    id: 'test-1',
    name: 'Adrienne Laurent',
    role: 'CEO',
    company: 'Maison Laurent',
    content: 'Premium Feel transformed our brand identity completely.',
    quote: 'Premium Feel transformed our brand identity completely. Their editorial approach captured the essence of our heritage while pushing us into a new era of design excellence.',
    avatar: 'https://i.pravatar.cc/200?img=1',
    rating: 5,
    service: 'Brand Identity',
  },
  {
    id: 'test-2',
    name: 'David Chen',
    role: 'Creative Director',
    company: 'Verde Residences',
    content: 'Working with Elena and her team was a revelation.',
    quote: 'Working with Elena and her team was a revelation. They understood our vision from the first conversation and translated it into spaces that exceed our wildest expectations.',
    avatar: 'https://i.pravatar.cc/200?img=3',
    rating: 5,
    service: 'Interior Curation',
  },
  {
    id: 'test-3',
    name: 'Sophia Wright',
    role: 'Founder',
    company: 'Noble Paper Co.',
    content: 'The digital experience they built for us is a work of art.',
    quote: 'The digital experience they built for us is a work of art. Our customers constantly compliment the elegance and ease of our online presence.',
    avatar: 'https://i.pravatar.cc/200?img=5',
    rating: 5,
    service: 'Digital Experience',
  },
  {
    id: 'test-4',
    name: 'James Whitfield',
    role: 'Managing Director',
    company: 'The Whitfield Group',
    content: 'Their events team created an experience that people still talk about.',
    quote: 'Their events team created an experience that people still talk about months later. The level of curation and seamless execution was world-class.',
    avatar: 'https://i.pravatar.cc/200?img=12',
    rating: 5,
    service: 'Events & Experiences',
  },
];`,
  );
}

function patchMockBlog(content: string): string {
  // Ensure featured + slug + publishedAt on posts for FeaturedJournal / Blog links
  let next = content;
  next = next.replace(
    /export const MOCK_BLOG_POSTS: BlogPost\[\] = \[[\s\S]*?\];/,
    (block) => {
      if (/featured:\s*true/.test(block) && /publishedAt:/.test(block)) return block;
      return block
        .replace(/id: '([^']+)',\n(\s*)title:/g, "id: '$1',\n$2slug: '$1',\n$2title:")
        .replace(/date: '([^']+)',/g, "date: '$1',\n    publishedAt: '$1',")
        .replace(
          /readTime: '([^']+)',\n(\s*)\},/g,
          "readTime: '$1',\n$2featured: true,\n$2},",
        );
    },
  );
  return next;
}

function hardenServicesPreview(content: string): string {
  return content
    .replace(
      /categoryColors\[service\.category\]/g,
      "categoryColors[(service.category as keyof typeof categoryColors) ?? 'wellness'] ?? 'gold'",
    )
    .replace(
      /\{service\.category\.charAt\(0\)\.toUpperCase\(\) \+ service\.category\.slice\(1\)\}/g,
      "{(service.category ?? 'wellness').charAt(0).toUpperCase() + (service.category ?? 'wellness').slice(1)}",
    )
    .replace(
      /\{service\.subtitle\}/g,
      "{service.subtitle ?? service.title}",
    )
    .replace(
      /\{service\.price\}/g,
      "{service.price ?? 'Upon request'}",
    )
    .replace(
      /\{service\.duration\}/g,
      "{service.duration ?? ''}",
    );
}

function hardenTestimonials(content: string): string {
  return content
    .replace(
      /Array\.from\(\{ length: t\.rating \}\)/g,
      "Array.from({ length: t.rating ?? 5 })",
    )
    .replace(
      /\{t\.quote\}/g,
      "{t.quote ?? t.content ?? ''}",
    )
    .replace(
      /\{t\.service\}/g,
      "{t.service ?? t.company ?? ''}",
    );
}

function hardenServicesPage(content: string): string {
  return content
    .replace(
      /service\.category\.charAt\(0\)/g,
      "(service.category ?? 'wellness').charAt(0)",
    )
    .replace(
      /service\.category\.slice\(1\)/g,
      "(service.category ?? 'wellness').slice(1)",
    );
}

async function upsert(sb: ReturnType<typeof createClient>, path: string, content: string) {
  const { data: existing } = await sb
    .from("project_files")
    .select("id,content")
    .eq("project_id", projectId)
    .eq("path", path)
    .maybeSingle();

  if (!existing) {
    const { error } = await sb.from("project_files").insert({
      project_id: projectId,
      path,
      content,
    });
    if (error) throw error;
    console.log("inserted", path);
    return;
  }
  if (existing.content === content) {
    console.log("unchanged", path);
    return;
  }
  const { error } = await sb
    .from("project_files")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) throw error;
  console.log("updated", path);
}

async function main() {
  void enrichMock; // reserved
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const paths = [
    "src/data/mock.ts",
    "src/components/home/ServicesPreview.tsx",
    "src/components/home/TestimonialsSection.tsx",
    "src/pages/Services.tsx",
  ];
  const { data: rows, error } = await sb
    .from("project_files")
    .select("path,content")
    .eq("project_id", projectId)
    .in("path", paths);
  if (error) throw error;

  const byPath = new Map((rows ?? []).map((r) => [r.path, r.content as string]));

  const mock = patchMockBlog(patchMockTestimonials(patchMockServices(byPath.get("src/data/mock.ts") ?? "")));
  await upsert(sb, "src/data/mock.ts", mock);

  if (byPath.has("src/components/home/ServicesPreview.tsx")) {
    await upsert(
      sb,
      "src/components/home/ServicesPreview.tsx",
      hardenServicesPreview(byPath.get("src/components/home/ServicesPreview.tsx")!),
    );
  }
  if (byPath.has("src/components/home/TestimonialsSection.tsx")) {
    await upsert(
      sb,
      "src/components/home/TestimonialsSection.tsx",
      hardenTestimonials(byPath.get("src/components/home/TestimonialsSection.tsx")!),
    );
  }
  if (byPath.has("src/pages/Services.tsx")) {
    await upsert(
      sb,
      "src/pages/Services.tsx",
      hardenServicesPage(byPath.get("src/pages/Services.tsx")!),
    );
  }

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
