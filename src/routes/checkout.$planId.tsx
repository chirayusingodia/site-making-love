import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Edit2, CreditCard, Smartphone, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { getPlan, type Plan } from "@/lib/plans";
import { Header, WhatsAppFloat } from "@/components/site-chrome";

export const Route = createFileRoute("/checkout/$planId")({
  component: CheckoutPage,
});

type Step = 1 | 2 | 3;
type Member = { name: string; gotra: string; relation: string; noGotra: boolean };
type FormData = {
  members: Member[];
  whatsapp: string;
  email: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  state: string;
  pincode: string;
};

const RELATIONS = ["Self", "Spouse", "Parent", "Child", "Other"] as const;

const emptyMember = (relation = "Self"): Member => ({ name: "", gotra: "", relation, noGotra: false });

function CheckoutPage() {
  const { planId } = Route.useParams();
  const plan: Plan | undefined = getPlan(planId);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>({
    members: [emptyMember("Self")],
    whatsapp: "",
    email: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    state: "",
    pincode: "",
  });
  const [paid, setPaid] = useState(false);

  if (!plan) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Plan not found</h1>
          <Link to="/" className="mt-4 inline-block text-brand font-semibold">Back to Plans</Link>
        </main>
      </div>
    );
  }

  const next = () => setStep((s) => Math.min(s + 1, 3) as Step);
  const prev = () => setStep((s) => Math.max(s - 1, 1) as Step);

  if (paid) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-4">
            <Check size={40} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Booking Confirmed!</h1>
          <p className="mt-3 text-muted-foreground">
            {form.members[0]?.name} जी, आपकी सेवा बुक हो गई है।<br />
            हर सेवा का Proof आपके WhatsApp (+91 {form.whatsapp}) पर भेजा जाएगा।
          </p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full">
            Back to Home <ArrowRight size={16} />
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-32 pt-4">
        <Link to="/plan/$planId" params={{ planId: plan.id }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-3">
          <ArrowLeft size={16} /> Back to Plan
        </Link>

        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s ? "bg-brand text-white" : "bg-secondary text-muted-foreground"}`}>
                {step > s ? <Check size={16} /> : s}
              </div>
              {s < 3 && <div className={`flex-1 h-1 mx-1 rounded ${step > s ? "bg-brand" : "bg-secondary"}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground font-semibold mb-6 -mt-2 px-1">
          <span className={step === 1 ? "text-brand" : ""}>Sankalp Details</span>
          <span className={step === 2 ? "text-brand" : ""}>Review Booking</span>
          <span className={step === 3 ? "text-brand" : ""}>Make Payment</span>
        </div>

        {step === 1 && <StepSankalpForm form={form} setForm={setForm} plan={plan} onNext={next} />}
        {step === 2 && <StepReview form={form} plan={plan} onNext={next} onEdit={prev} />}
        {step === 3 && <StepPayment plan={plan} onPay={() => setPaid(true)} />}
      </main>
      <WhatsAppFloat />
    </div>
  );
}

