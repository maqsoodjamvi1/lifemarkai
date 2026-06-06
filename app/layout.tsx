import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LifemarkAI",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  title: {
    default: "LifemarkAI — Build Apps with AI",
    template: "%s | LifemarkAI",
  },
  description:
    "Build full-stack web applications from a single prompt. AI-powered app builder with Agent Mode, Visual Editing, real-time collaboration and one-click deployment.",
  keywords: [
    "AI app builder",
    "no-code",
    "vibe coding",
    "React",
    "Supabase",
    "GPT-4",
    "Claude",
    "web app generator",
  ],
  authors: [{ name: "LifemarkAI" }],
  creator: "LifemarkAI",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://lifemarkai.app",
    title: "LifemarkAI — Build Apps with AI",
    description: "Build full-stack web applications from a single prompt.",
    siteName: "LifemarkAI",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LifemarkAI — Build Apps with AI",
    description: "Build full-stack web applications from a single prompt.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <ServiceWorkerRegistrar />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <ConfirmDialogProvider>
              {children}
              <Toaster />
            </ConfirmDialogProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
