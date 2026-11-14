import { createClient } from '@supabase/supabase-js';

// Public project URL + anon key (safe in the browser; data is protected by RLS, see supabase/schema.sql).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudEnabled = Boolean(url && anonKey);

export const supabase = cloudEnabled
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export async function loadProgress(userId) {
  const { data, error } = await supabase.from('user_progress').select('state, display_name, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProgress(userId, displayName, state) {
  const { error } = await supabase
    .from('user_progress')
    .upsert({ user_id: userId, display_name: displayName, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function deleteProgress(userId) {
  const { error } = await supabase.from('user_progress').delete().eq('user_id', userId);
  if (error) throw error;
}
