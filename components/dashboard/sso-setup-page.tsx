"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound, ArrowLeft, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Globe, Shield,
  Fingerprint, Users, Trash2, Play, Info, HelpCircle,
  Copy, Check, Server, FileText, Link2,
  Building2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────── */

type Protocol = "oidc" | "saml";
type ProviderKey = "okta" | "auth0" | "entra" | "other";

interface SSOProvider {
  id: string;
  displayName: string;
  protocol: Protocol;
  providerName: ProviderKey;
  tenantId: string;
  issuerUrl?: string;
  signOnUrl?: string;
  status: "active" | "pending";
  lastTestResult?: "success" | "failed";
  lastTestedAt?: string;
}

interface EnforceSettings {
  enforceSso: boolean;
  ssoSessionDuration: string;
  jitEnabled: boolean;
  jitDefaultRole: string;
}

/* ─── Constants ─────────────────────────────────────────── */

const PROVIDERS: Record<ProviderKey, { label: string; icon: React.ComponentType<any> }> = {
  okta:  { label: "Okta",               icon: Building2  },
  auth0: { label: "Auth0",              icon: Globe      },
  entra: { label: "Microsoft Entra ID", icon: Fingerprint },
  other: { label: "Other Provider",     icon: Server     },
};

const FAQ = [
  { q: "Which SSO providers are supported?",
    a: "LifemarkAI supports any OIDC or SAML 2.0 compliant provider, including Okta, Auth0, Microsoft Entra ID (Azure AD), and others." },
  { q: "Does LifemarkAI support multiple SSO providers per workspace?",
    a: "No. A workspace can have one active SSO provider configured at a time." },
  { q: "Can I enforce SSO for my workspace?",
    a: "Yes. Workspace owners and admins can enable Enforce SSO and choose a session duration (24 hours, 48 hours, or 7 days)." },
  { q: "Does LifemarkAI support IdP-initiated SSO?",
    a: "No. Only SP-initiated sign-in is supported. Users must start sign-in from LifemarkAI." },
  { q: "Does LifemarkAI support JIT provisioning?",
    a: "Yes. User accounts are created automatically the first time someone signs in via SSO. You can also set a default role for JIT-created users." },
  { q: "Does LifemarkAI support SCIM?",
    a: "Yes. SCIM provisioning is supported on Enterprise plans for automated user provisioning and deprovisioning." },
  { q: "How can I find my tenant ID?",
    a: "Your tenant ID is the slug in your SSO login URL. You can also find it in Settings → Security → SSO after configuring your provider." },
  { q: "Can I edit my SSO provider configuration?",
    a: "No. To make updates, delete the existing provider and configure it again." },
];

const TROUBLESHOOTING = [
  { q: "Invalid or mismatched Redirect URI",
    a: "Ensure the redirect/callback URL exactly matches the one shown in the SP Details section of your LifemarkAI SSO setup." },
  { q: "Issuer URL / discovery fails",
    a: "Use the provider's OIDC Issuer URL (not just the domain). For Okta, copy from the Sign-on tab. For Auth0, use your tenant domain." },
  { q: "Email not returned",
    a: "Grant the email scope and ensure the user account has a primary email." },
  { q: "Authorization flow issues",
    a: "Use Authorization Code with a confidential client and client secret. Avoid implicit or PKCE-only app types." },
  { q: "Invalid ACS or Audience",
    a: "Ensure both ACS and Audience/Entity ID exactly match the values shown in your LifemarkAI SSO configuration." },
  { q: "Email claim missing",
    a: "Make sure to map an email claim. For Microsoft Entra ID, map email to user.mail. If user.mail is empty, use user.userprincipalname." },
  { q: "Provider credentials invalid",
    a: "Paste the correct X.509 certificate. If the certificate rotates, delete and re-create the provider." },
];

const CALLBACK_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lifemarkai.com"}/api/auth/sso/callback`;

/* ─── Component ─────────────────────────────────────────── */

