-- New Lead used to create auth/profile rows. Those people never signed up;
-- turn the legacy rows into proper telecaller leads and keep them out of
-- the "Signed Up, Never Bought" queue.
INSERT INTO public.leads (
    full_name,
    phone,
    assigned_to,
    assigned_on,
    status,
    created_by,
    created_at,
    updated_at
)
SELECT
    p.full_name,
    p.phone,
    p.created_by_staff,
    (p.created_at AT TIME ZONE 'Asia/Kolkata')::date,
    'assigned',
    p.created_by_staff,
    p.created_at,
    p.created_at
FROM public.profiles p
WHERE p.created_by_staff IS NOT NULL
  AND p.phone IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.phone = p.phone
        AND l.created_by = p.created_by_staff
        AND l.status IN ('new', 'assigned', 'in_progress', 'link_sent')
  );
