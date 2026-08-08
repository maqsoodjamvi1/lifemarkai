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
  async function startDemo() {
    const res = await fetch("/api/demo/create-sample-project", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const id = data.projectId ?? data.id;
      if (id) {
        window.location.href = `/editor/${id}`;
        return;
      }
    }
    window.location.href = "/signup";
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
        <Button size="lg" onClick={startDemo}>
          Launch demo project
        </Button>
      </div>
    </div>
  );
}
