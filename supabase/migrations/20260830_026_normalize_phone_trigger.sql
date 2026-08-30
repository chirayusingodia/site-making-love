-- =============================================================
-- PUNYATA — DB-level phone normalization (defense in depth)
-- Created : 2026-08-30
-- =============================================================
--
-- Root cause of the Chirayu duplicate-account incident: profiles.phone
-- is `UNIQUE text`, which only dedupes two identical raw strings.
-- "+918005828548" and "8005828548" are the same Indian mobile number
-- but different strings, so the UNIQUE constraint never caught the
-- collision — it only worked because every CURRENT app write path
-- (src/lib/auth.server.ts, complete-google-profile.ts, identity.ts)
-- happens to call normalizePhoneE164() first. That's an app-level
-- convention, not a guarantee: one missed call site (admin edit,
-- lead-conversion script, a one-off SQL fix) and a new duplicate can
-- reappear the same way.
--
-- This migration moves the same normalization
-- (src/lib/phone.ts:normalizePhoneE164 — keep both in sync) into a
-- BEFORE INSERT/UPDATE trigger on public.profiles, so it is
-- structurally impossible to store "+918005828548" and "8005828548"
-- as two different values no matter which code path — or human
-- running raw SQL — writes the row. The UNIQUE constraint then does
-- its job on a value that's always already canonical.
-- =============================================================

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    digits text;
BEGIN
    IF p_raw IS NULL THEN
        RETURN NULL;
    END IF;

    digits := regexp_replace(p_raw, '\D', '', 'g');

    IF length(digits) = 10 AND digits ~ '^[6-9]' THEN
        RETURN '+91' || digits;
    ELSIF length(digits) = 11 AND left(digits, 1) = '0' AND substring(digits from 2) ~ '^[6-9]' THEN
        RETURN '+91' || substring(digits from 2);
    ELSIF length(digits) = 12 AND left(digits, 2) = '91' AND substring(digits from 3) ~ '^[6-9]' THEN
        RETURN '+' || digits;
    ELSIF length(digits) = 13 AND left(digits, 3) = '091' AND substring(digits from 4) ~ '^[6-9]' THEN
        RETURN '+' || substring(digits from 2);
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone_e164(text) IS
    'SQL mirror of src/lib/phone.ts normalizePhoneE164 — any India-shaped input to +91XXXXXXXXXX, NULL if unparseable. Keep both in sync.';

-- One-time backfill: collapse any pre-existing rows that already
-- normalize cleanly but aren't stored in canonical form yet. Rows
-- that fail to normalize are left untouched (never silently NULLed)
-- so they surface for manual review instead of vanishing.
UPDATE public.profiles
   SET phone = public.normalize_phone_e164(phone)
 WHERE phone IS NOT NULL
   AND public.normalize_phone_e164(phone) IS NOT NULL
   AND phone IS DISTINCT FROM public.normalize_phone_e164(phone);

UPDATE public.profiles
   SET alt_phone = public.normalize_phone_e164(alt_phone)
 WHERE alt_phone IS NOT NULL
   AND public.normalize_phone_e164(alt_phone) IS NOT NULL
   AND alt_phone IS DISTINCT FROM public.normalize_phone_e164(alt_phone);

CREATE OR REPLACE FUNCTION public.profiles_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    n_phone text;
    n_alt text;
BEGIN
    IF NEW.phone IS NOT NULL THEN
        n_phone := public.normalize_phone_e164(NEW.phone);
        IF n_phone IS NULL THEN
            RAISE EXCEPTION 'profiles.phone is not a valid Indian mobile number: %', NEW.phone;
        END IF;
        NEW.phone := n_phone;
    END IF;

    IF NEW.alt_phone IS NOT NULL THEN
        n_alt := public.normalize_phone_e164(NEW.alt_phone);
        IF n_alt IS NULL THEN
            RAISE EXCEPTION 'profiles.alt_phone is not a valid Indian mobile number: %', NEW.alt_phone;
        END IF;
        NEW.alt_phone := n_alt;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_normalize_phone() IS
    'BEFORE INSERT/UPDATE trigger: forces profiles.phone/alt_phone into canonical +91XXXXXXXXXX form so no two string spellings of the same number can ever coexist, independent of the writing code path. See migration 026.';

DROP TRIGGER IF EXISTS profiles_normalize_phone_trg ON public.profiles;

-- Only fires when phone/alt_phone are actually part of the write, so
-- unrelated profile updates never re-validate a column they didn't touch.
CREATE TRIGGER profiles_normalize_phone_trg
    BEFORE INSERT OR UPDATE OF phone, alt_phone ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.profiles_normalize_phone();

-- ── Verification ─────────────────────────────────────────────────
-- Both of these should return '+918005828548':
--   SELECT public.normalize_phone_e164('+91 8005828548');
--   SELECT public.normalize_phone_e164('8005828548');
--
-- This should now fail with the RAISE EXCEPTION above (garbage input):
--   UPDATE public.profiles SET phone = '12345' WHERE id = auth.uid();
