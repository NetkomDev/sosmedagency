// Shared Supabase Configuration
// IMPORTANT: Only use the ANON (public) key in client-side code.
// Service role keys must NEVER be exposed in the frontend.

const SUPABASE_URL = 'https://uvrtlenmjpueahwydomo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cnRsZW5tanB1ZWFod3lkb21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTU1MTIsImV4cCI6MjA4NjUzMTUxMn0.aZrXP8tHUDxk7Am79wHHi8j6_8EX5odLqej_msDzIiA'; // Anon Public Key

export { SUPABASE_URL, SUPABASE_KEY as SUPABASE_ANON_KEY };
