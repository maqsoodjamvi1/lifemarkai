"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Shield,
  Zap,
  Globe,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Lock,
  Clock,
  RefreshCw,
  Send,
  UserCheck,
  ExternalLink,
  MailCheck,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface Template {
  id: string;
  name: string;
  subject: string;
  description: string;
  variables: string[];
  required: boolean;
  defaultBody: string;
}

const AUTH_EMAIL_TEMPLATES: Template[] = [
  {
    id: "confirm-signup",
    name: "Confirm Signup",
    subject: "Confirm your email",
    description:
      "Sent after a user signs up with email and password. Contains a confirmation link they must click to activate their account.",
    variables: ["{{ .ConfirmationURL }}", "{{ .Token }}", "{{ .SiteURL }}"],
    required: true,
    defaultBody: `<h2>Confirm your email</h2>
<p>Click the button below to confirm your email address.</p>
<a href="{{ .ConfirmationURL }}">Confirm Email</a>`,
  },
  {
    id: "magic-link",
    name: "Magic Link",
    subject: "Your magic link",
    description:
      "Sent when a user requests a passwordless login. Contains a one-time link that logs them in automatically.",
    variables: ["{{ .TokenHash }}", "{{ .SiteURL }}"],
    required: true,
    defaultBody: `<h2>Sign in to your account</h2>
<p>Click the link below to sign in. This link is valid for 1 hour.</p>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Sign In</a>`,
  },
  {
    id: "invite",
    name: "Invitation",
    subject: "You have been invited",
    description:
      "Sent when you invite a new user to your app. Contains an invite link that lets them set a password and join.",
    variables: ["{{ .TokenHash }}", "{{ .SiteURL }}"],
    required: false,
    defaultBody: `<h2>You've been invited</h2>
<p>Click the link to accept the invitation and create your account.</p>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept Invitation</a>`,
  },
  {
    id: "reset-password",
    name: "Reset Password",
    subject: "Reset your password",
    description:
      "Sent when a user requests a password reset. Contains a secure link to set a new password.",
    variables: ["{{ .TokenHash }}", "{{ .SiteURL }}"],
    required: true,
    defaultBody: `<h2>Reset your password</h2>
<p>Click the link below to reset your password. This link expires in 24 hours.</p>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>`,
  },
  {
    id: "email-change",
    name: "Email Change",
    subject: "Confirm email change",
    description:
      "Sent when a user requests to change their email address. Contains a confirmation link for the new email.",
    variables: ["{{ .TokenHash }}", "{{ .SiteURL }}", "{{ .NewEmail }}"],
    required: true,
    defaultBody: `<h2>Confirm your new email</h2>
<p>You requested to change your email to {{ .NewEmail }}. Click below to confirm.</p>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm Email</a>`,
  },
  {
    id: "reauth",
    name: "Reauthentication",
    subject: "Reauthenticate your session",
    description:
      "Sent when a sensitive action requires re-verification of the user's email (nonce-based).",
    variables: ["{{ .TokenHash }}", "{{ .SiteURL }}"],
    required: false,
    defaultBody: `<h2>Verify your identity</h2>
<p>Enter the OTP code below or click the link to reauthenticate.</p>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=reauthentication">Verify</a>`,
  },
];

const DELIVERABILITY_PRACTICES = [
  {
    icon: Zap,
    title: "Warm up your domain gradually",
    content:
      "Start with 50–100 emails/day and increase by ~20% daily. Sudden high volume from a new domain triggers spam filters. Plan a 2–4 week warm-up period.",
  },
  {
    icon: Shield,
    title: "Set up SPF, DKIM, and DMARC",
    content:
      "These DNS records authenticate your emails. SPF authorizes sending servers, DKIM signs messages cryptographically, and DMARC tells receivers how to handle failures.",
  },
  {
    icon: Globe,
    title: "Use a dedicated sending subdomain",
    content:
      "Send from mail.yourapp.com rather than your root domain. This protects your main domain reputation if deliverability issues occur.",
  },
  {
    icon: AlertTriangle,
    title: "Monitor bounce rates",
    content:
      "Keep hard bounces below 2% and soft bounces below 5%. High bounce rates damage sender reputation. Remove invalid addresses immediately after a hard bounce.",
  },
  {
    icon: RefreshCw,
    title: "Implement list hygiene",
    content:
      "Regularly remove inactive subscribers (no opens in 6+ months) and invalid addresses. A smaller engaged list outperforms a large stale one.",
  },
  {
    icon: UserCheck,
    title: "Use double opt-in",
    content:
      "Require email confirmation before adding users to your list. Double opt-in lists have 20% higher engagement and near-zero spam complaints.",
  },
  {
    icon: Lock,
    title: "Rotate DKIM keys safely",
    content:
      "When rotating keys, overlap old and new DKIM selectors for 7 days to prevent delivery disruption during the transition.",
  },
  {
    icon: Clock,
    title: "Maintain consistent sending patterns",
    content:
      "Send at regular intervals rather than sporadic bursts. ISPs track sending cadence — consistent volume builds trust better than random campaigns.",
  },
];

