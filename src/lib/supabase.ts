import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://velpeerwdaqwpxmwbxy.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6...' // ※お手元のLegacy anonキー

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const supabaseConfigured = true