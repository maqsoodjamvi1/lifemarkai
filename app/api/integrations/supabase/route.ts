// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, supabaseUrl, supabaseAnonKey, action } = await request.json();

    if (!projectId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (action === "validate") {
      // Try to connect to the Supabase project
      if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json({ error: "Missing Supabase credentials" }, { status: 400 });
      }

      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        });

        if (!res.ok) {
          return NextResponse.json({ valid: false, error: "Invalid credentials" });
        }

        return NextResponse.json({ valid: true });
      } catch {
        return NextResponse.json({ valid: false, error: "Could not reach Supabase URL" });
      }
    }

    if (action === "save") {
      // Save Supabase config as project metadata / env vars
      // In a real app, these would be stored encrypted
      const { error } = await (supabase as any)
        .from("projects")
        .update({
          metadata: {
            supabase_url: supabaseUrl,
            supabase_anon_key: supabaseAnonKey,
          },
        } as any)
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "generate_schema") {
      // Generate a Supabase schema based on the project's files
      const { data: files } = await (supabase as any)
        .from("project_files")
        .select("path, content")
        .eq("project_id", projectId)
        .limit(20);

      const fileContext = (files || [])
        .map((f) => `// ${f.path}\n${f.content?.slice(0, 500)}`)
        .join("\n\n");

      // Generate a simple SQL schema based on detected entities
      const schema = generateSchemaFromContext(fileContext);

      return NextResponse.json({ schema });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Supabase integration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function generateSchemaFromContext(context: string): string {
  // Detect common entity patterns
  const hasUser = /user|auth|profile/i.test(context);
  const hasProduct = /product|item|inventory/i.test(context);
  const hasOrder = /order|cart|checkout/i.test(context);
  const hasPost = /post|article|blog/i.test(context);
  const hasComment = /comment|reply|review/i.test(context);
  const hasMessage = /message|chat|conversation/i.test(context);

  const tables: string[] = [];

  if (hasUser) {
    tables.push(`-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);`);
  }

  if (hasPost) {
    tables.push(`-- Posts / Articles
CREATE TABLE IF NOT EXISTS posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  slug TEXT UNIQUE,
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published posts" ON posts
  FOR SELECT USING (published = TRUE);

CREATE POLICY "Users can manage their own posts" ON posts
  FOR ALL USING (auth.uid() = user_id);`);
  }

  if (hasComment) {
    tables.push(`-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments" ON comments
  FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage their own comments" ON comments
  FOR ALL USING (auth.uid() = user_id);`);
  }

  if (hasProduct) {
    tables.push(`-- Products
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  image_url TEXT,
  category TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active products" ON products
  FOR SELECT USING (active = TRUE);`);
  }

  if (hasOrder) {
    tables.push(`-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]',
  shipping_address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);`);
  }

  if (hasMessage) {
    tables.push(`-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id TEXT,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);`);
  }

  if (tables.length === 0) {
    tables.push(`-- Generic app schema
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own items" ON items
  FOR ALL USING (auth.uid() = user_id);`);
  }

  return `-- Auto-generated Supabase schema
-- Generated by LifemarkAI
-- Copy and run this in your Supabase SQL Editor

${tables.join("\n\n")}

-- Helpful function: Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;
}