export function SSOSetupPage() {
  const router = useRouter();

  // Simulated provider state
  const [activeProvider, setActiveProvider] = useState<SSOProvider | null>(null);
  const [enforceSettings, setEnforceSettings] = useState<EnforceSettings>({
    enforceSso: false,
    ssoSessionDuration: "24h",
    jitEnabled: true,
    jitDefaultRole: "editor",
  });

  const [showSetup,    setShowSetup]    = useState(true);
  const [protocol,    setProtocol]      = useState<Protocol>("oidc");
  const [provider,    setProvider]      = useState<ProviderKey>("okta");
  const [showGuide,   setShowGuide]     = useState(true);
  const [isTesting,   setIsTesting]     = useState(false);
  const [expandedFaq, setExpandedFaq]   = useState<number | null>(null);
  const [copied,      setCopied]        = useState("");

  // Form fields
  const [displayName,  setDisplayName]  = useState("");
  const [tenantId,     setTenantId]     = useState("");
  const [issuerUrl,    setIssuerUrl]    = useState("");
  const [clientId,     setClientId]     = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [signOnUrl,    setSignOnUrl]    = useState("");
  const [entityId,     setEntityId]     = useState("");
  const [certificate,  setCertificate]  = useState("");
  const [metadataUrl,  setMetadataUrl]  = useState("");

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleCreate = () => {
    if (protocol === "oidc" && (!issuerUrl || !clientId || !clientSecret)) {
      toast({ title: "Missing fields", description: "Please fill in Issuer URL, Client ID and Client Secret.", variant: "destructive" });
      return;
    }
    if (protocol === "saml" && !signOnUrl && !metadataUrl) {
      toast({ title: "Missing fields", description: "Provide a Metadata URL or Sign-on URL.", variant: "destructive" });
      return;
    }
    const slug = tenantId || provider;
    const newProvider: SSOProvider = {
      id: crypto.randomUUID(),
      displayName: displayName || `${PROVIDERS[provider].label} SSO`,
      protocol,
      providerName: provider,
      tenantId: slug,
      issuerUrl: protocol === "oidc" ? issuerUrl : undefined,
      signOnUrl: protocol === "saml" ? signOnUrl : undefined,
      status: "active",
    };
    setActiveProvider(newProvider);
    setShowSetup(false);
    toast({ title: "SSO provider configured", description: `${newProvider.displayName} is now active.` });
  };

  const handleDelete = () => {
    setActiveProvider(null);
    setShowSetup(true);
    toast({ title: "SSO provider deleted" });
  };

  const handleTest = async () => {
    setIsTesting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsTesting(false);
    const success = Math.random() > 0.2;
    if (activeProvider) {
      setActiveProvider({ ...activeProvider, lastTestResult: success ? "success" : "failed", lastTestedAt: new Date().toISOString() });
    }
    toast({ title: success ? "Configuration test passed" : "Test failed", variant: success ? "default" : "destructive" });
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
            <KeyRound size={20} className="text-foreground" />
            <div>
              <h1 className="text-lg font-semibold">Workspace SSO</h1>
              <p className="text-xs text-muted-foreground">Connect your identity provider for centralized authentication</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* SP-initiated note */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2">
          <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-300 leading-relaxed">
            <strong>SP-initiated sign-in only.</strong> Users must start sign-in from LifemarkAI.
            IdP-initiated SSO is not supported.
          </p>
        </div>

        {/* Active provider card */}
        {activeProvider && !showSetup && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Shield size={16} className="text-green-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{activeProvider.displayName}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full uppercase">{activeProvider.protocol}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">{activeProvider.status}</span>
                    {activeProvider.lastTestResult && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeProvider.lastTestResult === "success" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {activeProvider.lastTestResult === "success" ? "Tested OK" : "Test Failed"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleTest} disabled={isTesting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition disabled:opacity-50">
                  {isTesting ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                  Test
                </button>
                <button onClick={handleDelete}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Tenant ID:</span> <span className="font-mono">{activeProvider.tenantId}</span></div>
              <div><span className="text-muted-foreground">Provider:</span> <span className="capitalize">{activeProvider.providerName}</span></div>
              {activeProvider.issuerUrl && (
                <div className="col-span-2"><span className="text-muted-foreground">Issuer URL:</span> <span className="font-mono">{activeProvider.issuerUrl}</span></div>
              )}
              {activeProvider.signOnUrl && (
                <div className="col-span-2"><span className="text-muted-foreground">Sign-on URL:</span> <span className="font-mono">{activeProvider.signOnUrl}</span></div>
              )}
              {activeProvider.lastTestedAt && (
                <div><span className="text-muted-foreground">Last tested:</span> <span>{new Date(activeProvider.lastTestedAt).toLocaleString()}</span></div>
              )}
            </div>
            <div className="px-4 pb-4">
              <button onClick={() => setShowSetup(true)}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                + Add new provider (will replace current)
              </button>
            </div>
          </div>
        )}

        {/* Setup Wizard */}
        {showSetup && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-semibold">{activeProvider ? "Replace SSO Provider" : "Add SSO Provider"}</h2>
            </div>

            {/* Step 1: Protocol */}
            <div className="p-4 border-b border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Step 1: Choose Protocol</span>
              <div className="flex gap-2 mt-2">
                {([
                  { key: "oidc" as Protocol, label: "OpenID Connect", desc: "Modern OAuth 2.0 based",   icon: Globe     },
                  { key: "saml" as Protocol, label: "SAML 2.0",       desc: "Enterprise XML-based",     icon: FileText  },
                ] as const).map((p) => (
                  <button key={p.key} onClick={() => setProtocol(p.key)}
                    className={`flex-1 p-3 rounded-xl border-2 transition text-left ${protocol === p.key ? "border-foreground bg-muted/40" : "border-border hover:border-muted-foreground"}`}>
                    <div className="flex items-center gap-2">
                      <p.icon size={14} className={protocol === p.key ? "text-foreground" : "text-muted-foreground"} />
                      <span className={`text-xs font-semibold ${protocol === p.key ? "text-foreground" : "text-muted-foreground"}`}>{p.label}</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 ${protocol === p.key ? "text-muted-foreground" : "text-muted-foreground/60"}`}>{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Provider */}
            <div className="p-4 border-b border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Step 2: Choose Provider</span>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {(Object.entries(PROVIDERS) as [ProviderKey, { label: string; icon: React.ComponentType<any> }][]).map(([key, p]) => (
                  <button key={key} onClick={() => setProvider(key)}
                    className={`p-3 rounded-xl border-2 transition text-center ${provider === key ? "border-foreground bg-muted/40" : "border-border hover:border-muted-foreground"}`}>
                    <p.icon size={18} className={`mx-auto mb-1 ${provider === key ? "text-foreground" : "text-muted-foreground"}`} />
                    <span className={`text-[11px] font-medium ${provider === key ? "text-foreground" : "text-muted-foreground"}`}>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Configuration */}
            <div className="p-4 border-b border-border">
              <button onClick={() => setShowGuide(!showGuide)} className="flex items-center justify-between w-full">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Step 3: Configure {PROVIDERS[provider].label}
                </span>
                {showGuide ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </button>

              {showGuide && (
                <div className="mt-3 space-y-3">
                  {/* Callback URL */}
                  <div className="p-2.5 bg-muted/40 rounded-lg border border-border">
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase">Redirect / Callback URL for your IdP</span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-[10px] font-mono bg-background px-2 py-1 rounded border border-border flex-1 truncate">{CALLBACK_URL}</code>
                      <button onClick={() => handleCopy(CALLBACK_URL, "callback")}
                        className="p-1 hover:bg-muted rounded transition">
                        {copied === "callback" ? <Check size={10} className="text-green-400" /> : <Copy size={10} className="text-muted-foreground" />}
                      </button>
                    </div>
                  </div>

                  {/* OIDC fields */}
                  {protocol === "oidc" && (
                    <div className="space-y-2">
                      <label className="block text-[10px] text-muted-foreground">OIDC Issuer URL / Discovery Endpoint</label>
                      <input value={issuerUrl} onChange={(e) => setIssuerUrl(e.target.value)}
                        placeholder={
                          provider === "okta"  ? "https://your-org.okta.com" :
                          provider === "auth0" ? "https://your-tenant.auth0.com" :
                          provider === "entra" ? "https://login.microsoftonline.com/{TENANT_ID}/v2.0" :
                          "https://your-idp.com"
                        }
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <label className="block text-[10px] text-muted-foreground mt-2">OAuth Client ID / Application ID</label>
                      <input value={clientId} onChange={(e) => setClientId(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <label className="block text-[10px] text-muted-foreground mt-2">OAuth Client Secret</label>
                      <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password"
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  )}

                  {/* SAML fields */}
                  {protocol === "saml" && (
                    <div className="space-y-2">
                      <label className="block text-[10px] text-muted-foreground">Metadata URL (optional quick setup)</label>
                      <input value={metadataUrl} onChange={(e) => setMetadataUrl(e.target.value)}
                        placeholder="https://your-idp.com/metadata.xml"
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <div className="text-center text-[10px] text-muted-foreground">— or configure manually —</div>
                      <label className="block text-[10px] text-muted-foreground">SAML SSO Sign-on URL</label>
                      <input value={signOnUrl} onChange={(e) => setSignOnUrl(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <label className="block text-[10px] text-muted-foreground mt-2">Identity Provider Entity ID / Issuer</label>
                      <input value={entityId} onChange={(e) => setEntityId(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <label className="block text-[10px] text-muted-foreground mt-2">X.509 Signing Certificate</label>
                      <textarea value={certificate} onChange={(e) => setCertificate(e.target.value)}
                        placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
                        rows={4} />
                    </div>
                  )}

                  {/* Display name & Tenant ID */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-[10px] text-muted-foreground">Display Name</label>
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={`${PROVIDERS[provider].label} SSO`}
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground">Tenant ID (SSO login URL slug)</label>
                      <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder={provider}
                        className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    SSO login URL: {process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lifemarkai.com"}/sso-login/{tenantId || "{tenantId}"}
                  </p>
                </div>
              )}
            </div>

            {/* Step 4: Submit */}
            <div className="p-4 flex items-center justify-between">
              {activeProvider && (
                <button onClick={() => setShowSetup(false)} className="text-xs text-muted-foreground hover:text-foreground transition">
                  Cancel
                </button>
              )}
              <button onClick={handleCreate}
                className="ml-auto px-4 py-2 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 transition">
                {activeProvider ? "Replace Provider" : "Configure Provider"}
              </button>
            </div>
          </div>
        )}

        {/* JIT Provisioning */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users size={15} className="text-muted-foreground" /> Just-in-Time Provisioning
            </h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Enable JIT provisioning</p>
                <p className="text-[10px] text-muted-foreground">Users are created automatically on first SSO sign-in</p>
              </div>
              <button
                onClick={() => setEnforceSettings((s) => ({ ...s, jitEnabled: !s.jitEnabled }))}
                className={`relative w-10 h-6 rounded-full transition-colors ${enforceSettings.jitEnabled ? "bg-green-500" : "bg-muted"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enforceSettings.jitEnabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {enforceSettings.jitEnabled && (
              <div>
                <label className="block text-[10px] text-muted-foreground">Default role for JIT users</label>
                <select value={enforceSettings.jitDefaultRole}
                  onChange={(e) => setEnforceSettings((s) => ({ ...s, jitDefaultRole: e.target.value }))}
                  className="mt-1 text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none">
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Enforce SSO */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Shield size={15} className="text-muted-foreground" /> Enforce SSO
            </h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Require SSO for all members</p>
                <p className="text-[10px] text-muted-foreground">External collaborators and invite links will be disabled</p>
              </div>
              <button
                onClick={() => setEnforceSettings((s) => ({ ...s, enforceSso: !s.enforceSso }))}
                className={`relative w-10 h-6 rounded-full transition-colors ${enforceSettings.enforceSso ? "bg-foreground" : "bg-muted"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enforceSettings.enforceSso ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {enforceSettings.enforceSso && (
              <div>
                <label className="block text-[10px] text-muted-foreground">Session duration before re-authentication</label>
                <select value={enforceSettings.ssoSessionDuration}
                  onChange={(e) => setEnforceSettings((s) => ({ ...s, ssoSessionDuration: e.target.value }))}
                  className="mt-1 text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none">
                  <option value="24h">24 hours</option>
                  <option value="48h">48 hours</option>
                  <option value="7d">7 days</option>
                </select>
              </div>
            )}
          </div>
        </div>

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
                <button onClick={() => setExpandedFaq(expandedFaq === 200 + i ? null : 200 + i)}
                  className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition text-left">
                  <span className="text-xs text-foreground pr-4">{item.q}</span>
                  {expandedFaq === 200 + i
                    ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" />
                    : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />}
                </button>
                {expandedFaq === 200 + i && (
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
