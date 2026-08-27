import type { SupabaseClient } from "@supabase/supabase-js";
import { monthWindow } from "@/lib/reports-logic";
import { fetchAllRows } from "@/lib/supabase";
import {
  assignQueues,
  bannerForQueue,
  isTelecallerQueueKey,
  nextBatchCutoff,
  QUEUE_META,
  TC_CALLLOG_COLS,
  TC_FAMILY_COLS,
  TC_PAYMENT_COLS,
  TC_PLAN_COLS,
  TC_PROFILE_COLS,
  TC_SUBSCRIPTION_COLS,
  TELECALLER_QUEUE_KEYS,
  type NextBatchInfo,
  type QueueAssignment,
  type QueuesResponse,
  type TelecallerCallLogLite,
  type TelecallerLeadRow,
  type TelecallerQueueKey,
  type TelecallerQueueRow,
} from "@/lib/telecaller-logic";

// Server-only data assembly behind /api/telecaller/*. Runs on the
// SERVICE-ROLE client (the telecaller has no table grants); every
// .select() below is built from the explicit column allowlists in
// telecaller-logic.ts — NEVER select("*"), so a future financial
// column cannot ride along into a response by default.

const HOUR_MS = 3_600_000;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

/**
 * Supabase's builder types don't structurally match fetchAllRows'
 * callback signature (its error union carries extra fields, and
 * untyped-schema tables resolve rows to a string-error union).
 * Every query here is allowlisted and hand-shaped anyway, so this
 * adapter is the honest boundary — same escape hatch the payments
 * list route takes with `any`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;

function asRows<T>(
  builder: AnyBuilder,
): PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  return builder;
}

interface ViewRow {
  subscription_id: string;
  user_id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  sub_created_at: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_billing_period: string | null;
}

export interface ProfileLite {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  address_line2: string | null;
  pincode: string | null;
  preferred_language: string | null;
  do_not_call: boolean;
  last_called_at: string | null;
  created_at: string;
}

interface PaymentLite {
  subscription_id: string;
  status: string;
  method: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface MemberRow {
  subscription_id: string;
  full_name: string | null;
  gotra: string | null;
  relation: string | null;
}

function buildRow(
  v: ViewRow | null,
  profile: ProfileLite,
  members: MemberRow[],
  payment: PaymentLite | null,
  prasadPlanIds: Set<string>,
): TelecallerQueueRow {
  return {
    subscriptionId: v?.subscription_id ?? null,
    profileId: profile.id,
    fullName: profile.full_name,
    phone: profile.phone,
    city: profile.city,
    state: profile.state,
    preferredLanguage: profile.preferred_language,
    doNotCall: profile.do_not_call,
    addressLine1: profile.address_line1,
    addressLine2: profile.address_line2,
    pincode: profile.pincode,
    lastCalledAt: profile.last_called_at,
    profileCreatedAt: profile.created_at,

    subscriptionStatus: v?.status ?? null,
    subscriptionCreatedAt: v?.sub_created_at ?? null,
    startDate: v?.start_date ?? null,
    nextBillingDate: v?.next_billing_date ?? null,
    pausedAt: v?.paused_at ?? null,
    cancelledAt: v?.cancelled_at ?? null,
    cancelReason: v?.cancel_reason ?? null,

    planName: v?.plan_name ?? null,
    planBillingPeriod: v?.plan_billing_period ?? null,
    hasPrasadAddon: v?.plan_id ? prasadPlanIds.has(v.plan_id) : false,

    familyMemberCount: members.length,
    members: members.map((m) => ({ fullName: m.full_name, gotra: m.gotra, relation: m.relation })),

    // STATUS WORD ONLY — amount_paise is not even fetched.
    latestPaymentStatus:
      payment && ["captured", "failed", "pending", "refunded"].includes(payment.status)
        ? (payment.status as "captured" | "failed" | "pending" | "refunded")
        : null,
    latestPaymentMethod: payment?.method ?? null,
    latestPaymentPaidAt: payment?.paid_at ?? null,
    latestPaymentFailureReason: payment?.failure_reason ?? null,
  };
}

/**
 * Loads everything the queue engine needs and merges it into the
 * pure row shape. Deliberately plain: one paged scan per table,
 * joined in memory — the business is thousands of rows, not
 * millions, and every queue stays derived from live data (no
 * flags, no cache, nothing that can drift).
 */
