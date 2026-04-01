import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_6kUbORFpskKo-zg6r0MZtA_x5ppPvin";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
