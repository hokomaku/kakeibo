import { createClient } from '@supabase/supabase-js'

// プロトコル(https://)を含めた正しい完全URLを指定します
const SUPABASE_URL = 'https://velpeerwdaqwpxmwbxy.supabase.co'
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})