export async function loadTelecallerDataset(db: SupabaseClient): Promise<{
  rows: TelecallerQueueRow[];
  logs: TelecallerCallLogLite[];
}> {
  const [viewRes, profilesRes, paymentsRes, logsRes, membersRes, addonsRes] = await Promise.all([
    fetchAllRows<ViewRow>((from, to) =>
      asRows<ViewRow>(
        db
          .from("subscriber_list_view")
          // Allowlist discipline starts at the view too — plan_price_
          // paise / coupon_* / razorpay_sub_id exist on this view and
          // are deliberately NOT selected.
          .select(
            "subscription_id,user_id,status,start_date,next_billing_date,paused_at," +
              "cancelled_at,cancel_reason,sub_created_at,plan_id,plan_name,plan_billing_period",
          )
          .range(from, to),
      ),
    ),
    fetchAllRows<ProfileLite>((from, to) =>
      asRows<ProfileLite>(db.from("profiles").select(TC_PROFILE_COLS).range(from, to)),
    ),
    fetchAllRows<PaymentLite>((from, to) =>
      asRows<PaymentLite>(
        db
          .from("payments")
          .select(`${TC_PAYMENT_COLS}, id`)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ),
    fetchAllRows<TelecallerCallLogLite>((from, to) =>
      asRows<TelecallerCallLogLite>(
        db
          .from("call_logs")
          .select("subscription_id,profile_id,outcome,callback_at,created_at")
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ),
    fetchAllRows<MemberRow>((from, to) =>
      asRows<MemberRow>(
        db.from("family_members").select(TC_FAMILY_COLS).order("slot_number").range(from, to),
      ),
    ),
    fetchAllRows<{ plan_id: string }>((from, to) =>
      asRows<{ plan_id: string }>(
        db
          .from("plan_addons")
          .select("plan_id")
          .eq("addon_type", "prasad")
          .eq("is_active", true)
          .range(from, to),
      ),
    ),
  ]);

  const firstError = [viewRes, profilesRes, paymentsRes, logsRes, membersRes, addonsRes]
    .map((r) => r.error)
    .find(Boolean);
  if (firstError) throw new Error(`telecaller dataset: ${firstError}`);

  const profilesById = new Map(profilesRes.data.map((p) => [p.id, p]));

  // Latest payment per subscription (payments arrive newest-first).
  const latestPaymentBySub = new Map<string, PaymentLite>();
  for (const p of paymentsRes.data) {
    if (!latestPaymentBySub.has(p.subscription_id)) latestPaymentBySub.set(p.subscription_id, p);
  }

  const membersBySub = new Map<string, MemberRow[]>();
  for (const m of membersRes.data) {
    let bucket = membersBySub.get(m.subscription_id);
    if (!bucket) {
      bucket = [];
      membersBySub.set(m.subscription_id, bucket);
    }
    bucket.push(m);
  }

  const prasadPlanIds = new Set(addonsRes.data.map((a) => a.plan_id));

  const rows: TelecallerQueueRow[] = [];
  const usersWithSubs = new Set<string>();

  for (const v of viewRes.data) {
    usersWithSubs.add(v.user_id);
    const profile = profilesById.get(v.user_id);
    if (!profile || profile.do_not_call === true) continue; // DND or legacy partial state
    rows.push(
      buildRow(
        v,
        profile,
        membersBySub.get(v.subscription_id) ?? [],
        latestPaymentBySub.get(v.subscription_id) ?? null,
        prasadPlanIds,
      ),
    );
  }

  // Queue #5 — signed up, never bought: bare user-role profiles with
  // zero subscription rows. Staff/agent accounts are excluded by the
  // role='user' filter; DNC'd leads are excluded by their flag.
  const leadRes = await fetchAllRows<ProfileLite>((from, to) =>
    asRows<ProfileLite>(
      db.from("profiles").select(`${TC_PROFILE_COLS}, role`).eq("role", "user").range(from, to),
    ),
  );
  if (leadRes.error) throw new Error(`telecaller dataset: ${leadRes.error}`);
  for (const profile of leadRes.data) {
    if (usersWithSubs.has(profile.id)) continue;
    rows.push(buildRow(null, profile, [], null, prasadPlanIds));
  }

  return { rows, logs: logsRes.data };
}

/** Counts payload for the queue-stack home page (§3). */
export async function computeQueuesResponse(
  db: SupabaseClient,
  callerId: string,
): Promise<QueuesResponse> {
  const [dataset, leadBundle] = await Promise.all([
    loadTelecallerDataset(db),
    loadTodaysLeads(db, callerId),
  ]);
  const assignment: QueueAssignment = assignQueues({
    rows: dataset.rows,
    logs: dataset.logs,
    nowMs: Date.now(),
  });
  const batch: NextBatchInfo = nextBatchCutoff(new Date());
  const counts = Object.fromEntries(
    Object.entries(assignment).map(([k, v]) => [k, v.length]),
  ) as Record<TelecallerQueueKey, number>;
  counts.aaj_ke_leads = leadBundle.leads.length;

  return {
    queues: TELECALLER_QUEUE_KEYS.map((key) => ({
      key,
      title: QUEUE_META[key].title,
      why: QUEUE_META[key].why,
      count: counts[key] ?? 0,
    })),
    nextBatch: batch,
    cutoffHoursRemaining: Math.max(0, Math.round((batch.cutoffAtMs - Date.now()) / HOUR_MS)),
  };
}

// ─── Queue 0 — Aaj ke leads (§8) ─────────────────────────────

/**
 * C2 (REVIEW_TELECALLER_SESSION.md): log-call / person /
 * family-members / proof-resend accepted ANY well-formed uuid, and
 * call_logs is the commission key — a scripted sweep of `no_answer`
 * over the whole never_bought queue farmed the 30-day attribution
 * window, and a second sweep latched do_not_call across the base.
 *
 * Fail-closed eligibility ("is this person in HER tray?"):
 *   • lead context      → the lead must be assigned to her or
 *                         self-created by her (§9.2);
 *   • subscription path → an assigned/created lead linked to that
 *                         subscriber, or a prior call_logs row SHE owns;
 *   • bare profile      → same two proofs; nothing else.
 * admin/owner seats bypass (Chirayu sits in the same queues, §0).
 * Subscriber-derived QUEUES stay shared by design — the fraud vector
 * was bare-profile farming, not shared subscriber work.
 */
export async function isInCallersTray(
  db: SupabaseClient,
  callerId: string,
  privilegedSeat: boolean,
  target: { subscriptionId?: string | null; profileId?: string | null; leadId?: string | null },
): Promise<boolean> {
  if (privilegedSeat) return true;

  // Lead context: hers or self-created.
  if (target.leadId) {
    const { data: lead } = await db
      .from("leads")
      .select("assigned_to,created_by")
      .eq("id", target.leadId)
      .maybeSingle();
    return Boolean(lead && (lead.assigned_to === callerId || lead.created_by === callerId));
  }

  const profileId = target.profileId ?? null;
  const subscriptionId = target.subscriptionId ?? null;
  if (!profileId && !subscriptionId) return false;

  let resolvedProfileId = profileId;
  if (!resolvedProfileId && subscriptionId) {
    const { data: sub } = await db
      .from("subscriptions")
      .select("user_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub) return false;
    resolvedProfileId = sub.user_id as string;
  }

  // (a) An open/any lead of HERS linked to this person.
  const leadFilter = subscriptionId
    ? `profile_id.eq.${resolvedProfileId},subscription_id.eq.${subscriptionId}`
    : `profile_id.eq.${resolvedProfileId}`;
  const { data: leadHit } = await db
    .from("leads")
    .select("id")
    .or(`assigned_to.eq.${callerId},created_by.eq.${callerId}`)
    .or(leadFilter)
    .limit(1);
  if (leadHit && leadHit.length > 0) return true;

  // (b) A prior call_logs row SHE owns for this person.
  const logFilter = subscriptionId
    ? `profile_id.eq.${resolvedProfileId},subscription_id.eq.${subscriptionId}`
    : `profile_id.eq.${resolvedProfileId}`;
  const { data: logHit } = await db
    .from("call_logs")
    .select("id")
    .eq("called_by", callerId)
    .or(logFilter)
    .limit(1);
  if (logHit && logHit.length > 0) return true;

  // (c) Subscriber-pipeline rows (real subscriptions) remain shared
  // work for every panel seat — never_bought BARE profiles are the
  // farmable surface and they fail all three tests above.
  if (subscriptionId) {
    const { data: subRow } = await db
      .from("subscriptions")
      .select("status")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (subRow?.status) return true;
  }

  return false;
}

function istDayStartIso(): { ymd: string; dayStartIso: string } {
  const istDay = new Date(Date.now() + IST_OFFSET_MS);
  const ymd = istDay.toISOString().slice(0, 10);
  return {
    ymd,
    dayStartIso: new Date(Date.parse(`${ymd}T00:00:00Z`) - IST_OFFSET_MS).toISOString(),
  };
}

/**
 * Leads assigned to HER today (§3 queue 0), unworked first.
 *
 * GRACEFUL DEGRADATION: Part A ships before migration 013 creates
 * the `leads` table. Until it exists this returns [] instead of
 * failing every panel request — the rest of the queues are
 * subscriber-derived and must keep working. Any error that is NOT
 * a missing-table error is rethrown (a real bug should be loud).
 */
export async function loadTodaysLeads(
  db: SupabaseClient,
  callerId: string,
): Promise<{ leads: TelecallerLeadRow[]; workedLeadIds: Set<string> }> {
  const { dayStartIso } = istDayStartIso();

  interface LeadDbRow {
    id: string;
    full_name: string | null;
    phone: string;
    city: string | null;
    notes: string | null;
    family_names: string[] | null;
    status: string;
    profile_id: string | null;
    attribution_token: string | null;
    assigned_on: string | null;
    created_at: string;
    plans: { name: string } | null;
  }

  let leadRows: LeadDbRow[];
  try {
    const res = await fetchAllRows<LeadDbRow>((from, to) =>
      asRows<LeadDbRow>(
        db
          .from("leads")
          .select(
            "id,full_name,phone,city,notes,family_names,status,profile_id,attribution_token," +
              "assigned_on,created_at,plans(name)",
          )
          .eq("assigned_to", callerId)
          .gte("assigned_on", dayStartIso.slice(0, 10))
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
    );
    if (res.error) {
      // Migration 020 lagging behind the deploy: without the column the
      // whole tray would 500. Retry WITHOUT it — family names degrade
      // to null instead of taking Aaj Ke Leads down.
      if (!/family_names/i.test(res.error)) throw new Error(res.error);
      const retry = await fetchAllRows<LeadDbRow>((from, to) =>
        asRows<LeadDbRow>(
          db
            .from("leads")
            .select(
              "id,full_name,phone,city,notes,status,profile_id,attribution_token," +
                "assigned_on,created_at,plans(name)",
            )
            .eq("assigned_to", callerId)
            .gte("assigned_on", dayStartIso.slice(0, 10))
            .order("created_at", { ascending: true })
            .range(from, to),
        ),
      );
      if (retry.error) throw new Error(retry.error);
      leadRows = retry.data.map((r) => ({ ...r, family_names: null }));
    } else {
      leadRows = res.data;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation|schema cache|could not find the table|does not exist/i.test(msg)) {
      return { leads: [], workedLeadIds: new Set() }; // pre-migration-013 reality
    }
    throw err;
  }

  const ids = leadRows.map((l) => l.id);
  const worked = new Set<string>();
  if (ids.length > 0) {
    const { data: logs, error } = await db
      .from("call_logs")
      .select("lead_id")
      .in("lead_id", ids)
      .gte("created_at", dayStartIso);
    if (!error && logs) {
      for (const l of logs as { lead_id: string | null }[]) {
        if (l.lead_id) worked.add(l.lead_id);
      }
    }
  }

  // Unworked first — the whole point of the daily target board.
  const leads: TelecallerLeadRow[] = leadRows.map((l) => ({
    leadId: l.id,
    fullName: l.full_name,
    phone: l.phone,
    city: l.city,
    notes: l.notes,
    familyNames: Array.isArray(l.family_names) ? l.family_names : null,
    status: l.status,
    interestedPlanName: l.plans?.name ?? null,
    profileId: l.profile_id,
    attributionToken: l.attribution_token,
    assignedOn: l.assigned_on,
    createdAt: l.created_at,
  }));
  leads.sort((a, b) => Number(worked.has(a.leadId)) - Number(worked.has(b.leadId)));

  return { leads, workedLeadIds: worked };
}

// ─── Person card (§6.4 — the screen she lives on) ────────────

export interface FamilyMemberFull {
  id: string;
  subscription_id: string;
  full_name: string | null;
  gotra: string | null;
  relation: string | null;
  slot_number: number;
  dob: string | null;
}

export interface CallLogRow {
  id: string;
  subscription_id: string | null;
  profile_id: string | null;
  called_by: string;
  queue: string | null;
  outcome: string;
  notes: string | null;
  callback_at: string | null;
  identity_verified: boolean;
  escalated: boolean;
  created_at: string;
}

export interface SubscriptionStatusLite {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  plan_name: string | null;
  plan_billing_period: string | null;
}

export interface PersonCardPayload {
  row: TelecallerQueueRow;
  /** Hinglish "why you're calling" line for the queue she came from. */
  banner: string;
  familyMembers: FamilyMemberFull[];
  latestPayment: {
    status: string;
    method: string | null;
    paid_at: string | null;
    failure_reason: string | null;
  } | null;
  planAddons: string[];
  planSevaNames: string[];
  proofsThisMonth:
    | {
        batchType: string;
        batchDate: string;
        commonDelivered: boolean;
        segmentDelivered: boolean;
      }[]
    | null;
  callHistory: CallLogRow[];
  subscriptions: SubscriptionStatusLite[];
  /** Identity of the NEXT row in the same queue (auto-advance, §6.4). */
  nextInQueue: string | null;
}

function statusRank(status: string | null): number {
  switch (status) {
    case "active":
      return 0;
    case "pending":
      return 1;
    case "paused":
      return 2;
    case "cancelled":
      return 3;
    default:
      return 4;
  }
}

/**
 * Everything the call card renders for ONE person, fetched with
 * allowlisted columns only. `subscriptionId` and/or `profileId`
 * identify her; `queue` (optional) supplies the Hinglish banner
 * context + the auto-advance target.
 */
export async function fetchPersonCard(
  db: SupabaseClient,
  opts: { subscriptionId?: string; profileId?: string; queue?: unknown },
): Promise<PersonCardPayload | null> {
  const queueKey = isTelecallerQueueKey(opts.queue) ? opts.queue : null;

  // ── Resolve subscription(s) + profile ────────────────────────
  interface SubRow extends SubscriptionStatusLite {
    user_id: string;
    plan_id: string | null;
  }

  let subs: SubRow[] = [];
  let profileId: string | null = opts.profileId ?? null;

  if (opts.subscriptionId) {
    const { data, error } = await db
      .from("subscriptions")
      .select(`${TC_SUBSCRIPTION_COLS}, plans(${TC_PLAN_COLS}), plan_id`)
      .eq("id", opts.subscriptionId)
      .maybeSingle();
    if (error) throw new Error(`subscription: ${error.message}`);
    if (!data) return null;
    const s = data as unknown as SubRow & {
      plans: { name: string; billing_period: string } | null;
    };
    profileId = s.user_id;
    subs = [
      {
        id: s.id,
        status: s.status,
        start_date: s.start_date,
        next_billing_date: s.next_billing_date,
        paused_at: s.paused_at,
        cancelled_at: s.cancelled_at,
        cancel_reason: s.cancel_reason,
        created_at: s.created_at,
        plan_name: s.plans?.name ?? null,
        plan_billing_period: s.plans?.billing_period ?? null,
        user_id: s.user_id,
        plan_id: s.plan_id,
      },
    ];
  } else if (profileId) {
    const { data, error } = await db
      .from("subscriptions")
      .select(`${TC_SUBSCRIPTION_COLS}, plans(${TC_PLAN_COLS}), plan_id`)
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`subscriptions: ${error.message}`);
    subs = (
      (data ?? []) as unknown as (SubRow & {
        plans: { name: string; billing_period: string } | null;
      })[]
    ).map((s) => ({
      id: s.id,
      status: s.status,
      start_date: s.start_date,
      next_billing_date: s.next_billing_date,
      paused_at: s.paused_at,
      cancelled_at: s.cancelled_at,
      cancel_reason: s.cancel_reason,
      created_at: s.created_at,
      plan_name: s.plans?.name ?? null,
      plan_billing_period: s.plans?.billing_period ?? null,
      user_id: s.user_id,
      plan_id: s.plan_id,
    }));
  } else {
    return null;
  }

  const primary = [...subs].sort((a, b) => statusRank(a.status) - statusRank(b.status))[0] ?? null;

  const { data: profile, error: profErr } = await db
    .from("profiles")
    .select(TC_PROFILE_COLS)
    .eq("id", profileId!)
    .maybeSingle();
  if (profErr) throw new Error(`profile: ${profErr.message}`);
  if (!profile) return null;

  const primarySubId = primary?.id ?? null;
  const primaryPlanId = primary?.plan_id ?? null;

  // ── Parallel detail reads (all allowlisted columns) ──────────
  const [membersRes, paymentRes, addonsRes, sevasRes, historyRes] = await Promise.all([
    primarySubId
      ? db
          .from("family_members")
          .select(TC_FAMILY_COLS)
          .eq("subscription_id", primarySubId)
          .order("slot_number")
      : Promise.resolve({ data: [], error: null }),
    primarySubId
      ? db
          .from("payments")
          .select(TC_PAYMENT_COLS)
          .eq("subscription_id", primarySubId)
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    primaryPlanId
      ? db
          .from("plan_addons")
          .select("addon_type")
          .eq("plan_id", primaryPlanId)
          .eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    primaryPlanId
      ? db.from("plan_sevas").select("sevas(name)").eq("plan_id", primaryPlanId)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("call_logs")
      .select(TC_CALLLOG_COLS)
      .or(
        primarySubId
          ? `subscription_id.eq.${primarySubId},profile_id.eq.${profileId}`
          : `profile_id.eq.${profileId}`,
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  for (const res of [membersRes, paymentRes, addonsRes, sevasRes, historyRes]) {
    if (res.error) throw new Error(`person card: ${res.error.message}`);
  }

  // ── This month's proof deliveries (§4: delivered flag only) ──
  let proofsThisMonth: PersonCardPayload["proofsThisMonth"] = null;
  if (primarySubId) {
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const win = monthWindow(
      `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    const { data: batches, error: bErr } = await db
      .from("sankalp_batches")
      .select("id,batch_type,batch_date")
      .gte("batch_date", win.first)
      .lte("batch_date", win.last);
    if (bErr) throw new Error(`batches: ${bErr.message}`);
    if (batches && batches.length > 0) {
      const ids = batches.map((b) => b.id);
      const { data: memberships, error: mErr } = await db
        .from("sankalp_batch_subscriptions")
        .select("batch_id")
        .eq("subscription_id", primarySubId)
        .in("batch_id", ids);
      if (mErr) throw new Error(`batch membership: ${mErr.message}`);
      const memberIds = (memberships ?? []).map((m) => m.batch_id);
      if (memberIds.length > 0) {
        const { data: deliveries, error: dErr } = await db
          .from("proof_deliveries")
          .select("batch_id,message_kind,is_delivered")
          .eq("subscription_id", primarySubId)
          .in("batch_id", memberIds);
        if (dErr) throw new Error(`proof deliveries: ${dErr.message}`);
        proofsThisMonth = batches
          .filter((b) => memberIds.includes(b.id))
          .map((b) => {
            const mine = (deliveries ?? []).filter((d) => d.batch_id === b.id);
            const kind = (k: string) =>
              mine.find((d) => d.message_kind === k)?.is_delivered ?? false;
            return {
              batchType: b.batch_type,
              batchDate: b.batch_date,
              commonDelivered: kind("common"),
              segmentDelivered: kind("segment"),
            };
          });
      }
    }
  }

  const viewLike = primary
    ? {
        subscription_id: primary.id,
        user_id: primary.user_id,
        status: primary.status,
        start_date: primary.start_date,
        next_billing_date: primary.next_billing_date,
        paused_at: primary.paused_at,
        cancelled_at: primary.cancelled_at,
        cancel_reason: primary.cancel_reason,
        sub_created_at: primary.created_at,
        plan_id: primary.plan_id,
        plan_name: primary.plan_name,
        plan_billing_period: primary.plan_billing_period,
      }
    : null;

  const members = (membersRes.data ?? []) as unknown as MemberRow[];
  const payment = (paymentRes.data ?? [])[0] as PaymentLite | undefined;
  const prasadAddonRows = (addonsRes.data ?? []) as { addon_type: string }[];

  const row = buildRow(
    viewLike,
    profile as unknown as ProfileLite,
    members,
    payment ?? null,
    new Set(),
  );
  // Addon types ride separately (the row carries only the prasad flag).
  row.hasPrasadAddon = prasadAddonRows.some((a) => a.addon_type === "prasad");

  // Auto-advance target within the queue she came from.
  let nextInQueue: string | null = null;
  if (queueKey && row.subscriptionId !== null) {
    const dataset = await loadTelecallerDataset(db);
    const assignment = assignQueues({
      rows: dataset.rows,
      logs: dataset.logs,
      nowMs: Date.now(),
    });
    const list = assignment[queueKey];
    const idx = list.findIndex((r) => r.subscriptionId === row.subscriptionId);
    if (idx >= 0 && idx + 1 < list.length) {
      nextInQueue = list[idx + 1].subscriptionId;
    }
  }

  return {
    row,
    banner: queueKey
      ? bannerForQueue(queueKey, row)
      : "Sankalp details adhoore hain — card dekh kar baat karein",
    familyMembers: (membersRes.data ?? []) as unknown as FamilyMemberFull[],
    latestPayment: payment
      ? {
          status: payment.status,
          method: payment.method,
          paid_at: payment.paid_at,
          failure_reason: payment.failure_reason,
        }
      : null,
    planAddons: prasadAddonRows.map((a) => a.addon_type),
    planSevaNames: ((sevasRes.data ?? []) as unknown as { sevas: { name: string } | null }[])
      .map((s) => s.sevas?.name ?? "")
      .filter(Boolean),
    proofsThisMonth,
    callHistory: (historyRes.data ?? []) as unknown as CallLogRow[],
    subscriptions: subs.map(({ user_id: _u, plan_id: _p, ...rest }) => rest),
    nextInQueue,
  };
}
