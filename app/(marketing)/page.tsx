import { Suspense } from "react";
// New Lovable-style landing — single component encapsulating Hero, How it
// works, Templates, Numbers, Ready-to-build. The old per-section components
// (HeroSection, FeaturesSection, etc.) are still in components/marketing/
// — re-import them here to roll back if needed.
import { LovableStyleLanding } from "@/components/marketing/lovable-style-landing";
import { Footer } from "@/components/marketing/footer";
import { Navbar } from "@/components/marketing/navbar";
import { BuildWithUrlHandler } from "@/components/marketing/build-with-url-handler";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Build with URL — intercepts ?autosubmit=true#prompt=... links */}
      <Suspense fallback={null}>
        <BuildWithUrlHandler />
      </Suspense>
      <Navbar />
      <main>
        <LovableStyleLanding />
      </main>
      <Footer />
    </div>
  );
}
