"use client";

/**
 * ConnectorWizardPanel
 * One-click third-party integration setup.
 * Shows a grid of popular services; clicking one opens a detail drawer with:
 *  - Required environment variables (with copy buttons)
 *  - Step-by-step setup guide
 *  - "Apply to project" button → fires AI chat with the integration prompt
 */

import { useState } from "react";
import {
  Plug, ArrowLeft, Copy, Check, ExternalLink,
  Zap, Search, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ── Connector definitions ────────────────────────────────────────────────────

interface EnvVar {
  key: string;
  description: string;
  example?: string;
}

interface Connector {
  id: string;
  name: string;
  description: string;
  category: "payments" | "database" | "analytics" | "Analytics" | "communication" | "Communication" | "storage" | "auth" | "ecommerce" | "crm" | "devtools" | "AI" | "Finance" | "Project Management";
  icon: string;          // emoji or URL
  color: string;         // Tailwind bg class
  docsUrl: string;
  envVars: EnvVar[];
  setupSteps: string[];
  integrationPrompt: string;
  npm?: string[];        // packages to install
}

const CONNECTORS: Connector[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept payments, subscriptions, and invoices",
    category: "payments",
    icon: "💳",
    color: "bg-[#635BFF]/10 border-[#635BFF]/20",
    docsUrl: "https://stripe.com/docs",
    npm: ["stripe", "@stripe/stripe-js"],
    envVars: [
      { key: "STRIPE_SECRET_KEY", description: "Stripe secret key (server-side)", example: "sk_live_..." },
      { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", description: "Stripe publishable key (client-side)", example: "pk_live_..." },
      { key: "STRIPE_WEBHOOK_SECRET", description: "Webhook signing secret", example: "whsec_..." },
    ],
    setupSteps: [
      "Create a Stripe account at stripe.com",
      "Go to Developers → API keys to get your keys",
      "Add the env vars to your project's .env file",
      "Click 'Apply to project' to add Stripe integration",
    ],
    integrationPrompt: "Add a complete Stripe payment integration to this app. Install stripe and @stripe/stripe-js. Create a checkout session API route at /api/checkout that accepts { priceId, successUrl, cancelUrl }. Add a Stripe webhook handler at /api/webhooks/stripe that verifies the signature and handles checkout.session.completed and customer.subscription.updated events. Add a pricing page with monthly and yearly toggle. Use the STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and STRIPE_WEBHOOK_SECRET env vars.",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect to a Shopify storefront for products and orders",
    category: "ecommerce",
    icon: "🛍️",
    color: "bg-[#96BF48]/10 border-[#96BF48]/20",
    docsUrl: "https://shopify.dev/docs/api/storefront",
    npm: ["@shopify/hydrogen-react"],
    envVars: [
      { key: "SHOPIFY_STORE_DOMAIN", description: "Your Shopify store domain", example: "mystore.myshopify.com" },
      { key: "SHOPIFY_STOREFRONT_ACCESS_TOKEN", description: "Storefront API access token", example: "shpat_..." },
    ],
    setupSteps: [
      "In Shopify admin, go to Apps → develop apps",
      "Create a custom app and enable Storefront API access",
      "Copy the Storefront API access token",
      "Click 'Apply to project' to add Shopify integration",
    ],
    integrationPrompt: "Integrate the Shopify Storefront API into this app. Use the SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN env vars. Create a lib/shopify.ts client that queries the Storefront GraphQL API. Add functions to: fetch all products, fetch a single product by handle, fetch collections. Add a /products page showing a product grid with images, prices, and 'Add to cart' buttons. Implement a cart context with add/remove/update quantity. Add a cart sidebar that slides in.",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Read and write data from Airtable bases",
    category: "database",
    icon: "📊",
    color: "bg-[#FFBF00]/10 border-[#FFBF00]/20",
    docsUrl: "https://airtable.com/developers/web/api/introduction",
    npm: ["airtable"],
    envVars: [
      { key: "AIRTABLE_API_KEY", description: "Airtable personal access token", example: "pat..." },
      { key: "AIRTABLE_BASE_ID", description: "The base ID (appXXXXX)", example: "appXXXXXXXXXXXXXX" },
    ],
    setupSteps: [
      "Go to airtable.com/create/tokens to create a token",
      "Grant read/write access to your base",
      "Copy the Base ID from the API docs page",
      "Click 'Apply to project' to add Airtable integration",
    ],
    integrationPrompt: "Integrate Airtable into this app using the official airtable npm package. Use AIRTABLE_API_KEY and AIRTABLE_BASE_ID env vars. Create a lib/airtable.ts client. Add API routes: GET /api/airtable/records to fetch all records from the first table, POST /api/airtable/records to create a new record, PATCH /api/airtable/records/[id] to update a record. Add a simple CRUD UI page that lists records in a table and allows adding/editing/deleting rows.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Sync contacts, deals, and CRM events with HubSpot",
    category: "crm",
    icon: "🧡",
    color: "bg-[#FF7A59]/10 border-[#FF7A59]/20",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
    npm: ["@hubspot/api-client"],
    envVars: [
      { key: "HUBSPOT_ACCESS_TOKEN", description: "HubSpot private app access token", example: "pat-na1-..." },
      { key: "HUBSPOT_PORTAL_ID", description: "HubSpot portal (account) ID", example: "12345678" },
    ],
    setupSteps: [
      "In HubSpot, go to Settings → Integrations → Private Apps",
      "Create a private app with crm.objects.contacts read/write scopes",
      "Copy the access token and your portal ID",
      "Click 'Apply to project' to add HubSpot CRM integration",
    ],
    integrationPrompt: "Integrate HubSpot CRM into this app. Install @hubspot/api-client. Use HUBSPOT_ACCESS_TOKEN and HUBSPOT_PORTAL_ID env vars. Create lib/hubspot.ts with a configured Client. Add API routes: GET /api/hubspot/contacts (list contacts), POST /api/hubspot/contacts (create contact with email, firstname, lastname), GET /api/hubspot/deals (list deals). Add a /crm page showing a contacts table with search and a form to add new contacts. Wire signup and lead-capture forms to create HubSpot contacts automatically. Handle rate limits gracefully with retry.",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages and notifications to Slack channels",
    category: "communication",
    icon: "💬",
    color: "bg-[#4A154B]/10 border-[#4A154B]/20",
    docsUrl: "https://api.slack.com/messaging/sending",
    npm: ["@slack/web-api"],
    envVars: [
      { key: "SLACK_BOT_TOKEN", description: "Bot OAuth token", example: "xoxb-..." },
      { key: "SLACK_CHANNEL_ID", description: "Default channel to post to", example: "C0XXXXXX" },
    ],
    setupSteps: [
      "Go to api.slack.com/apps and create a new app",
      "Add the chat:write bot permission and install to workspace",
      "Copy the Bot User OAuth Token",
      "Click 'Apply to project' to add Slack integration",
    ],
    integrationPrompt: "Integrate Slack into this app. Install @slack/web-api. Use SLACK_BOT_TOKEN and SLACK_CHANNEL_ID env vars. Create a lib/slack.ts helper with a sendMessage(text, channel?) function. Add a POST /api/notify/slack route that accepts { message, channel? } and sends a Slack message. Wire Slack notifications into key app events (e.g. new user signup, form submission, order placed). Add rich Block Kit message formatting with action buttons where appropriate.",
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics, session recording, and feature flags",
    category: "analytics",
    icon: "📈",
    color: "bg-[#F54E00]/10 border-[#F54E00]/20",
    docsUrl: "https://posthog.com/docs",
    npm: ["posthog-js", "posthog-node"],
    envVars: [
      { key: "NEXT_PUBLIC_POSTHOG_KEY", description: "PostHog project API key", example: "phc_..." },
      { key: "NEXT_PUBLIC_POSTHOG_HOST", description: "PostHog host (default: https://app.posthog.com)", example: "https://app.posthog.com" },
    ],
    setupSteps: [
      "Sign up at posthog.com and create a project",
      "Copy the API key from Project Settings",
      "Click 'Apply to project' to add PostHog analytics",
    ],
    integrationPrompt: "Integrate PostHog analytics into this app. Install posthog-js. Use NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST env vars. Create a PostHog provider component that wraps the app and initializes PostHog on the client. Auto-capture pageviews on route changes. Add event tracking for key user actions: button clicks, form submissions, feature usage. Add a useFeatureFlag hook for server-side feature flags using posthog-node. Do not track any PII.",
  },
  {
    id: "resend",
    name: "Resend",
    description: "Send transactional emails with React templates",
    category: "communication",
    icon: "📧",
    color: "bg-[#000000]/10 border-[#000000]/20",
    docsUrl: "https://resend.com/docs",
    npm: ["resend", "@react-email/components"],
    envVars: [
      { key: "RESEND_API_KEY", description: "Resend API key", example: "re_..." },
      { key: "EMAIL_FROM", description: "Sender email address", example: "noreply@yourdomain.com" },
    ],
    setupSteps: [
      "Sign up at resend.com and add your domain",
      "Go to API Keys and create a new key",
      "Add the key and your from address to env vars",
      "Click 'Apply to project' to add email integration",
    ],
    integrationPrompt: "Integrate Resend email sending into this app. Install resend and @react-email/components. Use RESEND_API_KEY and EMAIL_FROM env vars. Create a lib/email.ts client. Build React email templates in emails/ folder: WelcomeEmail, NotificationEmail, and PasswordResetEmail components. Add API routes: POST /api/email/welcome, POST /api/email/notification. Wire welcome emails into user registration flow. Add an email preview page at /email-preview to view templates during development.",
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    description: "Image and video upload, transform, and delivery CDN",
    category: "storage",
    icon: "🖼️",
    color: "bg-[#3448C5]/10 border-[#3448C5]/20",
    docsUrl: "https://cloudinary.com/documentation",
    npm: ["cloudinary", "next-cloudinary"],
    envVars: [
      { key: "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", description: "Your Cloudinary cloud name", example: "mycloud" },
      { key: "CLOUDINARY_API_KEY", description: "Cloudinary API key", example: "123456789..." },
      { key: "CLOUDINARY_API_SECRET", description: "Cloudinary API secret", example: "abc123..." },
    ],
    setupSteps: [
      "Sign up at cloudinary.com",
      "Go to Settings → Access keys to get your credentials",
      "Click 'Apply to project' to add Cloudinary integration",
    ],
    integrationPrompt: "Integrate Cloudinary image/video management into this app. Install cloudinary and next-cloudinary. Use NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET env vars. Add a CldUploadWidget component for drag-and-drop image uploads. Add a CldImage component that replaces next/image for optimized delivery. Create a POST /api/upload/signature route to generate signed upload presets. Add an image gallery page that shows uploaded images in a masonry grid with lazy loading.",
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "SMS, WhatsApp, and voice communication",
    category: "communication",
    icon: "📱",
    color: "bg-[#F22F46]/10 border-[#F22F46]/20",
    docsUrl: "https://www.twilio.com/docs",
    npm: ["twilio"],
    envVars: [
      { key: "TWILIO_ACCOUNT_SID", description: "Twilio Account SID", example: "ACxxxxxxxx" },
      { key: "TWILIO_AUTH_TOKEN", description: "Twilio Auth Token", example: "xxxxxxxx" },
      { key: "TWILIO_PHONE_NUMBER", description: "Your Twilio phone number", example: "+1234567890" },
    ],
    setupSteps: [
      "Sign up at twilio.com and verify your phone",
      "Go to Console to get Account SID and Auth Token",
      "Get or purchase a Twilio phone number",
      "Click 'Apply to project' to add SMS integration",
    ],
    integrationPrompt: "Integrate Twilio SMS messaging into this app. Install twilio. Use TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER env vars. Create a lib/twilio.ts client. Add a POST /api/sms/send route that accepts { to, message } and sends an SMS. Add a POST /api/sms/webhook route that handles incoming SMS replies. Add a phone verification flow: user enters phone → receives OTP code → verifies it. Wire SMS notifications into key app events.",
  },
  {
    id: "firebase",
    name: "Firebase",
    description: "Realtime database, auth, and cloud functions",
    category: "database",
    icon: "🔥",
    color: "bg-[#FFCA28]/10 border-[#FFCA28]/20",
    docsUrl: "https://firebase.google.com/docs",
    npm: ["firebase", "firebase-admin"],
    envVars: [
      { key: "NEXT_PUBLIC_FIREBASE_API_KEY", description: "Firebase API key", example: "AIzaSy..." },
      { key: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", description: "Firebase project ID", example: "my-project" },
      { key: "NEXT_PUBLIC_FIREBASE_APP_ID", description: "Firebase app ID", example: "1:xxx:web:xxx" },
      { key: "FIREBASE_ADMIN_PRIVATE_KEY", description: "Admin SDK private key (server)", example: "-----BEGIN PRIVATE KEY-----..." },
      { key: "FIREBASE_ADMIN_CLIENT_EMAIL", description: "Admin SDK client email", example: "firebase-adminsdk@...gserviceaccount.com" },
    ],
    setupSteps: [
      "Create a project at console.firebase.google.com",
      "Add a web app to get the client config",
      "Go to Project Settings → Service accounts for admin credentials",
      "Click 'Apply to project' to add Firebase integration",
    ],
    integrationPrompt: "Integrate Firebase into this app. Install firebase and firebase-admin. Use the NEXT_PUBLIC_FIREBASE_* env vars for client and FIREBASE_ADMIN_* for server. Create lib/firebase/client.ts (initializeApp with client config) and lib/firebase/admin.ts (initializeApp with admin SDK). Add Firestore CRUD helpers. Add Firebase Auth with email/password and Google sign-in. Add real-time data listening with onSnapshot. Create example pages showing real-time data updates.",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, embeddings, image generation, and speech",
    category: "devtools",
    icon: "🤖",
    color: "bg-[#10A37F]/10 border-[#10A37F]/20",
    docsUrl: "https://platform.openai.com/docs",
    npm: ["openai"],
    envVars: [
      { key: "OPENAI_API_KEY", description: "OpenAI API key", example: "sk-..." },
    ],
    setupSteps: [
      "Sign up at platform.openai.com",
      "Go to API Keys and create a new secret key",
      "Click 'Apply to project' to add OpenAI integration",
    ],
    integrationPrompt: "Integrate OpenAI into this app. Install the openai package. Use the OPENAI_API_KEY env var. Create a lib/openai.ts client. Add a POST /api/ai/chat route that accepts { messages } and streams a GPT-4o response using Server-Sent Events. Add a POST /api/ai/embed route for text embeddings (for semantic search). Add an AI chat UI component with a message list, streaming text, and a textarea input. Handle errors gracefully with user-friendly messages.",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write pages and databases in Notion",
    category: "devtools",
    icon: "📝",
    color: "bg-[#000000]/10 border-[#000000]/20",
    docsUrl: "https://developers.notion.com",
    npm: ["@notionhq/client"],
    envVars: [
      { key: "NOTION_API_KEY", description: "Notion integration secret", example: "secret_..." },
      { key: "NOTION_DATABASE_ID", description: "Notion database ID", example: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
    setupSteps: [
      "Go to notion.so/my-integrations and create an integration",
      "Share the database with your integration",
      "Copy the database ID from the database URL",
      "Click 'Apply to project' to add Notion integration",
    ],
    integrationPrompt: "Integrate the Notion API into this app. Install @notionhq/client. Use NOTION_API_KEY and NOTION_DATABASE_ID env vars. Create a lib/notion.ts client. Add API routes: GET /api/notion/pages to list database pages, GET /api/notion/pages/[id] to get a full page with content, POST /api/notion/pages to create a new page. Render Notion blocks (paragraphs, headings, bullet lists, code blocks, images) as React components. Add a simple CMS-style blog using Notion as the backend.",
  },
  {
    id: "mapbox",
    name: "Mapbox",
    description: "Interactive maps, geocoding, and routing",
    category: "devtools",
    icon: "🗺️",
    color: "bg-[#4264FB]/10 border-[#4264FB]/20",
    docsUrl: "https://docs.mapbox.com",
    npm: ["mapbox-gl", "react-map-gl"],
    envVars: [
      { key: "NEXT_PUBLIC_MAPBOX_TOKEN", description: "Mapbox public access token", example: "pk.eyJ1..." },
    ],
    setupSteps: [
      "Sign up at mapbox.com",
      "Go to Account → Tokens to get your public token",
      "Click 'Apply to project' to add Mapbox integration",
    ],
    integrationPrompt: "Integrate Mapbox interactive maps into this app. Install mapbox-gl and react-map-gl. Use NEXT_PUBLIC_MAPBOX_TOKEN env var. Create a Map component using react-map-gl that renders a full-screen interactive map. Add custom markers with popups. Add a geocoding search bar that lets users search for locations. Add clustering for multiple markers. Add layer controls for switching between map styles (streets, satellite, light, dark). Make the map responsive.",
  },

  // ── Auth connectors ──────────────────────────────────────────────────────

  {
    id: "sentry",
    name: "Sentry",
    description: "Error tracking, performance monitoring, and session replay",
    category: "devtools",
    icon: "🔍",
    color: "bg-[#362D59]/10 border-[#362D59]/20",
    docsUrl: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
    npm: ["@sentry/nextjs"],
    envVars: [
      { key: "NEXT_PUBLIC_SENTRY_DSN", description: "Your Sentry DSN URL", example: "https://xxx@oyyy.ingest.sentry.io/zzz" },
      { key: "SENTRY_ORG", description: "Sentry organization slug", example: "my-org" },
      { key: "SENTRY_PROJECT", description: "Sentry project slug", example: "my-project" },
      { key: "SENTRY_AUTH_TOKEN", description: "Auth token for source map uploads", example: "sntrys_xxx" },
    ],
    setupSteps: [
      "Create a project at sentry.io",
      "Go to Settings → Projects → Your Project → Client Keys to get DSN",
      "Create an auth token at sentry.io/settings/auth-tokens/",
      "Click 'Apply to project' to add Sentry error tracking",
    ],
    integrationPrompt: "Integrate Sentry error monitoring into this Next.js app. Install @sentry/nextjs. Use NEXT_PUBLIC_SENTRY_DSN as the DSN. Run the Sentry wizard config (create sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts, and instrument.ts). Wrap the root layout with Sentry.ErrorBoundary. Add withSentryConfig to next.config.js for source maps. Capture custom events with Sentry.captureException() in API error handlers and key try/catch blocks. Add performance tracing for API routes and page loads.",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "AI voice synthesis, text-to-speech, and voice cloning",
    category: "communication",
    icon: "🎙️",
    color: "bg-[#111827]/10 border-[#6B7280]/20",
    docsUrl: "https://elevenlabs.io/docs/introduction",
    npm: ["elevenlabs"],
    envVars: [
      { key: "ELEVENLABS_API_KEY", description: "Your ElevenLabs API key", example: "xi_xxxxxxxxxxxxxxxx" },
    ],
    setupSteps: [
      "Sign up at elevenlabs.io",
      "Go to Profile → API Keys to generate a key",
      "Browse available voices at elevenlabs.io/voice-library",
      "Click 'Apply to project' to add voice synthesis",
    ],
    integrationPrompt: "Integrate ElevenLabs text-to-speech into this app. Install the elevenlabs SDK. Use ELEVENLABS_API_KEY. Create a lib/elevenlabs.ts client. Add a POST /api/tts route that accepts { text, voiceId } and streams back audio (use ElevenLabs streaming API, return audio/mpeg). On the frontend, add a speak() utility that calls the API and plays audio via the Web Audio API. Add a voice selector component that fetches available voices from /api/tts/voices. Use the Rachel voice (21m00Tcm4TlvDq8ikWAM) as default.",
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Web analytics, user behavior tracking, and conversion funnels",
    category: "analytics",
    icon: "📊",
    color: "bg-[#E37400]/10 border-[#E37400]/20",
    docsUrl: "https://developers.google.com/analytics/devguides/collection/ga4",
    npm: [],
    envVars: [
      { key: "NEXT_PUBLIC_GA_MEASUREMENT_ID", description: "GA4 Measurement ID", example: "G-XXXXXXXXXX" },
    ],
    setupSteps: [
      "Create a GA4 property at analytics.google.com",
      "Go to Admin → Data Streams → your stream to get the Measurement ID",
      "Click 'Apply to project' to add Google Analytics",
    ],
    integrationPrompt: "Integrate Google Analytics 4 into this Next.js app. Use NEXT_PUBLIC_GA_MEASUREMENT_ID. Add the GA4 script tag to the root layout using next/script with strategy='afterInteractive'. Create a lib/gtag.ts utility with pageview() and event() helper functions. Add a NavigationEvents component that listens to router events and calls gtag.pageview() on each route change. Add custom event tracking for key user actions: sign-ups, purchases, feature usage. Use the Measurement Protocol for server-side event tracking in API routes.",
  },
  {
    id: "google-oauth",
    name: "Google OAuth",
    description: "Sign in with Google for your app's users",
    category: "auth",
    icon: "🔵",
    color: "bg-[#4285F4]/10 border-[#4285F4]/20",
    docsUrl: "https://developers.google.com/identity/protocols/oauth2",
    npm: ["next-auth", "@auth/supabase-adapter"],
    envVars: [
      { key: "GOOGLE_CLIENT_ID", description: "Google OAuth 2.0 Client ID", example: "123456789-abc.apps.googleusercontent.com" },
      { key: "GOOGLE_CLIENT_SECRET", description: "Google OAuth 2.0 Client Secret", example: "GOCSPX-..." },
      { key: "NEXTAUTH_SECRET", description: "Random secret for NextAuth session encryption", example: "openssl rand -base64 32" },
      { key: "NEXTAUTH_URL", description: "Canonical URL of your app", example: "https://myapp.com" },
    ],
    setupSteps: [
      "Go to console.cloud.google.com → APIs & Services → Credentials",
      "Create an OAuth 2.0 Client ID (Web application)",
      "Add your domain to Authorised JavaScript origins",
      "Add <domain>/api/auth/callback/google to Authorised redirect URIs",
      "Copy Client ID and Client Secret into your env",
      "Click 'Apply to project' to scaffold the full auth flow",
    ],
    integrationPrompt: "Add Google OAuth sign-in to this app using NextAuth.js. Install next-auth. Create app/api/auth/[...nextauth]/route.ts with the Google provider using GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, and NEXTAUTH_URL env vars. Wrap the root layout with a SessionProvider. Create a SignInButton component that calls signIn('google') and shows the user's avatar + name when signed in (using useSession). Add a /api/auth/session route. Protect any dashboard routes with getServerSession. Show a Google-branded 'Sign in with Google' button styled to Google's branding guidelines on the login page.",
  },
  {
    id: "apple-signin",
    name: "Apple Sign-In",
    description: "Sign in with Apple — required for iOS App Store apps",
    category: "auth",
    icon: "🍎",
    color: "bg-zinc-800/20 border-zinc-600/20",
    docsUrl: "https://developer.apple.com/sign-in-with-apple/",
    npm: ["next-auth", "apple-signin-auth"],
    envVars: [
      { key: "APPLE_ID", description: "Apple Services ID (reverse-domain, e.g. com.myapp.web)", example: "com.myapp.web" },
      { key: "APPLE_TEAM_ID", description: "Apple Developer Team ID (10-char)", example: "ABCDE12345" },
      { key: "APPLE_KEY_ID", description: "Key ID for the Sign in with Apple key", example: "FGHIJ67890" },
      { key: "APPLE_PRIVATE_KEY", description: "Contents of the .p8 private key file", example: "-----BEGIN PRIVATE KEY-----\n..." },
      { key: "NEXTAUTH_SECRET", description: "Random secret for NextAuth session encryption", example: "openssl rand -base64 32" },
    ],
    setupSteps: [
      "In Apple Developer → Certificates, create a Services ID with Sign in with Apple enabled",
      "Create a Sign in with Apple key and download the .p8 file",
      "Add your domain and return URL (<domain>/api/auth/callback/apple) in the Services ID config",
      "Copy Team ID, Key ID, Services ID, and paste the .p8 key contents into env",
      "Click 'Apply to project' to scaffold the auth flow",
    ],
    integrationPrompt: "Add Sign in with Apple to this app using NextAuth.js. Install next-auth. Create app/api/auth/[...nextauth]/route.ts with the Apple provider. Use APPLE_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY (the .p8 key content, newlines as \\n) env vars. Handle the Apple-specific form_post response_mode by adding the POST handler. Wrap the root layout with SessionProvider. Create a Sign in with Apple button styled to Apple's HIG guidelines (black background, white Apple logo, SF Pro font). Add session-based route protection for dashboard pages.",
  },
  {
    id: "auth0",
    name: "Auth0",
    description: "Enterprise-grade auth with MFA, SSO, and social login",
    category: "auth",
    icon: "🔒",
    color: "bg-[#EB5424]/10 border-[#EB5424]/20",
    docsUrl: "https://auth0.com/docs/quickstart/webapp/nextjs",
    npm: ["@auth0/nextjs-auth0"],
    envVars: [
      { key: "AUTH0_SECRET", description: "Long random secret (openssl rand -hex 32)", example: "abc123..." },
      { key: "AUTH0_BASE_URL", description: "Your app's base URL", example: "https://myapp.com" },
      { key: "AUTH0_ISSUER_BASE_URL", description: "Your Auth0 domain", example: "https://myapp.us.auth0.com" },
      { key: "AUTH0_CLIENT_ID", description: "Auth0 application Client ID", example: "aBcDeFgHiJ..." },
      { key: "AUTH0_CLIENT_SECRET", description: "Auth0 application Client Secret", example: "XyZ123..." },
    ],
    setupSteps: [
      "Create an account at auth0.com and create a new Application (Regular Web App)",
      "Set Allowed Callback URLs to <domain>/api/auth/callback",
      "Set Allowed Logout URLs to <domain>",
      "Copy Domain, Client ID, and Client Secret from the application settings",
      "Generate AUTH0_SECRET with: openssl rand -hex 32",
      "Click 'Apply to project' to add the full Auth0 integration",
    ],
    integrationPrompt: "Integrate Auth0 authentication into this Next.js app. Install @auth0/nextjs-auth0. Create app/api/auth/[auth0]/route.ts that exports the handleAuth() handler. Use AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET env vars. Wrap the root layout with UserProvider. Create a LoginButton component (calls /api/auth/login), LogoutButton (/api/auth/logout), and a UserProfile component that shows avatar + name using useUser(). Add withPageAuthRequired to protect server-rendered dashboard pages. Add withApiAuthRequired to protect API routes. Show a polished login page with Auth0-hosted Universal Login redirect.",
  },
  {
    id: "nextauth",
    name: "NextAuth.js",
    description: "Flexible open-source auth for Next.js with any provider",
    category: "auth",
    icon: "🔐",
    color: "bg-violet-500/10 border-violet-500/20",
    docsUrl: "https://next-auth.js.org/getting-started/introduction",
    npm: ["next-auth"],
    envVars: [
      { key: "NEXTAUTH_SECRET", description: "Random secret (openssl rand -base64 32)", example: "abc123..." },
      { key: "NEXTAUTH_URL", description: "Canonical URL of your app", example: "https://myapp.com" },
      { key: "GITHUB_ID", description: "GitHub OAuth App Client ID (optional)", example: "Ov23li..." },
      { key: "GITHUB_SECRET", description: "GitHub OAuth App Client Secret (optional)", example: "abc123..." },
    ],
    setupSteps: [
      "Install next-auth in your project",
      "Create app/api/auth/[...nextauth]/route.ts",
      "Configure providers (GitHub, Google, credentials, etc.)",
      "Add NEXTAUTH_SECRET (required) and NEXTAUTH_URL to env",
      "Click 'Apply to project' for a full multi-provider setup",
    ],
    integrationPrompt: "Add a complete NextAuth.js authentication system to this app. Install next-auth. Create app/api/auth/[...nextauth]/route.ts with: GitHub OAuth provider (GITHUB_ID, GITHUB_SECRET), Google OAuth provider (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET), and Credentials provider with email/password. Use NEXTAUTH_SECRET and NEXTAUTH_URL env vars. Add a Prisma or Supabase adapter for persistent sessions. Wrap the root layout in SessionProvider. Create a unified sign-in page at /login with tabs for each provider, styled with provider brand colors. Add useSession hook usage in the navbar to show user avatar + dropdown with Sign Out. Protect /dashboard and all sub-routes with middleware using withAuth.",
  },
  {
    id: "saml-sso",
    name: "SAML / Enterprise SSO",
    description: "Enterprise single sign-on via SAML 2.0 — Okta, Azure AD, Google Workspace",
    category: "auth",
    icon: "🏢",
    color: "bg-blue-500/10 border-blue-500/20",
    docsUrl: "https://boxyhq.com/docs/jackson/deploy/service",
    npm: ["@boxyhq/saml-jackson", "next-auth"],
    envVars: [
      { key: "NEXTAUTH_SECRET",   description: "Random 32-byte secret",          example: "openssl rand -base64 32" },
      { key: "NEXTAUTH_URL",      description: "Canonical app URL",               example: "https://myapp.com" },
      { key: "JACKSON_URL",       description: "BoxyHQ Jackson service URL",      example: "https://sso.myapp.com" },
      { key: "JACKSON_API_KEY",   description: "Jackson admin API key",           example: "secret_abc123" },
      { key: "SAML_AUDIENCE",     description: "SP Entity ID (usually app URL)",  example: "https://myapp.com" },
      { key: "SAML_ACS_URL",      description: "Assertion Consumer Service URL",  example: "https://myapp.com/api/auth/callback/saml-jackson" },
    ],
    setupSteps: [
      "Deploy BoxyHQ Jackson (Docker: ghcr.io/boxyhq/jackson) or use BoxyHQ Cloud",
      "Add JACKSON_URL and JACKSON_API_KEY to your environment",
      "Configure your IdP (Okta / Azure AD / Google Workspace) with the SP Entity ID and ACS URL",
      "Upload your IdP metadata XML to Jackson via its admin UI",
      "Click 'Apply to project' to scaffold the NextAuth SAML provider",
    ],
    integrationPrompt: "Add SAML 2.0 enterprise SSO to this Next.js app using BoxyHQ Jackson. Install @boxyhq/saml-jackson and next-auth. Create app/api/auth/[...nextauth]/route.ts with the BoxyHQ SAML Jackson provider. Configure the provider with JACKSON_URL and JACKSON_API_KEY env vars. Use NEXTAUTH_SECRET and NEXTAUTH_URL. Add a lib/jackson.ts helper that initialises the Jackson client for server-side tenant management. Create an /api/auth/saml/metadata route that returns the SP metadata XML so admins can configure their IdP. Create a POST /api/auth/saml/config route that accepts { tenant, product, rawMetadata } and registers a new SAML connection. Build a polished enterprise login page at /login/sso with a 'Sign in with SSO' button and a tenant domain input. Add a SAML configuration admin page at /settings/saml where workspace owners can upload IdP metadata XML and see configured SSO tenants.",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    description: "Product analytics — track user behaviour, funnels, and retention",
    category: "Analytics",
    icon: "📈",
    color: "bg-blue-500/10 border-blue-500/20",
    docsUrl: "https://www.docs.developers.amplitude.com/",
    npm: ["@amplitude/analytics-browser", "@amplitude/analytics-node"],
    envVars: [
      { key: "NEXT_PUBLIC_AMPLITUDE_API_KEY", description: "Amplitude project API key", example: "abc123def456..." },
    ],
    setupSteps: [
      "Create a project at app.amplitude.com",
      "Copy the API key from Settings → Projects",
      "Click 'Apply to project' to add Amplitude analytics",
    ],
    integrationPrompt: "Integrate Amplitude analytics into this app. Install @amplitude/analytics-browser. Use NEXT_PUBLIC_AMPLITUDE_API_KEY. Create a lib/amplitude.ts that exports init() and track(eventName, properties?) helpers. Add an AmplitudeProvider client component that calls init() once. Wrap the root layout with it. Auto-track pageviews using usePathname. Track key user events (button clicks, form submissions, feature usage) via track(). Add a useAmplitude() hook that exposes track so any component can emit events easily.",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Project management — create issues, update statuses, query cycles",
    category: "Project Management",
    icon: "🎯",
    color: "bg-indigo-500/10 border-indigo-500/20",
    docsUrl: "https://developers.linear.app/docs",
    npm: ["@linear/sdk"],
    envVars: [
      { key: "LINEAR_API_KEY", description: "Linear personal API key", example: "lin_api_..." },
    ],
    setupSteps: [
      "Go to Linear → Settings → API → Personal API Keys",
      "Create a key with Issues read/write scope",
      "Click 'Apply to project' to integrate Linear",
    ],
    integrationPrompt: "Integrate Linear into this app using @linear/sdk. Use LINEAR_API_KEY. Create a lib/linear.ts server-side client. Add API routes: GET /api/linear/issues?teamId= to list issues, POST /api/linear/issues to create an issue (title, description, priority), PATCH /api/linear/issues/[id] to update status. Add a /linear-board page showing issues in a Kanban-style board by status (Todo / In Progress / Done). Support drag-and-drop to move issues between columns. Show issue priority badges and assignee avatars.",
  },
  {
    id: "plaid",
    name: "Plaid",
    description: "Banking & finance — connect bank accounts, transactions, balance data",
    category: "Finance",
    icon: "🏦",
    color: "bg-emerald-500/10 border-emerald-500/20",
    docsUrl: "https://plaid.com/docs/",
    npm: ["plaid"],
    envVars: [
      { key: "PLAID_CLIENT_ID", description: "Plaid client ID", example: "5f4d..." },
      { key: "PLAID_SECRET", description: "Plaid sandbox/production secret", example: "9d3b..." },
      { key: "PLAID_ENV", description: "sandbox, development, or production", example: "sandbox" },
    ],
    setupSteps: [
      "Create a Plaid account at dashboard.plaid.com",
      "Copy Client ID and Sandbox secret from Team → Keys",
      "Click 'Apply to project' for a full Plaid Link integration",
    ],
    integrationPrompt: "Integrate Plaid into this app using the official plaid Node SDK. Use PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV. Create a lib/plaid.ts server-side client. Add these API routes: POST /api/plaid/link-token to create a Link token, POST /api/plaid/exchange-token to exchange the public token for an access token (store in DB), GET /api/plaid/transactions?accessToken= to fetch the last 30 days of transactions. Add a /bank page with Plaid Link button that opens the Plaid Link UI. After linking, display transactions in a table with date, description, amount, and category columns. Add a balance card showing the current balance.",
  },
  {
    id: "semrush",
    name: "Semrush",
    description: "SEO research — keyword data, backlink analysis, competitor insights",
    category: "Analytics",
    icon: "🔍",
    color: "bg-orange-500/10 border-orange-500/20",
    docsUrl: "https://developer.semrush.com/api/",
    npm: ["semrush-api"],
    envVars: [
      { key: "SEMRUSH_API_KEY", description: "Semrush API key", example: "your-api-key" },
    ],
    setupSteps: [
      "Sign up at semrush.com and go to Profile → API",
      "Generate an API key",
      "Click 'Apply to project' to add SEO research",
    ],
    integrationPrompt: "Integrate the Semrush API into this app for SEO research. Use SEMRUSH_API_KEY. Create a lib/semrush.ts server client with functions: getKeywordData(keyword) fetches search volume + CPC + competition, getDomainOverview(domain) fetches organic traffic + backlinks + top keywords, getRelatedKeywords(keyword) returns 10 related terms. Add a /seo page with: a keyword research form that shows volume/CPC/difficulty in a table, a domain analysis form showing organic metrics, and a keyword suggestions panel. Cache results for 24 hours using Next.js unstable_cache.",
  },
  {
    id: "google-search-console",
    name: "Google Search Console",
    description: "Search analytics — impressions, clicks, CTR, average position for your pages",
    category: "Analytics",
    icon: "📊",
    color: "bg-green-500/10 border-green-500/20",
    docsUrl: "https://developers.google.com/webmaster-tools/v1/api_reference_index",
    npm: ["googleapis"],
    envVars: [
      { key: "GOOGLE_SERVICE_ACCOUNT_EMAIL", description: "Service account email", example: "name@project.iam.gserviceaccount.com" },
      { key: "GOOGLE_PRIVATE_KEY", description: "Service account private key (JSON escaped)", example: "-----BEGIN RSA PRIVATE KEY-----..." },
      { key: "GOOGLE_SITE_URL", description: "Verified site URL in Search Console", example: "https://yoursite.com" },
    ],
    setupSteps: [
      "Create a Google Cloud project and enable Search Console API",
      "Create a Service Account and download the JSON key",
      "Add the service account email to Search Console as an owner",
      "Click 'Apply to project' to add search analytics",
    ],
    integrationPrompt: "Integrate Google Search Console into this app using the googleapis npm package. Use GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SITE_URL. Create a lib/search-console.ts server client using google.auth.JWT. Add API routes: GET /api/seo/performance?days=28 returning clicks, impressions, CTR, and avgPosition per page, GET /api/seo/queries?limit=25 returning the top search queries. Add a /search-console page with a performance dashboard showing: a line chart of clicks + impressions over time using Recharts, a table of top pages ranked by clicks, and a table of top queries with their average position badges.",
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    description: "Send messages, receive commands, and build interactive Telegram bots",
    category: "Communication",
    icon: "✈️",
    color: "bg-sky-500/10 border-sky-500/20",
    docsUrl: "https://core.telegram.org/bots/api",
    npm: ["node-telegram-bot-api"],
    envVars: [
      { key: "TELEGRAM_BOT_TOKEN", description: "Bot token from @BotFather", example: "123456:ABC-DEF..." },
      { key: "TELEGRAM_CHAT_ID", description: "Default chat/channel ID to send messages to", example: "-1001234567890" },
    ],
    setupSteps: [
      "Open Telegram and message @BotFather with /newbot",
      "Copy the bot token you receive",
      "Click 'Apply to project' to add Telegram notifications",
    ],
    integrationPrompt: "Integrate a Telegram bot into this app using node-telegram-bot-api. Use TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Create a lib/telegram.ts helper with sendMessage(text, chatId?) and sendPhoto(url, caption?) functions. Add a POST /api/notify/telegram route that accepts { message, chatId? } and sends a Telegram message with Markdown formatting. Add a GET /api/telegram/webhook route to handle incoming bot commands (/start, /status, /help). Wire Telegram notifications to key app events (new signup, form submission, order placed). Add a /telegram-test page to send a test message and verify the connection.",
  },
  {
    id: "openai-plugin",
    name: "ChatGPT Actions",
    description: "Expose your app as a ChatGPT Action — let GPT-4 call your API endpoints",
    category: "AI",
    icon: "🤖",
    color: "bg-violet-500/10 border-violet-500/20",
    docsUrl: "https://platform.openai.com/docs/actions/introduction",
    npm: [],
    envVars: [
      { key: "OPENAI_ACTION_SECRET", description: "Secret to verify requests from ChatGPT", example: "secret_..." },
    ],
    setupSteps: [
      "Go to chat.openai.com → Explore → Create a GPT → Configure → Actions",
      "Point it at your app's /api/openai-plugin/openapi.json",
      "Click 'Apply to project' to scaffold the required endpoints",
    ],
    integrationPrompt: "Add ChatGPT Actions support to this app so GPT-4 can call it as a plugin. Create these files: public/.well-known/ai-plugin.json (plugin manifest with name, description, auth: { type: 'service_http' }), app/api/openai-plugin/openapi.json/route.ts (returns OpenAPI 3.0 spec describing 3-5 key API endpoints), a middleware check for the OPENAI_ACTION_SECRET header on /api/openai-plugin/* routes. Pick the 3 most useful read/write operations from the existing API and expose them in the spec. Add a /chatgpt-plugin page explaining how to connect the plugin with a code block showing the manifest URL and step-by-step instructions.",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  payments: "Payments",
  database: "Database",
  analytics: "Analytics",
  communication: "Communication",
  storage: "Storage",
  auth: "Auth",
  ecommerce: "E-commerce",
  devtools: "AI & Tools",
};

const CATEGORY_ORDER = ["payments", "ecommerce", "communication", "analytics", "database", "storage", "auth", "devtools"];

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-muted/60 transition-colors shrink-0" title="Copy">
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

function ConnectorDetail({ connector, onApply, onBack }: {
  connector: Connector;
  onApply: (prompt: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded hover:bg-muted/60 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <span className="text-xl">{connector.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{connector.name}</p>
          <p className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[connector.category]}</p>
        </div>
        <a href={connector.docsUrl} target="_blank" rel="noopener noreferrer"
          className="p-1 rounded hover:bg-muted/60 transition-colors" title="Open docs">
          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
        </a>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <p className="text-xs text-muted-foreground leading-relaxed">{connector.description}</p>

        {/* npm packages */}
        {connector.npm && connector.npm.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">npm packages</p>
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
              <code className="text-xs font-mono flex-1">npm install {connector.npm.join(" ")}</code>
              <CopyButton text={`npm install ${connector.npm.join(" ")}`} />
            </div>
          </div>
        )}

        {/* Environment variables */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required env vars</p>
          <div className="space-y-2">
            {connector.envVars.map((v) => (
              <div key={v.key} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <code className="text-[11px] font-mono font-semibold text-violet-400 flex-1">{v.key}</code>
                  <CopyButton text={v.key} />
                </div>
                <p className="text-[10px] text-muted-foreground">{v.description}</p>
                {v.example && (
                  <p className="text-[10px] text-muted-foreground/50 font-mono">{v.example}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Setup steps */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Setup steps</p>
          <ol className="space-y-2">
            {connector.setupSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded-full bg-violet-500/20 text-violet-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Apply button */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <Button
          className="w-full gap-2 bg-violet-600 hover:bg-violet-500"
          onClick={() => onApply(connector.integrationPrompt)}
        >
          <Zap className="w-3.5 h-3.5" />
          Apply {connector.name} to project
        </Button>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
          Opens chat and sends the integration instructions to AI
        </p>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ConnectorWizardPanelProps {
  onApplyConnector: (prompt: string) => void;
}

export function ConnectorWizardPanel({ onApplyConnector }: ConnectorWizardPanelProps) {
  const [selected, setSelected] = useState<Connector | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (selected) {
    return (
      <ConnectorDetail
        connector={selected}
        onApply={(prompt) => {
          onApplyConnector(prompt);
          setSelected(null);
        }}
        onBack={() => setSelected(null)}
      />
    );
  }

  const filtered = CONNECTORS.filter((c) => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !activeCategory || c.category === activeCategory;
    return matchSearch && matchCategory;
  });

  const grouped = CATEGORY_ORDER.reduce<Record<string, Connector[]>>((acc, cat) => {
    const items = filtered.filter((c) => c.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border space-y-3 shrink-0">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Connect services</span>
          <Badge variant="secondary" className="text-[10px] ml-auto">{CONNECTORS.length} integrations</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search integrations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
        </div>
        {/* Category filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              !activeCategory ? "border-violet-500/60 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {CATEGORY_ORDER.filter((cat) => CONNECTORS.some((c) => c.category === cat)).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                activeCategory === cat ? "border-violet-500/60 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Connector grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {Object.entries(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
            <Search className="w-6 h-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No integrations match your search</p>
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{CATEGORY_LABELS[cat]}</p>
              <div className="space-y-1">
                {items.map((connector) => (
                  <button
                    key={connector.id}
                    onClick={() => setSelected(connector)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border ${connector.color} hover:bg-muted/40 transition-colors text-left group`}
                  >
                    <span className="text-xl flex-shrink-0">{connector.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{connector.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{connector.description}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
