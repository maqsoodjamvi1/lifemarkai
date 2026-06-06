# LifemarkAI — Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
```bash
cp .env.local.example .env.local
```
Fill in all values in `.env.local`.

### 3. Set Up Supabase
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your Project URL and anon key into `.env.local`
3. Go to Supabase SQL Editor and run the migration:
   ```sql
   -- Copy and paste the contents of supabase/migrations/001_initial_schema.sql
   ```

### 4. Set Up OpenAI
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key and add to `OPENAI_API_KEY` in `.env.local`

### 5. Set Up Anthropic (Optional)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key and add to `ANTHROPIC_API_KEY`

### 6. Set Up GitHub OAuth (Optional)
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create a new OAuth App with callback: `http://localhost:3000/auth/callback`
3. Add Client ID and Secret to `.env.local`

### 7. Set Up Stripe (Optional)
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Get your publishable + secret keys
3. Create products for Pro, Business, Enterprise plans
4. Add price IDs to `.env.local`

### 8. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Architecture Notes

- **Framework**: Next.js 14 App Router
- **Auth**: Supabase Auth (email + OAuth)
- **Database**: Supabase PostgreSQL with RLS
- **AI**: Multi-model (OpenAI GPT-4o, Anthropic Claude)
- **Editor**: Monaco Editor (VS Code engine)
- **Payments**: Stripe (subscriptions + credits)
- **Deployment**: Vercel recommended

---

## Phase Progress

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Complete | Foundation (auth, DB, UI) |
| 2 | ✅ Complete | AI Chat + Code Generation |
| 3 | 🔄 Next | Agent Mode |
| 4 | ✅ Complete | Code Editor (Monaco) |
| 5 | 🔄 Next | Visual Edit Mode |
| 6 | 🔄 Next | GitHub Integration |
| 7 | ✅ Complete | Deployment Engine |
| 8 | 🔄 Next | Backend Integrations (Supabase wizard) |
| 9 | 🔄 Next | Real-time Collaboration |
| 10 | 🔄 Next | Voice + Image Generation |
| 11 | 🔄 Next | Credits + Stripe Billing |
| 12 | 🔄 Next | Template Marketplace |
| 13 | 🔄 Next | Analytics Dashboard |
| 14 | 🔄 Next | Enterprise (SSO, Audit logs) |

---

## File Structure

```
lifemarkai/
├── app/                    # Next.js App Router
│   ├── (marketing)/        # Landing page, pricing
│   ├── (auth)/             # Login, signup
│   ├── (dashboard)/        # Protected dashboard
│   ├── editor/[projectId]/ # Main editor
│   └── api/                # API routes
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── marketing/          # Landing page components
│   ├── dashboard/          # Dashboard components
│   ├── editor/             # Editor components
│   └── providers/          # React context providers
├── lib/
│   ├── ai/                 # AI provider + prompts
│   ├── supabase/           # DB client (browser + server)
│   └── utils.ts            # Utilities
├── types/
│   └── database.ts         # Full TypeScript DB types
├── hooks/                  # Custom React hooks
├── middleware.ts            # Auth middleware
└── supabase/
    └── migrations/         # SQL migration files
```
