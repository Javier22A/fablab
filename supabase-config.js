const SUPABASE_URL = "https://awehesrhakvybllkmhof.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1XWe47oeIEX62aIpWqHZsA_hinAtE9J";

if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
