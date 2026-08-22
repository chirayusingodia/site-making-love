import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { callUserApi } from "@/lib/auth-api";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Profile completion form (SHARED)
//
// ONE component, TWO homes (session prompt §1 step 5):
//   • /subscription-success — right after payment
//   • /profile              — permanent "complete your family
//                             details" section until filled
//
// Fields match the product spec exactly: up to 4 family members
// (Name, Gotra + "nahi pata" checkbox, Relation, optional DOB) and
// the prasad shipping address. Everything is OPTIONAL/deferrable —
// a subscription with zero members is valid ("Sankalp Pending")
// and a sales agent may also fill these over the phone.
//
// Writes go through RLS-scoped routes:
//   POST /api/profile/family-members · POST /api/profile/address
// ─────────────────────────────────────────────────────────────

export interface ExistingMember {
  id: string;
  slot_number: number;
  full_name: string;
  gotra: string | null;
  relation: string | null;
  dob: string | null;
}

export interface ExistingAddress {
  address_line1: string | null;
  address_line2: string | null;
  state: string | null;
  pincode: string | null;
}

interface MemberDraft {
  name: string;
  gotra: string;
  noGotra: boolean;
  relation: string;
  dob: string;
}

const RELATIONS = ["Self", "Spouse", "Parent", "Child", "Other"] as const;

const emptyMember = (relation = "Self"): MemberDraft => ({
  name: "",
  gotra: "",
  noGotra: false,
  relation,
  dob: "",
});

function seedMembers(existing: ExistingMember[]): MemberDraft[] {
  if (existing.length === 0) return [emptyMember("Self")];
  return [...existing]
    .sort((a, b) => a.slot_number - b.slot_number)
    .map((m) => ({
      name: m.full_name ?? "",
      gotra: m.gotra ?? "",
      noGotra: !m.gotra,
      relation: m.relation || "Other",
      dob: m.dob ?? "",
    }));
}

export function FamilyAddressForm({
  subscriptionId,
  initialMembers,
  initialAddress,
  onSaved,
}: {
  subscriptionId: string;
  initialMembers: ExistingMember[];
  initialAddress: ExistingAddress | null;
  onSaved?: () => void;
}) {
  const [members, setMembers] = useState<MemberDraft[]>(() => seedMembers(initialMembers));
  const [address, setAddress] = useState({
    line1: initialAddress?.address_line1 ?? "",
    line2: initialAddress?.address_line2 ?? "",
    state: initialAddress?.state ?? "",
    pincode: initialAddress?.pincode ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const updateMember = (idx: number, patch: Partial<MemberDraft>) =>
    setMembers((ms) => ms.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const addMember = () => setMembers((ms) => (ms.length < 4 ? [...ms, emptyMember("Other")] : ms));
  const removeMember = (idx: number) =>
    setMembers((ms) => (ms.length > 1 ? ms.filter((_, i) => i !== idx) : ms));

  // Address is validated as a unit only when the user started filling it.
  const addressTouched = address.line1.trim() || address.state.trim() || address.pincode.trim();
  const addressValid =
    !addressTouched ||
    (address.line1.trim().length >= 5 &&
      address.state.trim().length > 0 &&
      /^\d{6}$/.test(address.pincode.trim()));

  const membersFilled = members.filter((m) => m.name.trim());
  const membersValid =
    membersFilled.length >= 1 && membersFilled.every((m) => m.noGotra || m.gotra.trim());

  const canSave = membersValid && addressValid && !busy;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await callUserApi("/api/profile/family-members", {
        subscription_id: subscriptionId,
        members: membersFilled.map((m, i) => ({
          slot_number: i + 1,
          full_name: m.name.trim(),
          ...(m.noGotra || !m.gotra.trim() ? {} : { gotra: m.gotra.trim() }),
          relation: m.relation,
          ...(m.dob ? { dob: m.dob } : {}),
        })),
      });
      if (addressTouched) {
        await callUserApi("/api/profile/address", {
          address_line1: address.line1.trim(),
          address_line2: address.line2.trim(),
          state: address.state.trim(),
          pincode: address.pincode.trim(),
        });
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save nahi ho paya — dobara try karein.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Family members */}
      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-foreground">परिवार सदस्य (Sankalp Details)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            हर सेवा में इन्हीं नाम-गोत्रों का संकल्प लिया जाएगा। अभी नहीं पता? बाद में भी जोड़ सकते
            हैं।
          </p>
        </div>

        {members.map((m, idx) => (
          <div key={idx} className="card-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-brand">सदस्य #{idx + 1}</div>
              {members.length > 1 && (
                <button
                  onClick={() => removeMember(idx)}
                  className="text-destructive text-xs flex items-center gap-1"
                  aria-label="Remove"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="पूरा नाम * (जैसे — राधा शर्मा)"
              value={m.name}
              onChange={(e) => updateMember(idx, { name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
            />

            <div>
              <input
                type="text"
                placeholder="गोत्र (जैसे: कश्यप, भारद्वाज)"
                value={m.gotra}
                disabled={m.noGotra}
                onChange={(e) => updateMember(idx, { gotra: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground disabled:bg-secondary disabled:cursor-not-allowed"
              />
              <label className="flex items-center gap-2 mt-2 text-sm text-foreground/80">
                <input
                  type="checkbox"
                  checked={m.noGotra}
                  onChange={(e) =>
                    updateMember(idx, {
                      noGotra: e.target.checked,
                      gotra: e.target.checked ? "" : m.gotra,
                    })
                  }
                  className="accent-brand"
                />
                मुझे अपना गोत्र नहीं पता
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <select
                value={m.relation}
                onChange={(e) => updateMember(idx, { relation: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground bg-white"
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={m.dob}
                onChange={(e) => updateMember(idx, { dob: e.target.value })}
                aria-label="Date of birth (optional)"
                className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
              />
            </div>
          </div>
        ))}

        {members.length < 4 && (
          <button
            onClick={addMember}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand/40 text-brand font-bold py-3 rounded-xl hover:bg-brand-soft/40 transition-colors"
          >
            <Plus size={16} /> Add Family Member ({members.length}/4)
          </button>
        )}
      </div>

      {/* Address */}
      <div className="card-soft p-4 space-y-3">
        <div>
          <div className="text-sm font-bold text-brand">डिलीवरी पता (Prasad Address)</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Premium Annual के Prasad Box की होम डिलीवरी इसी पते पर होगी।
          </p>
        </div>
        <input
          type="text"
          placeholder="मकान नंबर, गली, इलाका *"
          value={address.line1}
          onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
        />
        <input
          type="text"
          placeholder="Landmark, Area (optional)"
          value={address.line2}
          onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="राज्य * (जैसे — Rajasthan)"
            value={address.state}
            onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="Pincode *"
            maxLength={6}
            value={address.pincode}
            onChange={(e) =>
              setAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))
            }
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        onClick={save}
        disabled={!canSave}
        className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${
          canSave
            ? "bg-brand text-white hover:bg-brand-deep"
            : "bg-secondary text-muted-foreground cursor-not-allowed"
        }`}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : savedFlash ? (
          <Check size={18} />
        ) : null}
        {savedFlash ? "Save ho gaya ✓" : "Save & Continue"}
      </button>
    </div>
  );
}
