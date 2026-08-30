-- §8.2 addendum — assignment audit trail.
-- Admin leads screen showed WHO the lead went to but not WHO assigned
-- it nor WHEN precisely (assigned_on was date-only). Add both, and
-- have assign_leads()/roll_over_stale_leads() keep them in sync.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

COMMENT ON COLUMN public.leads.assigned_by IS
    'The admin who ran the assignment (assign_leads RPC). NULL for leads never assigned, or reset by roll_over_stale_leads.';
COMMENT ON COLUMN public.leads.assigned_at IS
    'Precise assignment timestamp. assigned_on (date) is kept for the existing rollover-sweep day-math; this is for display.';

CREATE INDEX IF NOT EXISTS idx_leads_assigned_by ON public.leads (assigned_by);

-- ─────────────────────────────────────────────────────────────
-- assign_leads — add p_assigned_by. Signature changes (new arg),
-- so the old 2-arg overload must be dropped explicitly or it lingers
-- alongside this one.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.assign_leads(uuid, int);

CREATE FUNCTION public.assign_leads(p_telecaller uuid, p_count int, p_assigned_by uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claimed int;
BEGIN
    WITH candidates AS (
        SELECT id
          FROM public.leads
         WHERE assigned_to IS NULL
           AND status = 'new'
         ORDER BY created_at
         LIMIT GREATEST(1, LEAST(p_count, 200))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.leads l
       SET assigned_to   = p_telecaller,
           assigned_on   = CURRENT_DATE,
           assigned_at   = now(),
           assigned_by   = p_assigned_by,
           status        = 'assigned',
           updated_at    = now()
      FROM candidates c
     WHERE l.id = c.id;

    GET DIAGNOSTICS claimed = ROW_COUNT;
    RETURN claimed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_leads(uuid, int, uuid)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.assign_leads(uuid, int, uuid) IS
    'Claims the oldest unassigned new leads for one telecaller (§8.2), stamping who assigned them. Transactional + SKIP LOCKED. Returns the number claimed. EXECUTE revoked from public/anon/authenticated (C1) — callable only by the service role via POST /api/admin/leads/assign.';

-- ─────────────────────────────────────────────────────────────
-- roll_over_stale_leads — clear assigned_by/assigned_at along with
-- assigned_to/assigned_on so a rolled-back lead shows no stale owner.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roll_over_stale_leads(p_days int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    moved int;
BEGIN
    UPDATE public.leads l
       SET assigned_to = NULL,
           assigned_on = NULL,
           assigned_at = NULL,
           assigned_by = NULL,
           status      = 'new',
           updated_at  = now()
     WHERE l.status IN ('assigned', 'in_progress')
       AND l.assigned_on < CURRENT_DATE - p_days
       AND NOT EXISTS (
             SELECT 1 FROM public.call_logs cl WHERE cl.lead_id = l.id
           );
    GET DIAGNOSTICS moved = ROW_COUNT;

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (NULL, 'leads_rollover_sweep', 'leads', NULL,
            jsonb_build_object('days', p_days, 'returned', moved));
    RETURN moved;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.roll_over_stale_leads(int)
    FROM public, anon, authenticated;
