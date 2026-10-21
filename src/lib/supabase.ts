import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
let Config: any = {};
try { Config = require('react-native-config').default || {}; } catch {}

const SUPABASE_URL = Config.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = Config.SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
