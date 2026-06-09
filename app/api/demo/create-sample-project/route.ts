// @ts-nocheck
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const SAMPLE_FILES = {
  "package.json": `{
  "name": "lifemarkai-demo",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.0.0"
  }
}`,

  "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LifemarkAI Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,

  "src/main.jsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,

  "src/App.jsx": `import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App`,

  "src/index.css": `body {
  margin: 0;
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}`,

  "src/App.css": `.App {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.card {
  padding: 2em;
}

button {
  background-color: #f9a8d4;
  color: black;
}

button:hover {
  background-color: #f368a0;
}`,

  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})`,
};

const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";

async function getOrCreateDemoUserId(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<string> {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    user_metadata: { name: "Demo User" },
    email_confirm: true,
  });

  if (!createError && created.user) {
    return created.user.id;
  }

  const alreadyExists =
    createError?.status === 422 ||
    createError?.message?.toLowerCase().includes("already");

  if (!alreadyExists) {
    throw createError ?? new Error("Failed to create demo user");
  }

  let page = 1;
  while (true) {
    const { data, error: listError } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (listError) throw listError;

    const existing = data.users.find((u) => u.email === DEMO_EMAIL);
    if (existing) return existing.id;

    if (data.users.length < 1000) break;
    page++;
  }

  throw new Error("Demo user exists but could not be found");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient();

    const userId = await getOrCreateDemoUserId(supabase);

    // Create a demo project
    const { data: project, error: projectError } = await (supabase as any)
      .from("projects")
      .insert({
        user_id: userId,
        name: "LifemarkAI Demo",
        description: "A sample React app to test the LifemarkAI editor and preview",
        framework: "react",
        status: "active",
        is_public: true,
      })
      .select()
      .single();

    if (projectError) {
      console.error("Error creating project:", projectError);
      return NextResponse.json(
        { error: "Failed to create project", details: projectError.message },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project creation returned no data" },
        { status: 500 }
      );
    }

    // Create sample files
    const files = Object.entries(SAMPLE_FILES).map(([path, content]) => ({
      project_id: project.id,
      path,
      content,
      language: getLanguage(path),
    }));

    const { error: filesError } = await (supabase as any)
      .from("project_files")
      .insert(files);

    if (filesError) {
      console.error("Error creating files:", filesError);
      return NextResponse.json(
        { error: "Failed to create project files", details: filesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Sample project created successfully",
      projectId: project.id,
      editorUrl: `/editor/${project.id}`,
      userId,
      demoCredentials: {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected error", details: String(error) },
      { status: 500 }
    );
  }
}

function getLanguage(path: string): string {
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".css")) return "css";
  return "text";
}
