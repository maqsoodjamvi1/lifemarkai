"use client";

import { useState } from "react";
import {
  CreditCard, CheckCircle2, Lock, AlertTriangle,
  RefreshCw, Receipt, ArrowLeft, BadgeCheck, Ban,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────── */

interface Product { id: string; name: string; price: number; interval?: string; }

type PaymentProvider = "stripe" | "paddle";
type PaymentEnv     = "test" | "live";

/* ─── Constants ─────────────────────────────────────────── */

const TEST_PRODUCTS: Product[] = [
  { id: "starter",    name: "Starter",        price: 9,   interval: "/month" },
  { id: "pro",        name: "Pro",             price: 29,  interval: "/month" },
  { id: "enterprise", name: "Enterprise",      price: 99,  interval: "/month" },
  { id: "lifetime",   name: "Lifetime Access", price: 197 },
];

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", brand: "Visa",       result: "success" as const, desc: "Success"   },
  { number: "4000 0000 0000 3220", brand: "Visa",       result: "3ds"     as const, desc: "3D Secure" },
  { number: "4000 0000 0000 0002", brand: "Visa",       result: "fail"    as const, desc: "Declined"  },
  { number: "3782 822463 10005",   brand: "Amex",       result: "success" as const, desc: "Success"   },
  { number: "5555 5555 5555 4444", brand: "Mastercard", result: "success" as const, desc: "Success"   },
];

/* ─── Helpers ────────────────────────────────────────────── */

function formatCardNumber(value: string) {
  const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
  const parts: string[] = [];
  for (let i = 0; i < v.length; i += 4) parts.push(v.substring(i, i + 4));
  return parts.length ? parts.join(" ") : v;
}

/** Simulate payment: success if card matches a success test card, else fail */
function simulatePayment(cardNumber: string, amount: number): {
  success: boolean; transactionId: string; declineReason?: string;
  card?: { brand: string; last4: string }; amount: number; currency: string; processingTime: number;
} {
  const stripped = cardNumber.replace(/\s/g, "");
  const match = TEST_CARDS.find((c) => c.number.replace(/\s/g, "") === stripped);
  const success = match ? match.result === "success" : Math.random() > 0.3;
  const brand = match?.brand ?? "Visa";
  const last4 = stripped.slice(-4) || "4242";
  return {
    success,
    transactionId: `txn_${Math.random().toString(36).slice(2, 14)}`,
    declineReason: success ? undefined : "insufficient_funds",
    card: { brand, last4 },
    amount,
    currency: "usd",
    processingTime: Math.floor(200 + Math.random() * 800),
  };
}

/* ─── Component ─────────────────────────────────────────── */

