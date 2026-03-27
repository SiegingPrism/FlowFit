/**
 * Supabase Configuration & Initialization
 */

const SUPABASE_URL = 'https://dmaakmkrxzmobcwavusy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtYWFrbWtyeHptb2Jjd2F2dXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mzg0NTMsImV4cCI6MjA5MDIxNDQ1M30.kQpF-uFM5yjUwrFgW3bP2fHTWitOwEt3d84PBJq2ca8';

// Initialize the Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Utility: Check if user is logged in natively across pages
async function checkAuth() {
  const { data, error } = await supabase.auth.getSession();
  
  if (error || !data.session) {
    if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('signup.html')) {
        window.location.replace('login.html');
    }
    return null;
  }
  
  // They are logged in, but tried to access login page -> send to dashboard
  if (window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('signup.html')) {
    window.location.replace('index.html');
  }

  return data.session.user;
}

// Call checkAuth immediately unless on login/signup page
checkAuth();
