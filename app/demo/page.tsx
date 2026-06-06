import Link from "next/link";
import { DemoButton } from "@/components/demo-button";
import { Code2, Zap, Eye } from "lucide-react";

export const metadata = {
  title: "Demo | LifemarkAI",
  description: "Try LifemarkAI with a sample project",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="text-xl font-bold text-violet-400 hover:text-violet-300">
          ← Back to Home
        </Link>
      </div>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold text-slate-50">
            Try LifemarkAI{" "}
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              Live
            </span>
          </h1>
          <p className="text-xl text-slate-400">
            Create a sample React project and explore the editor with Monaco code editor and live preview
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-12">
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <Code2 className="w-8 h-8 text-violet-400 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-200">Monaco Editor</h3>
            <p className="text-sm text-slate-400 mt-2">Edit code with syntax highlighting and IntelliSense</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <Eye className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-200">Live Preview</h3>
            <p className="text-sm text-slate-400 mt-2">See changes instantly with WebContainer runtime</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <Zap className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-200">Full Stack</h3>
            <p className="text-sm text-slate-400 mt-2">React + Vite with npm packages and hot reload</p>
          </div>
        </div>

        {/* CTA Button */}
        <DemoButton />
      </div>

      {/* Info Section */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
        <div className="bg-slate-800/30 rounded-lg p-8 border border-slate-700">
          <h2 className="text-2xl font-bold text-slate-100 mb-4">What you'll get:</h2>
          <ul className="space-y-3 text-slate-300">
            <li className="flex items-start gap-3">
              <span className="text-violet-400 mt-1">✓</span>
              <span>A fully functional React + Vite project</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-violet-400 mt-1">✓</span>
              <span>Monaco code editor with multiple tabs</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-violet-400 mt-1">✓</span>
              <span>Live preview with instant hot reload</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-violet-400 mt-1">✓</span>
              <span>Access to all editor panels (chat, files, git, etc)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-violet-400 mt-1">✓</span>
              <span>Demo account with email: demo@lifemarkai.app</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