const DNS_RECORDS = [
  {
    type: "TXT (SPF)",
    name: "@",
    value: "v=spf1 include:_spf.supabase.com ~all",
    purpose: "Authorizes Supabase to send emails on your behalf",
  },
  {
    type: "TXT (DKIM)",
    name: "supabase._domainkey",
    value: "v=DKIM1; k=rsa; p=<public-key>",
    purpose: "Cryptographically signs outgoing emails",
  },
  {
    type: "TXT (DMARC)",
    name: "_dmarc",
    value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourapp.com",
    purpose: "Tells receivers how to handle authentication failures",
  },
];

interface ResendDomain {
  id: string;
  name: string;
  status: string;
  records: Array<{ type: string; name: string; value: string; ttl: string; priority?: number; status: string }>;
}

export function CustomEmailsPanel() {
  const [activeTab, setActiveTab] = useState<"templates" | "deliverability" | "dns">(
    "templates"
  );
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [expandedPractice, setExpandedPractice] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateBodies, setTemplateBodies] = useState<Record<string, string>>(
    Object.fromEntries(AUTH_EMAIL_TEMPLATES.map((t) => [t.id, t.defaultBody]))
  );

  // ── Resend domain state ──────────────────────────────────────────────────
  const [resendDomain, setResendDomain] = useState<ResendDomain | null>(null);
  const [domainInput, setDomainInput]   = useState("");
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainChecking, setDomainChecking] = useState(false);
  const [domainFetched, setDomainFetched]   = useState(false);

  const fetchDomain = useCallback(async () => {
    const res = await fetch("/api/email-domain");
    if (res.ok) {
      const data = await res.json() as { domain: ResendDomain | null };
      setResendDomain(data.domain);
    }
    setDomainFetched(true);
  }, []);

  useEffect(() => {
    if (activeTab === "dns" && !domainFetched) void fetchDomain();
  }, [activeTab, domainFetched, fetchDomain]);

  async function addDomain() {
    if (!domainInput.trim()) return;
    setDomainLoading(true);
    const res = await fetch("/api/email-domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: domainInput.trim() }),
    });
    const data = await res.json() as { domain?: ResendDomain; error?: string };
    if (res.ok && data.domain) {
      setResendDomain(data.domain);
      setDomainInput("");
      toast({ title: "Domain added", description: "Add the DNS records below to verify." });
    } else {
      toast({ title: "Error", description: data.error ?? "Failed to add domain", variant: "destructive" });
    }
    setDomainLoading(false);
  }

  async function recheckDomain() {
    setDomainChecking(true);
    const res = await fetch("/api/email-domain", { method: "PATCH" });
    const data = await res.json() as { domain?: ResendDomain; error?: string };
    if (res.ok && data.domain) {
      setResendDomain(data.domain);
      const verified = data.domain.status === "verified";
      toast({ title: verified ? "✅ Domain verified!" : "Still pending", description: verified ? "You can now send from this domain." : "DNS may take up to 60 min to propagate." });
    } else {
      toast({ title: "Check failed", description: data.error, variant: "destructive" });
    }
    setDomainChecking(false);
  }

  async function removeDomain() {
    setDomainLoading(true);
    await fetch("/api/email-domain", { method: "DELETE" });
    setResendDomain(null);
    setDomainFetched(false);
    toast({ title: "Domain removed" });
    setDomainLoading(false);
  }

  async function verifyDomain() {
    await recheckDomain();
  }

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    toast({ title: "Copied to clipboard" });
  };

  const tabs = [
    { key: "templates" as const, label: "Templates" },
    { key: "deliverability" as const, label: "Deliverability" },
    { key: "dns" as const, label: "DNS Setup" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <MailCheck className="w-4 h-4 text-violet-500" />
        <h2 className="text-sm font-semibold">Custom Emails</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-3 mb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-1 text-[10px] font-medium rounded-md transition ${
              activeTab === t.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {/* ── Templates tab ── */}
        {activeTab === "templates" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Customize the auth emails Supabase sends on your behalf. Configure
              these in your{" "}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 hover:underline"
              >
                Supabase dashboard
              </a>{" "}
              under Auth → Email Templates.
            </p>

            <div className="space-y-2">
              {AUTH_EMAIL_TEMPLATES.map((template) => {
                const isExpanded = expandedTemplate === template.id;
                const isEditing = editingTemplate === template.id;

                return (
                  <div
                    key={template.id}
                    className="border border-border rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedTemplate(isExpanded ? null : template.id)
                      }
                      className="flex items-center gap-2 w-full p-2.5 text-left hover:bg-muted/40 transition"
                    >
                      <Mail className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold">
                            {template.name}
                          </span>
                          {template.required ? (
                            <span className="text-[7px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                              Required
                            </span>
                          ) : (
                            <span className="text-[7px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full">
                              Optional
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {template.subject}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 border-t border-border pt-2 space-y-2">
                        <p className="text-[10px] text-muted-foreground">
                          {template.description}
                        </p>

                        {/* Variables */}
                        <div>
                          <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Available variables
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {template.variables.map((v) => (
                              <button
                                key={v}
                                onClick={() => copyText(v, `var-${template.id}-${v}`)}
                                className="text-[8px] px-1.5 py-0.5 bg-muted font-mono rounded border border-border text-muted-foreground hover:bg-muted/80 transition flex items-center gap-0.5"
                              >
                                {copiedId === `var-${template.id}-${v}` ? (
                                  <Check className="w-2 h-2 text-emerald-500" />
                                ) : (
                                  <Copy className="w-2 h-2" />
                                )}
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Template body */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Email body (HTML)
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() =>
                                  copyText(
                                    templateBodies[template.id],
                                    `body-${template.id}`
                                  )
                                }
                                className="text-[8px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition"
                              >
                                {copiedId === `body-${template.id}` ? (
                                  <Check className="w-2 h-2 text-emerald-500" />
                                ) : (
                                  <Copy className="w-2 h-2" />
                                )}
                                Copy
                              </button>
                              <button
                                onClick={() =>
                                  setEditingTemplate(isEditing ? null : template.id)
                                }
                                className="text-[8px] text-violet-500 hover:text-violet-600 transition"
                              >
                                {isEditing ? "Done" : "Edit"}
                              </button>
                            </div>
                          </div>
                          {isEditing ? (
                            <textarea
                              value={templateBodies[template.id]}
                              onChange={(e) =>
                                setTemplateBodies((prev) => ({
                                  ...prev,
                                  [template.id]: e.target.value,
                                }))
                              }
                              rows={8}
                              className="w-full text-[9px] font-mono p-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-y"
                            />
                          ) : (
                            <pre className="text-[9px] font-mono p-2 bg-muted/40 rounded-lg border border-border overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                              {templateBodies[template.id]}
                            </pre>
                          )}
                        </div>

                        <a
                          href="https://supabase.com/docs/guides/auth/auth-email-templates"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[9px] text-violet-500 hover:text-violet-600 transition"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Supabase email template docs
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Deliverability tab ── */}
        {activeTab === "deliverability" && (
          <>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Good email deliverability requires both technical setup (SPF, DKIM,
                DMARC) and healthy sending practices. Follow these guidelines to
                maintain a strong sender reputation.
              </p>
            </div>

            <div className="space-y-2">
              {DELIVERABILITY_PRACTICES.map((practice, i) => {
                const Icon = practice.icon;
                const isExpanded = expandedPractice === i;
                return (
                  <div
                    key={i}
                    className="border border-border rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedPractice(isExpanded ? null : i)
                      }
                      className="flex items-center gap-2 w-full p-2.5 text-left hover:bg-muted/40 transition"
                    >
                      <Icon className="w-3 h-3 text-violet-500 flex-shrink-0" />
                      <span className="flex-1 text-[11px] font-medium">
                        {practice.title}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 border-t border-border pt-2">
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          {practice.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 bg-muted/40 rounded-xl border border-border">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Target metrics
              </p>
              <div className="space-y-1">
                {[
                  { metric: "Open rate", target: "> 20%" },
                  { metric: "Hard bounce rate", target: "< 2%" },
                  { metric: "Spam complaint rate", target: "< 0.1%" },
                  { metric: "Unsubscribe rate", target: "< 0.5% per campaign" },
                ].map(({ metric, target }) => (
                  <div
                    key={metric}
                    className="flex items-center justify-between"
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {metric}
                    </span>
                    <span className="text-[10px] font-medium text-emerald-600">
                      {target}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── DNS Setup tab ── */}
        {activeTab === "dns" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Add a sending domain to Resend so your app emails arrive from
              <em> noreply@yourdomain.com</em> instead of a shared Resend address.
            </p>

            {/* ── Domain input / status ─────────────────────────────────── */}
            {!resendDomain ? (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="yourdomain.com"
                    className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={() => { void addDomain(); }}
                    disabled={!domainInput.trim()}>
                    Add domain
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{resendDomain.name}</span>
                    {resendDomain.status === "verified" ? (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full">Verified</span>
                    ) : (
                      <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-full">Pending</span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive hover:text-destructive"
                    onClick={() => { void removeDomain(); }}>
                    Remove
                  </Button>
                </div>
                {resendDomain.records && resendDomain.records.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">DNS Records to add</p>
                    {resendDomain.records.map((rec: { type: string; name: string; value: string }, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-muted/20 p-2 space-y-1 text-[10px] font-mono">
                        <div className="flex gap-2"><span className="text-muted-foreground w-10">Type</span><span>{rec.type}</span></div>
                        <div className="flex gap-2"><span className="text-muted-foreground w-10">Name</span><span className="truncate">{rec.name}</span></div>
                        <div className="flex gap-2"><span className="text-muted-foreground w-10">Value</span><span className="truncate">{rec.value}</span></div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                      onClick={() => { void verifyDomain(); }}>
                      Verify DNS records
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
