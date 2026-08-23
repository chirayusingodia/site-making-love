import { createFileRoute, redirect } from "@tanstack/react-router";

// /telecaller → /telecaller/queues. The panel's home is the queue
// stack — log in, one click, start dialling (§3).
export const Route = createFileRoute("/telecaller/")({
  beforeLoad: async () => {
    throw redirect({ to: "/telecaller/queues" });
  },
});
