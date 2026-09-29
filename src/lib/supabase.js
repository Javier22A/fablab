import { createClient } from "@supabase/supabase-js";

// These are Supabase publishable client settings, not server secrets.
const SUPABASE_URL = "https://awehesrhakvybllkmhof.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1XWe47oeIEX62aIpWqHZsA_hinAtE9J";

export const supabaseClient = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
