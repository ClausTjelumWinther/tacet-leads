import { createClient } from "@supabase/supabase-js";

// Forbindelsen til databasen.
// Begge værdier er offentlige: den "publishable" nøgle er lavet til at ligge i en app.
// Det er rollerne i databasen (RLS), der sikrer, at kun din admin-bruger kan læse og skrive.
const url = import.meta.env.VITE_SUPABASE_URL ?? "https://vdebqppfkvcqjytbuhny.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_yyHRFNi3HMzAgLyXMK_GGQ_DdAjVLAE";

export const supabase = createClient(url, key, {
  // Husk login på telefonen, så du ikke skal logge ind hver gang.
  auth: { persistSession: true, autoRefreshToken: true },
});
