
import { useEffect,useState } from "react";
import { AnimatePresence,motion } from "framer-motion";
import { Check,Loader2,Search,ShoppingCart,X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { RegistrantContact } from "@/lib/domains/registrar";

interface DomainSuggestion {
  domain: string;
  available: boolean;
  priceCents: number;
  currency: "USD";
  years: number;
  premium?: boolean;
}

interface DomainBuyModalProps {
  open: boolean;
  projectId: string;
  defaultQuery?: string;
  onClose: () => void;
  onPurchased?: (domain: string) => void;
}

const EMPTY_CONTACT: RegistrantContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
};

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Lovable-parity in-app domain search + purchase (registrar API). */
export function DomainBuyModal({
  open,
  projectId,
  defaultQuery = "",
  onClose,
  onPurchased,
}: DomainBuyModalProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState(defaultQuery);
  const [searching, setSearching] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [registrar, setRegistrar] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DomainSuggestion[]>([]);
  const [selected, setSelected] = useState<DomainSuggestion | null>(null);
  const [contact, setContact] = useState<RegistrantContact>(EMPTY_CONTACT);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery(defaultQuery);
      setSelected(null);
      setSuggestions([]);
      setConfigured(null);
    }
  }, [open, defaultQuery]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    // Guard the in-flight request, not just the debounce timer: an older
    // availability lookup resolving late would overwrite the results for the
    // domain the user is actually typing — or repopulate a closed modal.
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/domains/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, years: 1 }),
        });
        const data = (await res.json()) as {
          configured?: boolean;
          registrar?: string;
          suggestions?: DomainSuggestion[];
          message?: string;
        };
        if (cancelled) return;
        setConfigured(data.configured ?? false);
        setRegistrar(data.registrar ?? null);
        setSuggestions(data.suggestions ?? []);
        if (data.configured === false && data.message) {
          setSuggestions([]);
        }
      } catch {
        if (cancelled) return;
        setConfigured(false);
        setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  function updateContact(field: keyof RegistrantContact, value: string) {
    setContact((c) => ({ ...c, [field]: value }));
  }

  async function handlePurchase() {
    if (!selected?.available) return;
    const required: (keyof RegistrantContact)[] = [
      "firstName", "lastName", "email", "phone", "address1", "city", "state", "postalCode", "country",
    ];
    for (const key of required) {
      if (!String(contact[key] ?? "").trim()) {
        toast({ title: "Complete registrant details", description: `Missing ${key}`, variant: "destructive" });
        return;
      }
    }
    setPurchasing(true);
    try {
      const payload = {
        projectId,
        domain: selected.domain,
        priceCents: selected.priceCents,
        years: selected.years,
        contact,
      };

      const checkoutRes = await fetch("/api/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (checkoutRes.ok) {
        const checkout = (await checkoutRes.json()) as { url?: string };
        if (checkout.url) {
          window.location.href = checkout.url;
          return;
        }
      }

      if (checkoutRes.status !== 501) {
        const err = (await checkoutRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Checkout failed (${checkoutRes.status})`);
      }

      const res = await fetch("/api/domains/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; domain?: string; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Purchase failed (${res.status})`);
      }
      toast({
        title: "Domain registered",
        description: `${data.domain} is being wired — DNS may take a few minutes.`,
      });
      onPurchased?.(data.domain ?? selected.domain);
      onClose();
    } catch (err) {
      toast({
        title: "Domain purchase failed",
        description: err instanceof Error ? err.message : "Try again or connect an existing domain.",
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold">Buy a domain</h2>
              </div>
              <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[min(80vh,640px)] overflow-y-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search myapp.com or keyword…"
                  className="pl-8 h-9 text-sm font-mono"
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {configured === false && (
                <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  In-product purchase isn&apos;t configured on this server. Set registrar credentials
                  (Name.com, Cloudflare, or IONOS) or use <strong>Connect existing domain</strong> below.
                </p>
              )}

              {registrar && configured && (
                <p className="text-[10px] text-muted-foreground">Registrar: {registrar}</p>
              )}

              {suggestions.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60">
                  {suggestions.map((s) => (
                    <button
                      key={s.domain}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setSelected(s)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                        selected?.domain === s.domain ? "bg-violet-500/10" : "hover:bg-muted/40"
                      } ${!s.available ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="font-mono text-violet-400 flex-1 truncate">{s.domain}</span>
                      {s.available ? (
                        <span className="text-muted-foreground shrink-0">
                          {formatUsd(s.priceCents)}/yr
                        </span>
                      ) : (
                        <span className="text-muted-foreground shrink-0">Taken</span>
                      )}
                      {selected?.domain === s.domain && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {selected?.available && (
                <div className="space-y-3 rounded-xl border border-border/60 p-3 bg-muted/10">
                  <p className="text-xs font-semibold">Registrant contact</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">First name</Label>
                      <Input className="h-8 text-xs" value={contact.firstName} onChange={(e) => updateContact("firstName", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Last name</Label>
                      <Input className="h-8 text-xs" value={contact.lastName} onChange={(e) => updateContact("lastName", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Email</Label>
                    <Input className="h-8 text-xs" type="email" value={contact.email} onChange={(e) => updateContact("email", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Phone</Label>
                    <Input className="h-8 text-xs" value={contact.phone} onChange={(e) => updateContact("phone", e.target.value)} placeholder="+1 555 0100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Address</Label>
                    <Input className="h-8 text-xs" value={contact.address1} onChange={(e) => updateContact("address1", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">City</Label>
                      <Input className="h-8 text-xs" value={contact.city} onChange={(e) => updateContact("city", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">State</Label>
                      <Input className="h-8 text-xs" value={contact.state} onChange={(e) => updateContact("state", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Postal</Label>
                      <Input className="h-8 text-xs" value={contact.postalCode} onChange={(e) => updateContact("postalCode", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Country (ISO)</Label>
                    <Input className="h-8 text-xs font-mono uppercase" maxLength={2} value={contact.country} onChange={(e) => updateContact("country", e.target.value.toUpperCase())} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/10">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!selected?.available || purchasing || configured === false}
                onClick={() => void handlePurchase()}
                className="gap-1.5"
              >
                {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                {selected ? `Buy ${selected.domain}` : "Select a domain"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
