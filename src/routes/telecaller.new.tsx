import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/telecaller/new")({
  component: NewLeadPage,
});

interface CreateLeadResponse {
  existed: boolean;
  lead: { id: string; full_name: string | null; phone: string; status: string } | null;
}

function NewLeadPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateLeadResponse | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await callAdminApi<CreateLeadResponse>("/api/telecaller/create-lead", {
        full_name: name.trim(),
        phone,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lead ban nahi payi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-indigo-700" />
          Naya Customer
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Naam + phone — bas itna. Baaki details call par bhar dein.
        </p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 flex-none" />
        <span>
          🚨 <b>OTP KABHI na maangein</b> — na customer se, na kahin type karein. Is panel mein OTP
          ka koi field hai hi nahi, aur yeh kabhi nahi hoga. Lead banane se customer ko kuch nahi
          jaata — login woh khud apne OTP se karega.
        </span>
      </div>

      {!result ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Poora naam</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jaise: Ramesh Sharma"
              className="mt-1"
              maxLength={120}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Mobile number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              inputMode="tel"
              className="mt-1"
            />
          </div>
          {error && <div className="text-xs text-red-700">{error}</div>}
          <Button
            onClick={submit}
            disabled={busy || name.trim().length < 2 || phone.replace(/\D/g, "").length < 10}
            className="bg-indigo-700 hover:bg-indigo-800 gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Lead banayein
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-2xs p-5 space-y-3">
          <div className="font-semibold text-emerald-900">
            {result.existed ? "Yeh number ki open lead pehle se hai:" : "Lead ban gayi ✅"}
          </div>
          <div className="text-sm text-emerald-900">
            {result.lead?.full_name ?? "(naam nahi)"} · {result.lead?.phone}
          </div>
          {result.lead && (
            <Button asChild size="sm" className="bg-indigo-700 hover:bg-indigo-800 gap-1.5">
              <Link
                to="/telecaller/queue/$queueKey"
                params={{ queueKey: "aaj_ke_leads" }}
              >
                Aaj Ke Leads mein dekhein <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
