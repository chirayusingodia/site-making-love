import { buildTelecallerReview, weekStartIst } from "../src/lib/telecaller-review-logic.ts";
let fails = 0;
const check = (n: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); if (!ok) fails++; };

// Wed 2026-11-04 12:00 IST = 06:30Z
const NOW = Date.parse("2026-11-04T06:30:00Z");
check("week starts Monday IST", weekStartIst(NOW) === "2026-11-02");
// Sunday 23:30 IST (=18:00Z) is still the OLD week; Monday 00:30 IST (=Sun 19:00Z) is the new one.
check("Sun 23:30 IST belongs to previous week", weekStartIst(Date.parse("2026-11-01T18:00:00Z")) === "2026-10-26");
check("Mon 00:30 IST belongs to new week", weekStartIst(Date.parse("2026-11-01T19:00:00Z")) === "2026-11-02");

const T = "t1";
const e = (kind: "first_deal" | "trail", amt: number, paid: string, status = "accrued") =>
  ({ profile_id: T, kind, status, amount_paise: amt, paid_at: paid, created_at: paid });
const r = buildTelecallerReview({
  nowMs: NOW,
  weekCount: 4,
  telecallers: [{ id: T, full_name: "Asha", phone: null }, { id: "t2", full_name: "Quiet", phone: null }],
  entries: [
    e("first_deal", 8000, "2026-11-03T05:00:00Z", "held"), // this week
    e("first_deal", 8000, "2026-10-30T05:00:00Z"),          // last week
    e("trail", 2000, "2026-11-03T05:00:00Z"),
    e("trail", -2000, "2026-11-03T06:00:00Z"),              // clawback nets
    e("first_deal", 8000, "2026-10-01T05:00:00Z"),          // outside 4-week window
    e("first_deal", 8000, "2026-11-03T07:00:00Z", "void"),  // void ignored
  ],
  calls: [
    { called_by: T, outcome: "connected_interested", created_at: "2026-11-03T05:00:00Z" },
    { called_by: T, outcome: "no_answer", created_at: "2026-11-03T05:10:00Z" },
  ],
});
const a = r.people.find((p) => p.profileId === T)!;
check("4 weekly buckets, current last", r.weeks.length === 4 && r.weeks[3].current && r.weeks[3].weekStart === "2026-11-02");
check("this week: 1 conversion, 1 positive trail", a.weeks[3].conversions === 1 && a.weeks[3].trailPayments === 1);
check("this week earnings net of clawback: 8000+2000-2000", a.weeks[3].earnedPaise === 8000);
check("last week conversion counted", a.weeks[2].conversions === 1);
check("out-of-window + void rows ignored", a.totalConversions === 2);
check("calls vs connected", a.weeks[3].calls === 2 && a.weeks[3].connected === 1);
check("conv/100 connected = 2 conversions / 1 connected = 200", a.conversionPer100 === 200);
check("rolling 7d: both conversions inside last 7 days", a.last7Conversions === 2 && a.prev7Conversions === 0);
check("quiet telecaller still listed", r.people.some((p) => p.profileId === "t2" && p.totalConversions === 0));
check("team totals add up", r.totals.conversions === 2 && r.totals.earnedPaise === 16000);
console.log(fails ? `\n${fails} FAILED` : "\nALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
