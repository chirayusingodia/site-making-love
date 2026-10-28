import { createFileRoute, redirect } from "@tanstack/react-router";

// Analytics now lives as the "Trends" tab of /admin/reports — this route
// only keeps old links and bookmarks working. The owner guard is on the
// target route (and its APIs), so no role check is needed here.
export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/reports", search: { tab: "trends" }, replace: true });
  },
});
