import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://omjivlmfsikeqwndtlcn.supabase.co";

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "sb_anon_key_placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
