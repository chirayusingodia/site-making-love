import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Phone, RefreshCw, Loader2, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callAdminApi } from "@/lib/admin-api";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  StatusPill,
  TableScroll,
  type Tone,
} from "@/components/admin/admin-ui";

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
  const tone: Tone = p === "google" ? "info" : p === "phone" ? "good" : "neutral";
  return (
    <StatusPill key={p} tone={tone}>
      {p}
    </StatusPill>
  );
}

function ProviderList({ providers }: { providers: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {providers.length > 0 ? providers.map(providerBadge) : <StatusPill>unknown</StatusPill>}
    </div>
  );
}

function fmtSignedUp(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

  const dash = <span className="text-stone-400">—</span>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signed-in users"
        description={
          <>
            Har registered account — email/phone + kis method se login kiya. "Logins" tile ka wahi
            count, yahan naam/email ke saath.
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </Button>
        }
      />

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          {error}
        </Notice>
      )}

      <Panel
        title="Accounts"
        description={users ? `${filtered.length} of ${users.length}` : undefined}
        actions={
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email ya phone se search karein…"
              className="h-9 w-full rounded-md border border-stone-200 bg-white pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        }
        flush
      >
        {loading ? (
          <div className="p-4 sm:p-5 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Koi user nahi mila" />
        ) : (
          <>
            {/* Phone: stacked cards */}
            <ul className="md:hidden divide-y divide-stone-100">
              {filtered.map((u) => (
                <li key={u.id} className="px-4 py-3 space-y-1.5">
                  <div className="text-sm font-medium text-stone-900 break-all">
                    {u.email ?? dash}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                    <span className="inline-flex items-center gap-1">
                      {u.phone ? (
                        <>
                          <Phone className="w-3 h-3 text-stone-400" /> {u.phone}
                        </>
                      ) : (
                        dash
                      )}
                    </span>
                    <span>{fmtSignedUp(u.createdAt)}</span>
                  </div>
                  <ProviderList providers={u.providers} />
                </li>
              ))}
            </ul>

            {/* Tablet / desktop: table */}
            <TableScroll className="hidden md:block">
              <table className="w-full text-sm admin-table-fixed">
                <thead>
                  <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                    <th className="px-5 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Phone</th>
                    <th className="px-3 py-2.5 font-medium">Login method</th>
                    <th className="px-5 py-2.5 font-medium">Signed up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filtered.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3 text-stone-900 font-medium break-all">
                        {u.email ?? dash}
                      </td>
                      <td className="px-3 py-3 text-stone-700 whitespace-nowrap">
                        {u.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3 text-stone-400" /> {u.phone}
                          </span>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <ProviderList providers={u.providers} />
                      </td>
                      <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">
                        {fmtSignedUp(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </Panel>
    </div>
  );
}
