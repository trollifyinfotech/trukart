// ============================================================
// Veloura E-commerce — Supabase Configuration
// Replace these two values with your own Supabase credentials.
// (Supabase Dashboard > Project Settings > API)
// Use ONLY the Project URL and the Publishable / anon key.
// NEVER put a service_role or secret key here.
// ============================================================

const SUPABASE_URL = 'https://jffvunzwwgggkytifzkp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZnZ1bnp3d2dnZ2t5dGlmemtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4ODIxODYsImV4cCI6MjEwODQ1ODE4Nn0.6RgtE1uXG_L-aAgXgcoB2owPEDNBUJdIMWNZW_BtG-c';

// ---- Do not edit below this line -------------------------------------------------
// The one and only Supabase client for the whole website (window.sb).
// If something is wrong, window.sb stays null and window.SB_CONFIG_ERROR explains why;
// the website then shows that message instead of failing silently.
(function () {
  window.sb = null;
  window.SB_CONFIG_ERROR = null;
  function fail(msg) { window.SB_CONFIG_ERROR = msg; console.error('[Veloura] ' + msg); }

  if (!window.supabase || !window.supabase.createClient) {
    return fail('Supabase library not loaded. Check your internet connection and that the CDN <script> in index.html is reachable.');
  }
  var url = String(SUPABASE_URL || '').trim().replace(/\/+$/, '');
  var key = String(SUPABASE_ANON_KEY || '').trim();
  if (!url || url === 'YOUR_SUPABASE_PROJECT_URL') {
    return fail('Missing Supabase Project URL. Open supabase/supabase.js and set SUPABASE_URL.');
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    return fail('Invalid Supabase Project URL "' + url + '". It must look like https://YOUR-PROJECT.supabase.co (no extra path).');
  }
  if (!key || key === 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY') {
    return fail('Missing Supabase API key. Open supabase/supabase.js and set SUPABASE_ANON_KEY.');
  }
  if (/^sb_secret_/i.test(key)) {
    return fail('SUPABASE_ANON_KEY is a SECRET key. Never use secret keys in a browser. Use the Publishable / anon key.');
  }
  if (key.indexOf('eyJ') === 0) {
    try {
      var payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') return fail('SUPABASE_ANON_KEY is the service_role key. Never use it in a browser. Use the Publishable / anon key.');
    } catch (e) { return fail('SUPABASE_ANON_KEY is not a valid Supabase key.'); }
  } else if (!/^sb_publishable_/i.test(key)) {
    return fail('SUPABASE_ANON_KEY does not look like a Supabase publishable or anon key.');
  }

  // flowType "pkce": e-mail confirmation / password-reset links return ?code=... in the query string,
  // which works with this site's #/hash router (the default implicit flow puts tokens in the #hash and would clash).
  window.sb = window.supabase.createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
    // All requests of this ONE client pass through assets/js/cache.js (VFetch): reachability tracking + cache refresh after writes.
    global: { fetch: function (input, init) { return (window.VFetch ? window.VFetch(input, init) : fetch(input, init)); } }
  });
})();
