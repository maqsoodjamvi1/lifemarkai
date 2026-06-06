"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Explore", href: "/explore" },
  { label: "Templates", href: "/templates" },
  { label: "Pricing", href: "/pricing" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<object | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/80 backdrop-blur-xl border-b border-border shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            LifemarkAI
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions — always visible on all viewports. Sign in / Sign up
              are the highest-leverage CTAs on the marketing page; hiding
              them behind a hamburger on mobile destroys conversion. Only
              the lower-priority Try Demo + nav links collapse on small
              screens (handled by the mobile menu). */}
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/demo" className="hidden md:inline-flex">
              <Button variant="ghost" size="sm">
                Try Demo
              </Button>
            </Link>
            {user ? (
              <Button onClick={() => router.push("/dashboard")} size="sm">
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/login")}
                  // Ghost variant has no idle color; explicitly set foreground
                  // so the label is readable against the navbar's transparent
                  // header (before scroll) AND its bg-background/80 (after
                  // scroll). Without this, "Sign in" appears as invisible
                  // text on the marketing page's dark background.
                  className="text-xs sm:text-sm px-2 sm:px-3 text-foreground hover:text-foreground"
                >
                  Sign in
                </Button>
                <Button
                  size="sm"
                  onClick={() => router.push("/signup")}
                  className="bg-gradient-brand text-white hover:opacity-90 text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Start building — free</span>
                  <span className="sm:hidden">Sign up</span>
                </Button>
              </>
            )}
          </div>

          {/* Mobile hamburger — for navigation links only, not auth */}
          <button className="md:hidden p-2 ml-1" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border"
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-2 text-sm hover:bg-accent rounded-lg"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-2 space-y-2">
                <Link href="/demo" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full">Try Demo</Button>
                </Link>
                {/* Sign in / Sign up live in the top bar at all viewport sizes
                    (they're the highest-leverage CTAs). No need to duplicate
                    here — the top bar versions stay visible even when this
                    hamburger menu is open. */}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
