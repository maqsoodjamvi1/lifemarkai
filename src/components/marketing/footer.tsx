import { Link } from "@tanstack/react-router";
import { Zap,Github,Twitter } from "lucide-react";

type FooterLink = {
  label: string;
  to:
    | "/"
    | "/about"
    | "/api-reference"
    | "/blog"
    | "/careers"
    | "/changelog"
    | "/connectors"
    | "/cookies"
    | "/docs"
    | "/press"
    | "/pricing"
    | "/privacy"
    | "/roadmap"
    | "/status"
    | "/templates"
    | "/terms";
  hash?: string;
};

const links: Record<string, FooterLink[]> = {
  Product: [
    { label: "Features", to: "/" as const, hash: "features" },
    { label: "Pricing", to: "/pricing" as const },
    { label: "Templates", to: "/templates" as const },
    { label: "Changelog", to: "/changelog" as const },
    { label: "Roadmap", to: "/roadmap" as const },
  ],
  Developers: [
    { label: "Documentation", to: "/docs" as const },
    { label: "API Reference", to: "/api-reference" as const },
    { label: "Connectors", to: "/connectors" as const },
    { label: "Status", to: "/status" as const },
  ],
  Company: [
    { label: "About", to: "/about" as const },
    { label: "Blog", to: "/blog" as const },
    { label: "Careers", to: "/careers" as const },
    { label: "Press", to: "/press" as const },
  ],
  Legal: [
    { label: "Privacy Policy", to: "/privacy" as const },
    { label: "Terms of Service", to: "/terms" as const },
    { label: "Cookie Policy", to: "/cookies" as const },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/20 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              LifemarkAI
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              Build full-stack apps with AI. No code required.
            </p>
            <div className="flex gap-3">
              <a href="https://github.com/lifemarkai" target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-accent transition-colors">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://twitter.com/lifemarkai" target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-accent transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-semibold text-sm mb-4">{category}</h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      hash={item.hash}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-border gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} LifemarkAI. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Built with ❤️ using LifemarkAI
          </p>
        </div>
      </div>
    </footer>
  );
}