function StepSankalpForm({ form, setForm, plan, onNext }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; plan: Plan; onNext: () => void }) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const handleBlur = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const canAddMore = form.members.length < 4;
  const membersValid = form.members.every((m) => m.name.trim() && (m.noGotra || m.gotra.trim()));

  const isAddress1Valid = form.addressLine1.trim().length >= 5;
  const isStateValid = form.state.trim().length > 0;
  const isPincodeValid = /^\d{6}$/.test(form.pincode.trim());

  const address1Error = touched.addressLine1 && (!form.addressLine1.trim() ? "पता आवश्यक है" : form.addressLine1.trim().length < 5 ? "कम से कम 5 अक्षर लिखें" : "");
  const stateError = touched.state && !form.state.trim() ? "राज्य आवश्यक है" : "";
  const pincodeError = touched.pincode && (!form.pincode.trim() ? "पिन कोड आवश्यक है" : form.pincode.trim().length !== 6 ? "पिन कोड 6 अंकों का होना चाहिए" : "");

  const valid = form.whatsapp.length >= 10 && form.email.trim() && form.city.trim() && isAddress1Valid && isStateValid && isPincodeValid && membersValid;

  const updateMember = (idx: number, patch: Partial<Member>) => {
    setForm((f) => ({ ...f, members: f.members.map((m, i) => (i === idx ? { ...m, ...patch } : m)) }));
  };
  const addMember = () => setForm((f) => ({ ...f, members: [...f.members, emptyMember("Other")] }));
  const removeMember = (idx: number) => setForm((f) => ({ ...f, members: f.members.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-foreground">संकल्प विवरण (Sankalp Details)</h2>
      <p className="text-xs text-muted-foreground">
        अपने परिवार के 4 सदस्यों तक का नाम एवं गोत्र जोड़ें — हर सेवा में सबका संकल्प एक साथ बोला जाएगा।
      </p>

      {form.members.map((m, idx) => (
        <div key={idx} className="card-soft p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-brand">परिवार सदस्य #{idx + 1}</div>
            {form.members.length > 1 && (
              <button onClick={() => removeMember(idx)} className="text-destructive text-xs flex items-center gap-1" aria-label="Remove">
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-1">पूरा नाम <span className="text-destructive">*</span></label>
            <input
              type="text"
              placeholder="जैसे — राधा शर्मा"
              value={m.name}
              onChange={(e) => updateMember(idx, { name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-1">गोत्र (Gotra) <span className="text-destructive">*</span></label>
            <input
              type="text"
              placeholder="अपना गोत्र लिखें (जैसे: कश्यप, भारद्वाज)"
              value={m.gotra}
              disabled={m.noGotra}
              onChange={(e) => updateMember(idx, { gotra: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground disabled:bg-secondary disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">गोत्र आपके पूर्वजों का वंश है — यह surname नहीं है।</p>
            <label className="flex items-center gap-2 mt-2 text-sm">
              <input
                type="checkbox"
                checked={m.noGotra}
                onChange={(e) => updateMember(idx, { noGotra: e.target.checked, gotra: e.target.checked ? "" : m.gotra })}
                className="accent-brand"
              />
              मुझे अपना गोत्र नहीं पता
            </label>
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-1">सम्बन्ध (Relation)</label>
            <select
              value={m.relation}
              onChange={(e) => updateMember(idx, { relation: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground bg-white"
            >
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      ))}

      {canAddMore && (
        <button
          onClick={addMember}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand/40 text-brand font-bold py-3 rounded-xl hover:bg-brand-soft/40 transition-colors"
        >
          <Plus size={16} /> Add Family Member ({form.members.length}/4)
        </button>
      )}

      {/* Contact */}
      <div className="card-soft p-4 space-y-3">
        <div className="text-sm font-bold text-brand">Primary Contact</div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">WhatsApp Number</label>
          <input
            type="tel"
            placeholder="9876543210"
            value={form.whatsapp}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">सेवा का Video Proof इस नंबर पर भेजा जाएगा।</p>
        </div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">City</label>
          <input
            type="text"
            placeholder="जैसे — Delhi"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">
            पता (Address) <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            placeholder="मकान नंबर, गली, इलाका"
            value={form.addressLine1}
            onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
            onBlur={() => handleBlur("addressLine1")}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">प्रसाद की होम डिलीवरी इसी पते पर की जाएगी।</p>
          {address1Error && <p className="text-xs text-destructive mt-1">{address1Error}</p>}
        </div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">
            पता जारी (Landmark, Area)
          </label>
          <input
            type="text"
            placeholder=""
            value={form.addressLine2}
            onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">
            राज्य (State) <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            placeholder="जैसे — Rajasthan"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            onBlur={() => handleBlur("state")}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
          {stateError && <p className="text-xs text-destructive mt-1">{stateError}</p>}
        </div>
        <div>
          <label className="block text-sm font-bold text-foreground mb-1">
            पिन कोड (Pincode) <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="302001"
            value={form.pincode}
            onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
            onBlur={() => handleBlur("pincode")}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
          {pincodeError && <p className="text-xs text-destructive mt-1">{pincodeError}</p>}
        </div>
      </div>

      {/* Summary */}
      <div className="card-soft p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-bold text-foreground">{plan.name}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-bold text-brand">{plan.price}{plan.cycle}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span className="font-semibold text-foreground">{plan.location}</span></div>
      </div>

      <button
        disabled={!valid}
        onClick={onNext}
        className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${valid ? "bg-brand text-white hover:bg-brand-deep" : "bg-secondary text-muted-foreground cursor-not-allowed"}`}
      >
        Continue <ArrowRight size={18} />
      </button>
    </div>
  );
}

function StepReview({ form, plan, onNext, onEdit }: { form: FormData; plan: Plan; onNext: () => void; onEdit: () => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-foreground">Review Booking</h2>
      <div className="card-soft p-4 space-y-3 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">परिवार सदस्य ({form.members.length})</span>
          <button onClick={onEdit} className="flex items-center gap-1 text-brand font-semibold text-xs"><Edit2 size={12} /> Edit</button>
        </div>
        <div className="border-t border-black/5 pt-3 space-y-2">
          {form.members.map((m, i) => (
            <div key={i} className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{i + 1}. {m.relation}</span>
              <span className="font-bold text-right">{m.name} <span className="font-normal text-muted-foreground">· {m.noGotra ? "अज्ञात गोत्र" : m.gotra}</span></span>
            </div>
          ))}
        </div>
        <div className="border-t border-black/5 pt-3 space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp</span><span className="font-bold">+91 {form.whatsapp}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">City</span><span className="font-bold">{form.city}</span></div>
        </div>
      </div>

      <div className="card-soft p-4 space-y-3">
        <div className="text-sm font-bold text-foreground">{plan.name}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-brand">{plan.price}</span>
          <span className="text-sm text-muted-foreground">{plan.cycle}</span>
          {plan.strikePrice && <span className="text-sm text-muted-foreground line-through">{plan.strikePrice}</span>}
        </div>
        <div className="border-t border-black/5 pt-3 space-y-1.5">
          {plan.features.map((f) => (
            <div key={f} className="flex items-start gap-2 text-sm">
              <Check size={14} className="text-success shrink-0 mt-0.5" />
              <span className="text-foreground/85">{f}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onNext} className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3.5 rounded-full hover:bg-brand-deep transition-colors">
        Confirm & Proceed <ArrowRight size={18} />
      </button>
    </div>
  );
}

function StepPayment({ plan, onPay }: { plan: Plan; onPay: () => void }) {
  const [method, setMethod] = useState<"upi" | "card">("upi");
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-foreground">Make Payment</h2>
      <div className="card-soft p-5 text-center space-y-3">
        <div className="text-xs text-muted-foreground">Amount to pay</div>
        <div className="text-4xl font-bold text-brand">{plan.price}<span className="text-sm text-muted-foreground font-medium">{plan.cycle}</span></div>
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck size={14} className="text-success" /> 100% Secure Payment via Razorpay
        </div>
      </div>

      <div className="card-soft overflow-hidden">
        <button onClick={() => setMethod("upi")} className={`w-full flex items-center gap-3 px-4 py-4 border-b border-black/5 ${method === "upi" ? "bg-brand-soft" : ""}`}>
          <Smartphone size={20} className={method === "upi" ? "text-brand" : "text-muted-foreground"} />
          <span className={`font-semibold ${method === "upi" ? "text-brand" : "text-foreground"}`}>UPI / Google Pay / PhonePe</span>
          {method === "upi" && <Check size={18} className="text-brand ml-auto" />}
        </button>
        <button onClick={() => setMethod("card")} className={`w-full flex items-center gap-3 px-4 py-4 ${method === "card" ? "bg-brand-soft" : ""}`}>
          <CreditCard size={20} className={method === "card" ? "text-brand" : "text-muted-foreground"} />
          <span className={`font-semibold ${method === "card" ? "text-brand" : "text-foreground"}`}>Debit/Credit Card</span>
          {method === "card" && <Check size={18} className="text-brand ml-auto" />}
        </button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground italic">
        * Static payment mockup — Razorpay will be wired later.
      </p>

      <button onClick={onPay} className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3.5 rounded-full hover:bg-brand-deep transition-colors">
        Pay {plan.price} <ArrowRight size={18} />
      </button>
    </div>
  );
}
