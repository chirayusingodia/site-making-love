import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Mail, Phone, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callAdminApi } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/signups")({
  component: AdminSignupsPage,
});

interface SignupRow {
  id: string;
  email: string | null;
  phone: string | null;
  providers: string[];
  createdAt: string;
}

function providerBadge(p: string) {
  const cls =
    p === "google"
      ? "bg-sky-100 text-sky-800 border-sky-200"
      : p === "phone"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span key={p} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {p}
    </span>
  );
}

function AdminSignupsPage() {
  const [users, setUsers] = useState<SignupRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi<{ users: SignupRow[]; total: number }>(
        "/api/admin/signups-list",
      );
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signups load nahi hue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => (u.email ?? "").toLowerCase().includes(q) || (u.phone ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-amber-700" />
            Signed-In Users
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Har registered account — email/phone + kis method se login kiya. "Logins" tile ka wahi
            count, yahan naam/email ke saath.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </Button>
      </div>

      <Card className="border border-amber-900/10 bg-white/80 shadow-xs">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email ya phone se search karein…"
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="text-xs text-red-700 mb-3">{error}</div>}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-amber-100/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Koi user nahi mila</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-semibold">Email</th>
                    <th className="py-2 pr-4 font-semibold">Phone</th>
                    <th className="py-2 pr-4 font-semibold">Login Method</th>
                    <th className="py-2 pr-4 font-semibold">Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-slate-900 font-medium">
                        {u.email ?? <span className="text-slate-400 italic">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {u.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" /> {u.phone}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {u.providers.length > 0 ? (
                            u.providers.map(providerBadge)
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              unknown
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-500 text-xs">
                        {new Date(u.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
