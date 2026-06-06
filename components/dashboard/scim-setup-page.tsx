"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, ArrowLeft, ChevronDown, ChevronUp, Shield, Copy, Check,
  AlertTriangle, RefreshCw, Loader2, Globe, KeyRound,
  XCircle, CheckCircle2, HelpCircle, Building2, Fingerprint,
  Server, Info, Plus, Trash2, Eye, EyeOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────── */

interface SCIMConfig {
  enabled: boolean;
  apiKeyPrefix: string;
  apiKeyFull: string;
  welcomeEmail: boolean;
  lastRotatedAt: string;
}

interface GroupMapping {
  id: string;
  groupName: string;
  role: "viewer" | "editor" | "admin";
}

/* ─── Constants ─────────────────────────────────────────── */

const BASE_URL = "https://api.lifemarkai.com/scim/v2";

const FAQ = [
  { q: "Can I use SCIM without SSO?",
    a: "No, SCIM requires an active SSO provider. Users provisioned via SCIM authenticate using your configured SSO provider." },
  { q: "What happens to existing users when I enable SCIM?",
    a: "Existing workspace members are not affected. SCIM manages users provisioned through your IdP. Previously invited users continue to exist alongside SCIM-provisioned users." },
  { q: "I lost my API key. What should I do?",
    a: "The API key is only shown once when generated. Go to Settings → Security → SCIM, click Rotate next to the API key, confirm, then update your IdP with the new key." },
  { q: "Can I provision users without sending them a welcome email?",
    a: 'Yes. Turn off "Send welcome email to provisioned users" during setup or later from the SCIM settings.' },
  { q: "What happens if a user belongs to multiple mapped groups?",
    a: "LifemarkAI assigns the highest-privilege role from those groups (Admin > Editor > Viewer)." },
  { q: "Should I use SCIM or just-in-time (JIT) provisioning?",
    a: "SCIM is recommended for managed environments where user lifecycle should be controlled centrally. JIT applies only to users who sign up through SSO. SCIM takes precedence over JIT for role assignments." },
];

const TROUBLESHOOTING = [
  { q: "User provisioning fails with 'domain not verified' error",
    a: "SCIM only provisions users whose email domain is verified. Go to Settings → Security → Verified Domains, add and verify the email domain, then retry provisioning." },
  { q: "Users are provisioned but can't log in",
    a: "Verify that your SSO provider is correctly configured and users are assigned to the SSO application in your IdP. Users provisioned via SCIM must authenticate through SSO." },
  { q: "Role mappings are not being applied",
    a: "Check that group names in your mappings exactly match what your IdP sends (case-insensitive), your IdP is configured to send group membership data, and group push is enabled." },
];

function generateApiKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "lmai_";
  for (let i = 0; i < 40; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

/* ─── Component ─────────────────────────────────────────── */

export function SCIMSetupPage({ hasSso = true }: { hasSso?: boolean }) {
  const router = useRouter();

  const [config,   setConfig]   = useState<SCIMConfig | null>(null);
  const [mappings, setMappings] = useState<GroupMapping[]>([]);

  const [showApiKey,      setShowApiKey]      = useState(false);
  const [copied,          setCopied]          = useState("");
  const [isEnabling,      setIsEnabling]      = useState(false);
  const [showRotate,      setShowRotate]      = useState(false);
  const [groupName,       setGroupName]       = useState("");
  const [groupRole,       setGroupRole]       = useState<"viewer" | "editor" | "admin">("editor");
  const [expandedFaq,     setExpandedFaq]     = useState<number | null>(null);
  const [expandedTrouble, setExpandedTrouble] = useState<number | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleEnable = async () => {
    setIsEnabling(true);
    await new Promise((r) => setTimeout(r, 1000));
    const key = generateApiKey();
    setConfig({
      enabled: true,
      apiKeyPrefix: key.slice(0, 12) + "…",
      apiKeyFull: key,
      welcomeEmail: true,
      lastRotatedAt: new Date().toISOString(),
    });
    setShowApiKey(true);
    setIsEnabling(false);
    toast({ title: "SCIM provisioning enabled", description: "Save your API key — it will only be shown once." });
  };

  const handleRotate = async () => {
    const key = generateApiKey();
    setConfig((c) => c ? { ...c, apiKeyPrefix: key.slice(0, 12) + "…", apiKeyFull: key, lastRotatedAt: new Date().toISOString() } : c);
    setShowRotate(false);
    setShowApiKey(true);
    toast({ title: "API key rotated", description: "Update your IdP with the new key immediately." });
  };

  const handleAddMapping = () => {
    if (!groupName.trim()) { toast({ title: "Enter a group name", variant: "destructive" }); return; }
    setMappings((m) => [...m, { id: crypto.randomUUID(), groupName: groupName.trim(), role: groupRole }]);
    setGroupName("");
    toast({ title: "Group mapping added" });
  };

  const handleRemoveMapping = (id: string) => {
    setMappings((m) => m.filter((x) => x.id !== id));
    toast({ title: "Mapping removed" });
  };

  const handleDisable = () => {
    setConfig(null);
    setMappings([]);
    setShowApiKey(false);
    toast({ title: "SCIM provisioning disabled" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard/settings")}
              className="p-1.5 hover:bg-muted rounded-lg transition">
              <ArrowLeft size={16} className="text-muted-foreground" />
            </button>
            <Users size={20} className="text-foreground" />
            <div>
              <h1 className="text-lg font-semibold">SCIM Provisioning</h1>
              <p className="text-xs text-muted-foreground">Automated user lifecycle management via your identity provider</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* SSO prerequisite warning */}
        {!hasSso && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-amber-400 font-medium">SSO Required</p>
              <p className="text-xs text-amber-300 leading-relaxed">
                You need an active SSO provider before setting up SCIM.{" "}
                <button onClick={() => router.push("/dashboard/settings/sso")}
                  className="underline hover:no-underline">Configure SSO first</button>
              </p>
            </div>
          </div>
        )}

        {/* Enable / disabled state */}
        {!config?.enabled ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-6 text-center space-y-3">
              <div className="p-3 bg-muted rounded-full inline-block">
                <Users size={24} className="text-muted-foreground" />
              </div>
              <h2 className="text-sm font-semibold">Enable SCIM Provisioning</h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Automatically create, update, and remove users in LifemarkAI using your identity provider.
                Available on Enterprise plans.
              </p>
              <button onClick={handleEnable} disabled={isEnabling || !hasSso}
                className="px-6 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 mx-auto">
                {isEnabling ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                {isEnabling ? "Enabling…" : "Enable SCIM Provisioning"}
              </button>
              {!hasSso && <p className="text-[10px] text-amber-400">Configure SSO first to enable SCIM</p>}
            </div>
          </div>
        ) : (
          <>
            {/* SCIM Credentials */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound size={15} className="text-muted-foreground" /> SCIM Credentials
                </h2>
                <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">Active</span>
              </div>
              <div className="p-4 space-y-3">
                {/* Base URL */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Base URL</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs font-mono bg-muted/40 px-3 py-2 rounded-lg border border-border truncate">{BASE_URL}</code>
                    <button onClick={() => handleCopy(BASE_URL, "baseurl")}
                      className="p-2 hover:bg-muted rounded-lg transition">
                      {copied === "baseurl" ? <Check size={13} className="text-green-400" /> : <Copy size={13} className="text-muted-foreground" />}
                    </button>
                  </div>
                </div>

                {/* API Key */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">API Key</label>
                    <button onClick={() => setShowRotate(!showRotate)}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      <RefreshCw size={9} /> Rotate
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs font-mono bg-muted/40 px-3 py-2 rounded-lg border border-border truncate">
                      {showApiKey ? config.apiKeyFull : config.apiKeyPrefix}
                    </code>
                    <button onClick={() => {
                      if (showApiKey) handleCopy(config.apiKeyFull, "apikey");
                      setShowApiKey((v) => !v);
                    }} className="p-2 hover:bg-muted rounded-lg transition">
                      {showApiKey ? <EyeOff size={13} className="text-muted-foreground" /> : <Eye size={13} className="text-muted-foreground" />}
                    </button>
                  </div>
                  {showRotate && (
                    <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-xs text-amber-400 mb-2">
                        <AlertTriangle size={11} className="inline mr-1" />
                        Rotating the key immediately invalidates the previous key. Update your IdP right away.
                      </p>
                      <button onClick={handleRotate}
                        className="px-3 py-1.5 bg-amber-500 text-white text-[10px] rounded-lg hover:bg-amber-600 transition">
                        Confirm Rotation
                      </button>
                    </div>
                  )}
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Authentication: Bearer token · Last rotated: {new Date(config.lastRotatedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Welcome email toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-xs font-medium">Send welcome email</p>
                    <p className="text-[10px] text-muted-foreground">Send invitation email to each provisioned user</p>
                  </div>
                  <button
                    onClick={() => setConfig((c) => c ? { ...c, welcomeEmail: !c.welcomeEmail } : c)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${config.welcomeEmail ? "bg-green-500" : "bg-muted"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.welcomeEmail ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Disable */}
                <div className="pt-2 border-t border-border">
                  <button onClick={handleDisable}
                    className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1">
                    <XCircle size={10} /> Disable SCIM provisioning
                  </button>
                </div>
              </div>
            </div>

            {/* Group Role Mappings */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Users size={15} className="text-muted-foreground" /> Group Role Mappings
                </h2>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Map your IdP groups to LifemarkAI workspace roles. Group names are case-insensitive.
                </p>
              </div>
              <div className="p-4 space-y-3">
                {/* Add mapping */}
                <div className="flex gap-2">
                  <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
                    placeholder="IdP group name (e.g., engineering-admins)"
                    className="flex-1 text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <select value={groupRole} onChange={(e) => setGroupRole(e.target.value as any)}
                    className="text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleAddMapping}
                    className="px-3 py-2 bg-foreground text-background text-xs rounded-lg hover:opacity-90 transition flex items-center gap-1">
                    <Plus size={11} /> Add
                  </button>
                </div>

                {/* Mappings list */}
                {mappings.length > 0 ? (
                  <div className="space-y-1">
                    {mappings.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Users size={10} className="text-muted-foreground" />
                          <span className="text-xs font-medium">{m.groupName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            m.role === "admin"  ? "bg-purple-500/20 text-purple-400" :
                            m.role === "editor" ? "bg-blue-500/20 text-blue-400"    :
                                                  "bg-muted text-muted-foreground"
                          }`}>{m.role}</span>
                        </div>
                        <button onClick={() => handleRemoveMapping(m.id)}
                          className="p-1 hover:bg-muted rounded transition text-muted-foreground hover:text-red-400">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-xs">
                    No group mappings yet. Add your first mapping above.
                  </div>
                )}

                {/* Example */}
                <div className="p-2.5 bg-muted/40 rounded-lg border border-border">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Example mappings</span>
                  <div className="grid grid-cols-3 gap-2 mt-1.5">
                    {[
                      { group: "lifemark-admins", role: "admin"  },
                      { group: "engineering",      role: "editor" },
                      { group: "contractors",      role: "viewer" },
                    ].map((ex, i) => (
                      <div key={i} className="text-center p-1.5 bg-background rounded border border-border">
                        <span className="text-[10px] font-mono text-foreground">{ex.group}</span>
                        <span className={`text-[9px] ml-1 px-1 py-0.5 rounded ${
                          ex.role === "admin"  ? "bg-purple-500/20 text-purple-400" :
                          ex.role === "editor" ? "bg-blue-500/20 text-blue-400"    :
                                                 "bg-muted text-muted-foreground"
                        }`}>{ex.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* IdP Setup Guides */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Server size={15} className="text-muted-foreground" /> Configure Your Identity Provider
                </h2>
              </div>
              <div className="p-4 space-y-4 text-xs">
                {/* Okta */}
                <div className="p-3 bg-muted/40 rounded-lg border border-border">
                  <h3 className="font-semibold flex items-center gap-1.5 mb-2">
                    <Building2 size={12} className="text-blue-400" /> Okta
                  </h3>
                  <ol className="space-y-1.5 text-muted-foreground list-decimal list-inside text-[11px]">
                    <li>In Okta Admin Console, go to Applications → Browse App Catalog</li>
                    <li>Search for <strong>SCIM 2.0 Test App (Header Auth)</strong> and add integration</li>
                    <li>Go to Provisioning → Integration → Configure API Integration</li>
                    <li>Enable API Integration, enter Base URL and API token</li>
                    <li>Enable Create Users, Update User Attributes, Deactivate Users</li>
                    <li>Assign users/groups and enable group push for role mappings</li>
                  </ol>
                </div>

                {/* Microsoft Entra */}
                <div className="p-3 bg-muted/40 rounded-lg border border-border">
                  <h3 className="font-semibold flex items-center gap-1.5 mb-2">
                    <Fingerprint size={12} className="text-blue-400" /> Microsoft Entra ID
                  </h3>
                  <ol className="space-y-1.5 text-muted-foreground list-decimal list-inside text-[11px]">
                    <li>Go to Microsoft Entra admin center → Enterprise applications</li>
                    <li>Create or select your app → Provisioning → New configuration</li>
                    <li>Authentication method: <strong>Bearer Authentication</strong></li>
                    <li>Tenant URL: <code className="bg-background px-1 rounded border border-border">{BASE_URL}</code></li>
                    <li>Secret token: <code className="bg-background px-1 rounded border border-border">Bearer &lt;your API key&gt;</code></li>
                    <li>Click Test connection, then Create, then Start provisioning</li>
                  </ol>
                </div>

                {/* Other */}
                <div className="p-3 bg-muted/40 rounded-lg border border-border">
                  <h3 className="font-semibold flex items-center gap-1.5 mb-2">
                    <Globe size={12} className="text-muted-foreground" /> Other SCIM 2.0 Providers
                  </h3>
                  <div className="space-y-1.5 text-[11px] text-muted-foreground">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground/60 text-[10px]">SCIM base URL</span>
                        <code className="block bg-background px-2 py-1 rounded border border-border text-[10px] font-mono mt-0.5">{BASE_URL}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground/60 text-[10px]">Auth method</span>
                        <code className="block bg-background px-2 py-1 rounded border border-border text-[10px] font-mono mt-0.5">Bearer token</code>
                      </div>
                    </div>
                    <p>Enable provisioning actions: Create users, Update attributes, Deactivate users, Push groups.</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Troubleshooting */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={15} className="text-muted-foreground" /> Troubleshooting
            </h2>
          </div>
          <div className="divide-y divide-border">
            {TROUBLESHOOTING.map((item, i) => (
              <div key={i}>
                <button onClick={() => setExpandedTrouble(expandedTrouble === i ? null : i)}
                  className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition text-left">
                  <span className="text-xs text-foreground pr-4">{item.q}</span>
                  {expandedTrouble === i
                    ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" />
                    : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />}
                </button>
                {expandedTrouble === i && (
                  <p className="text-xs text-muted-foreground px-4 pb-4 leading-relaxed">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <HelpCircle size={15} className="text-muted-foreground" /> FAQ
            </h2>
          </div>
          <div className="divide-y divide-border">
            {FAQ.map((faq, i) => (
              <div key={i}>
                <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition text-left">
                  <span className="text-xs text-foreground pr-4">{faq.q}</span>
                  {expandedFaq === i
                    ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" />
                    : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />}
                </button>
                {expandedFaq === i && (
                  <p className="text-xs text-muted-foreground px-4 pb-4 leading-relaxed">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
