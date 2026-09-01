import { supabase } from "@/lib/supabase";

// Client-side audit trail write for admin-tier content mutations
// (page_seo, blog_posts). These tables are gated by the same
// is_admin() RLS policy as audit_logs itself, so the caller's own
// session can insert directly here — mirrors the server-only
// writeTelecallerAudit() helper in supabase-admin.server.ts, which
// can't be used from the browser bundle. Every page_seo/blog_posts
// write should call this, same "no exceptions" discipline.
export async function logAdminAudit(
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown>,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const adminId = session?.user?.id ?? null;
  const { error } = await supabase.from("audit_logs").insert({
    admin_id: adminId,
    action,
    entity,
    entity_id: entityId,
    meta,
  });
  if (error) throw new Error(`audit_logs insert failed: ${error.message}`);
}
