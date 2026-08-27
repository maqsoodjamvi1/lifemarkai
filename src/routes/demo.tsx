import { useState } from "react";
import { createFileRoute,Link } from "@tanstack/react-router";
import { Code2,Zap,Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demo | LifemarkAI" },
      { name: "description", content: "Try LifemarkAI with a sample project" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  // "unavailable" is a DIFFERENT outcome from "failed", and conflating them is
  // what made this page dishonest. /api/demo/create-sample-project is gated to
  // development (or an explicit ALLOW_DEMO_ENDPOINT) because it provisions a
  // shared demo account with hardcoded credentials and a public project — that
  // gate is correct and must stay. In production it therefore returns 404.
  //
  // The old code treated that 404 the same as any other failure and silently
  // sent the visitor to /signup. So the marketing site advertised "Try Demo",
  // this page promised "Create a sample React project and explore the editor",
  // and the button quietly dropped them on a signup form with no explanation —
  // the exact moment a visitor decides the product is broken.
  //
  // Say what happened instead. The signup CTA is still right there; it is now
  // an offer rather than a redirect the visitor did not ask for.
  const [state, setState] = useState<"idle" | "starting" | "unavailable" | "failed">("idle");

  async function startDemo() {
    setState("starting");
    try {
      const res = await fetch("/api/demo/create-sample-project", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const id = data.projectId ?? data.id;
        if (id) {
          window.location.href = `/editor/${id}`;
          return;
        }
      }
      setState(res.status === 404 ? "unavailable" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/" className="text-violet-400 hover:text-violet-300 font-semibold">
          ← Back to Home
        </Link>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-8">
        <h1 className="text-5xl font-bold">
          Try LifemarkAI <span className="text-violet-400">Live</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Create a sample React project and explore the editor with live Modal preview.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
          {[
            { icon: Code2, title: "Monaco Editor", body: "Edit with syntax highlighting" },
            { icon: Eye, title: "Live Preview", body: "Modal sandbox preview" },
            { icon: Zap, title: "AI Chat", body: "Build with natural language" },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border p-6">
              <Icon className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground mt-2">{body}</p>
            </div>
          ))}
        </div>
        <Button size="lg" onClick={startDemo} disabled={state === "starting"}>
          {state === "starting" ? "Starting…" : "Launch demo project"}
        </Button>

        {state === "unavailable" ? (
          <div className="mx-auto max-w-md rounded-lg border border-border p-6 text-left">
            <p className="font-semibold">The live demo isn&apos;t running right now.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              A free account gives you the same editor, five builds a day, and
              your projects saved — no card needed.
            </p>
            <Link to="/signup" className="mt-4 inline-block">
              <Button>Create a free account</Button>
            </Link>
          </div>
        ) : null}

        {state === "failed" ? (
          <div className="mx-auto max-w-md rounded-lg border border-border p-6 text-left">
            <p className="font-semibold">Couldn&apos;t start the demo project.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Something went wrong on our side, not yours. Try again in a moment,
              or create a free account to go straight to the editor.
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="outline" onClick={startDemo}>Try again</Button>
              <Link to="/signup"><Button>Create a free account</Button></Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
