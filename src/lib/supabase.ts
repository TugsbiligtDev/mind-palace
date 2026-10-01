"use client";
// The URL and publishable key are public by design: Row Level Security in the database
// decides what each person can see. Without them, sign-in is off and progress stays local.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const authEnabled = Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!authEnabled) return null;
  client ??= createClient(url!, key!);
  return client;
}