export function PaymentCheckoutPanel({ projectId }: { projectId: string }) {
  const [provider,  setProvider]  = useState<PaymentProvider>("stripe");
  const [env,       setEnv]       = useState<PaymentEnv>("test");

  const [step,            setStep]            = useState<"product" | "details" | "processing" | "result">("product");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cardNumber,      setCardNumber]       = useState("");
  const [expiry,          setExpiry]           = useState("");
  const [cvc,             setCvc]              = useState("");
  const [email,           setEmail]            = useState("");
  const [result,          setResult]           = useState<ReturnType<typeof simulatePayment> | null>(null);
  const [copiedCard,      setCopiedCard]       = useState<string | null>(null);
  const [sessionId,       setSessionId]        = useState("");

  const handleCopyCard = (num: string) => {
    navigator.clipboard.writeText(num.replace(/\s/g, ""));
    setCopiedCard(num);
    setTimeout(() => setCopiedCard(null), 2000);
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    const sid = `cs_${env === "test" ? "test" : "live"}_${Math.random().toString(36).slice(2, 14)}`;
    setSessionId(sid);
    setStep("details");
  };

  const handleSubmit = async () => {
    if (!selectedProduct) return;
    setStep("processing");
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
    const res = simulatePayment(cardNumber, selectedProduct.price);
    setResult(res);
    setStep("result");
    if (res.success) {
      toast({ title: "Payment successful", description: `Transaction ID: ${res.transactionId}` });
    } else {
      toast({ title: "Payment failed", description: res.declineReason ?? "Card declined", variant: "destructive" });
    }
  };

  const reset = () => {
    setStep("product");
    setSelectedProduct(null);
    setCardNumber("");
    setExpiry("");
    setCvc("");
    setResult(null);
    setSessionId("");
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Payment Checkout Tester</span>
          </div>
        </div>
        {/* Provider + Env toggles */}
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-medium">
            {(["stripe", "paddle"] as PaymentProvider[]).map((p) => (
              <button key={p} onClick={() => setProvider(p)}
                className={`px-2.5 py-1 transition ${provider === p ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-medium">
            {(["test", "live"] as PaymentEnv[]).map((e) => (
              <button key={e} onClick={() => setEnv(e)}
                className={`px-2.5 py-1 transition ${env === e
                  ? e === "test" ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"
                  : "text-muted-foreground hover:bg-muted"}`}>
                {e === "test" ? "Test" : "Live"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Step: Product selection */}
        {step === "product" && (
          <>
            <p className="text-[10px] text-muted-foreground">Select a plan to test the checkout flow:</p>
            <div className="space-y-2">
              {TEST_PRODUCTS.map((p) => (
                <button key={p.id} onClick={() => handleSelectProduct(p)}
                  className="w-full text-left p-3 rounded-xl border border-border hover:border-ring hover:bg-muted/40 transition group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${
                        p.id === "starter"    ? "bg-blue-500"  :
                        p.id === "pro"        ? "bg-purple-500" :
                        p.id === "enterprise" ? "bg-foreground" :
                        "bg-gradient-to-r from-amber-400 to-orange-500"
                      }`}>
                        {p.name.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-foreground">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground">${p.price}</span>
                      {p.interval && <span className="text-[9px] text-muted-foreground">{p.interval}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {env === "test" && (
              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle size={10} className="text-amber-400" />
                  <span className="text-[10px] font-medium text-amber-400">Test Cards — click to pre-fill</span>
                </div>
                <div className="space-y-1">
                  {TEST_CARDS.map((card) => (
                    <button key={card.number} onClick={() => { handleCopyCard(card.number); setCardNumber(card.number); }}
                      className="flex items-center justify-between w-full p-1.5 bg-background/60 rounded border border-border hover:border-ring transition">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={9} className="text-muted-foreground" />
                        <span className="text-[10px] font-mono text-foreground">{card.number}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[7px] px-1 py-0.5 rounded-full ${
                          card.result === "success" ? "bg-green-500/20 text-green-400" :
                          card.result === "3ds"     ? "bg-blue-500/20 text-blue-400"  :
                                                     "bg-red-500/20 text-red-400"
                        }`}>{card.desc}</span>
                        {copiedCard === card.number && <CheckCircle2 size={9} className="text-green-400" />}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[8px] text-muted-foreground mt-1.5">Use any future expiry and any 3-digit CVC.</p>
              </div>
            )}
          </>
        )}

        {/* Step: Details */}
        {step === "details" && selectedProduct && (
          <div className="space-y-3">
            {/* Product summary */}
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("product")} className="p-1 hover:bg-muted rounded transition">
                  <ArrowLeft size={12} className="text-muted-foreground" />
                </button>
                <div>
                  <span className="text-[11px] font-medium text-foreground">{selectedProduct.name}</span>
                  <p className="text-[8px] text-muted-foreground">{selectedProduct.interval ? "Subscription" : "One-time"}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-foreground">${selectedProduct.price}{selectedProduct.interval}</span>
            </div>

            {sessionId && (
              <div className="flex items-center gap-1.5 p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <BadgeCheck size={10} className="text-blue-400" />
                <span className="text-[8px] text-blue-400 font-mono">Session: {sessionId.slice(-12)}</span>
              </div>
            )}

            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Card Number</label>
              <div className="relative">
                <input value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="4242 4242 4242 4242" maxLength={23}
                  className="w-full text-xs border border-border rounded-lg px-3 py-2 pl-8 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                <CreditCard size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Expiry</label>
                <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="12/28"
                  className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">CVC</label>
                <input value={cvc} onChange={(e) => setCvc(e.target.value)} placeholder="123"
                  className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 p-2 bg-muted/40 rounded">
              <Lock size={10} className="text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground">
                Simulated checkout — no real money charged.
              </span>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep("product")}
                className="flex-1 py-2 border border-border text-muted-foreground text-[11px] rounded-lg hover:bg-muted transition">
                Back
              </button>
              <button onClick={handleSubmit} disabled={!email || !cardNumber}
                className="flex-1 py-2 bg-foreground text-background text-[11px] rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Lock size={11} /> Pay ${selectedProduct.price}
              </button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-muted border-t-ring rounded-full animate-spin" />
            <p className="text-xs font-medium text-foreground">Processing payment…</p>
            <p className="text-[9px] text-muted-foreground">Connecting to {provider}…</p>
            {sessionId && <p className="text-[8px] text-muted-foreground/50 font-mono">{sessionId.slice(-16)}</p>}
          </div>
        )}

        {/* Step: Result */}
        {step === "result" && result && (
          <div className="py-4 flex flex-col items-center text-center gap-3">
            {result.success ? (
              <>
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-green-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Payment Successful!</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Test transaction recorded.</p>
                </div>
                <div className="w-full p-3 bg-muted/40 rounded-lg text-left space-y-1.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Transaction ID</span>
                    <span className="font-mono text-foreground">{result.transactionId}</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-foreground">${result.amount}.00 {result.currency.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Card</span>
                    <span className="font-mono text-foreground">{result.card?.brand} •••• {result.card?.last4}</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Processing Time</span>
                    <span className="text-foreground">{result.processingTime}ms</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-green-400 font-medium flex items-center gap-0.5">
                      <BadgeCheck size={8} /> Completed
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <Ban size={24} className="text-red-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Payment Failed</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {result.declineReason ? `Reason: ${result.declineReason}` : "Your card was declined."}
                  </p>
                </div>
                <div className="w-full p-2 bg-red-500/10 rounded-lg border border-red-500/20 text-left">
                  <div className="flex justify-between text-[9px] text-red-400">
                    <span>Transaction ID</span>
                    <span className="font-mono">{result.transactionId}</span>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 w-full">
              <button onClick={reset}
                className="flex-1 py-2 border border-border text-muted-foreground text-[11px] rounded-lg hover:bg-muted transition flex items-center justify-center gap-1">
                <RefreshCw size={11} /> Test Another
              </button>
              <button onClick={reset}
                className="flex-1 py-2 bg-foreground text-background text-[11px] rounded-lg hover:opacity-90 transition flex items-center justify-center gap-1">
                <Receipt size={11} /> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
