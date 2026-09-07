import { useState } from "react";
import { Check, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
  relation: string;
  dob: string;
  showDob: boolean;
}

// Gotra is a property of the FAMILY (patrilineal), not of each
// person — so it is captured ONCE here and written to every member
// row on save, instead of being asked in each member card.
interface FamilyGotra {
  value: string;
  noGotra: boolean;
}

const RELATIONS = ["Self", "Spouse", "Parent", "Child", "Other"] as const;

const emptyMember = (relation = "Self"): MemberDraft => ({
  name: "",
  relation,
  dob: "",
  showDob: false,
});

function seedMembers(existing: ExistingMember[]): MemberDraft[] {
  if (existing.length === 0) return [emptyMember("Self")];
  return [...existing]
    .sort((a, b) => a.slot_number - b.slot_number)
    .map((m) => ({
      name: m.full_name ?? "",
      relation: m.relation || "Other",
      dob: m.dob ?? "",
      showDob: !!m.dob,
    }));
}

function seedGotra(existing: ExistingMember[]): FamilyGotra {
  const withGotra = existing.find((m) => m.gotra && m.gotra.trim());
  if (withGotra) return { value: withGotra.gotra!.trim(), noGotra: false };
  // Existing members but none carries a gotra → they had chosen "nahi pata".
  if (existing.length > 0) return { value: "", noGotra: true };
  return { value: "", noGotra: false };
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
  const [gotra, setGotra] = useState<FamilyGotra>(() => seedGotra(initialMembers));
  const [address, setAddress] = useState({
    line1: initialAddress?.address_line1 ?? "",
    line2: initialAddress?.address_line2 ?? "",
    state: initialAddress?.state ?? "",
    pincode: initialAddress?.pincode ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [Save-feedback] When details already exist we open in a read-only
  // "saved" summary instead of dropping the user straight into an
  // editable form that gives no sign anything was ever stored. After a
  // successful save we also flip back here so the confirmation is
  // permanent (a 2.5s toast used to be destroyed by the parent's
  // key-based remount on /profile — the user saw nothing).
  const [mode, setMode] = useState<"view" | "edit">(
    initialMembers.length > 0 ? "view" : "edit",
  );

  const updateMember = (idx: number, patch: Partial<MemberDraft>) =>
    setMembers((ms) => ms.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const addMember = () => setMembers((ms) => (ms.length < 4 ? [...ms, emptyMember("Other")] : ms));
  const removeMember = (idx: number) =>
    setMembers((ms) => (ms.length > 1 ? ms.filter((_, i) => i !== idx) : ms));

  // Address is validated as a unit only when the user started filling it.
  // [Pass-2 residual F21] line2 counts too — an edit confined to
  // landmark/line2 must not be silently dropped on save.
  const addressTouched =
    address.line1.trim() ||
    address.line2.trim() ||
    address.state.trim() ||
    address.pincode.trim();
  const addressValid =
    !addressTouched ||
    (address.line1.trim().length >= 5 &&
      address.state.trim().length > 0 &&
      /^\d{6}$/.test(address.pincode.trim()));

  const membersFilled = members.filter((m) => m.name.trim());
  const gotraValid = gotra.noGotra || !!gotra.value.trim();
  const membersValid = membersFilled.length >= 1;

  const canSave = membersValid && gotraValid && addressValid && !busy;

  const save = async () => {
    setError(null);
    setBusy(true);
    let familySaved = false;
    try {
      await callUserApi("/api/profile/family-members", {
        subscription_id: subscriptionId,
        members: membersFilled.map((m, i) => ({
          slot_number: i + 1,
          full_name: m.name.trim(),
          // One family gotra, written to every member row.
          ...(gotra.noGotra || !gotra.value.trim() ? {} : { gotra: gotra.value.trim() }),
          relation: m.relation,
          ...(m.dob ? { dob: m.dob } : {}),
        })),
      });
      familySaved = true;
      if (addressTouched) {
        await callUserApi("/api/profile/address", {
          address_line1: address.line1.trim(),
          address_line2: address.line2.trim(),
          state: address.state.trim(),
          pincode: address.pincode.trim(),
        });
      }
      // Show the persistent saved summary immediately on THIS instance
      // (before the parent's async reload swaps in a fresh one).
      setMode("view");
      onSaved?.();
    } catch (err) {
      // [Pass-2 F21] two-step save: when the family POST already
      // landed, "nothing was saved" copy is a lie — say exactly what
      // happened so the user doesn't re-enter everything.
      const detail = err instanceof Error ? err.message : "Save nahi ho paya — dobara try karein.";
      setError(
        familySaved
          ? `Parivaar ke naam save ho gaye hain, par address mein dikkat: ${detail}`
          : detail,
      );
    } finally {
      setBusy(false);
    }
  };

  // ── Saved summary (read-only) ────────────────────────────────
  // A professional confirmation of what is on record, with an Edit
  // affordance — replaces the "did anything save?" dead-end.
  if (mode === "view") {
    const savedMembers = members.filter((m) => m.name.trim());
    const gotraLabel = gotra.noGotra
      ? "गोत्र नहीं पता"
      : gotra.value.trim()
        ? `गोत्र: ${gotra.value.trim()}`
        : null;
    const hasAddress = !!address.line1.trim();
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <ShieldCheck size={16} className="shrink-0" />
          <span className="font-semibold">आपकी जानकारी सुरक्षित है — Saved ✓</span>
        </div>

        {/* Members on record */}
        <div className="card-soft p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-brand">परिवार सदस्य (Sankalp Details)</div>
            {gotraLabel && (
              <span className="text-xs text-muted-foreground">{gotraLabel}</span>
            )}
          </div>
          <ul className="divide-y divide-black/5">
            {savedMembers.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="font-semibold text-foreground">{m.name.trim()}</span>
                <span className="text-xs text-muted-foreground">{m.relation}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Address on record */}
        {hasAddress && (
          <div className="card-soft p-4 space-y-1">
            <div className="text-sm font-bold text-brand">डिलीवरी पता (Prasad Address)</div>
            <div className="text-sm text-foreground">{address.line1.trim()}</div>
            {address.line2.trim() && (
              <div className="text-sm text-foreground">{address.line2.trim()}</div>
            )}
            <div className="text-sm text-foreground">
              {[address.state.trim(), address.pincode.trim()].filter(Boolean).join(" – ")}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setError(null);
            setMode("edit");
          }}
          className="w-full flex items-center justify-center gap-2 border-2 border-brand/40 text-brand font-bold py-3 rounded-full hover:bg-brand-soft/40 transition-colors"
        >
          <Pencil size={16} /> Details Edit karein
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Family members */}
      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-foreground">परिवार सदस्य (Sankalp Details)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            हर सेवा में इन्हीं नामों का संकल्प लिया जाएगा। अभी नहीं पता? बाद में भी जोड़ सकते हैं।
          </p>
        </div>

        {/* Gotra — asked ONCE for the whole family, not per member */}
        <div className="card-soft p-4 space-y-2">
          <label className="text-sm font-bold text-brand">गोत्र (पूरे परिवार का एक ही)</label>
          <input
            type="text"
            placeholder="जैसे: कश्यप, भारद्वाज"
            value={gotra.value}
            disabled={gotra.noGotra}
            onChange={(e) => setGotra((g) => ({ ...g, value: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground disabled:bg-secondary disabled:cursor-not-allowed"
          />
          <label className="flex items-center gap-2 text-sm text-foreground/80">
            <input
              type="checkbox"
              checked={gotra.noGotra}
              onChange={(e) =>
                setGotra((g) => ({ value: e.target.checked ? "" : g.value, noGotra: e.target.checked }))
              }
              className="accent-brand"
            />
            मुझे अपना गोत्र नहीं पता
          </label>
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
              <label className="block text-xs text-muted-foreground mb-1">रिश्ता</label>
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
            </div>

            {/* DOB — genuinely optional, hidden until asked for so an
                empty date box never looks like a broken required field */}
            {m.showDob ? (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  जन्म तिथि (optional)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={m.dob}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => updateMember(idx, { dob: e.target.value })}
                    aria-label="Date of birth (optional)"
                    className="flex-1 px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => updateMember(idx, { dob: "", showDob: false })}
                    className="text-muted-foreground text-xs px-2 py-1"
                    aria-label="Remove date of birth"
                  >
                    हटाएं
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => updateMember(idx, { showDob: true })}
                className="text-brand text-sm flex items-center gap-1"
              >
                <Plus size={14} /> जन्म तिथि जोड़ें (optional)
              </button>
            )}
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
      {/* [Pass-2 F21] explain WHY Save is disabled — a partially-filled
          address used to dead-end the button silently. */}
      {!canSave && !busy && addressTouched && !addressValid && (
        <p className="text-xs text-amber-600">
          Address poora bharein — line 1 (kam se kam 5 akshar), state aur 6-anki pincode.
        </p>
      )}
      {!canSave && !busy && !membersValid && (
        <p className="text-xs text-amber-600">Kam se kam ek sadasya ka naam likhein.</p>
      )}
      {!canSave && !busy && membersValid && !gotraValid && (
        <p className="text-xs text-amber-600">
          Gotra bharein (ya "gotra nahi pata" chunein).
        </p>
      )}

      <button
        onClick={save}
        disabled={!canSave}
        className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${
          canSave
            ? "bg-brand text-white hover:bg-brand-deep"
            : "bg-secondary text-muted-foreground cursor-not-allowed"
        }`}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
        {busy ? "Save ho raha hai…" : "Save & Continue"}
      </button>
    </div>
  );
}
