import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hmkaprlgnnszcknwessn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2Fwcmxnbm5zemNrbndlc3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQ1MTUsImV4cCI6MjA5MzE1MDUxNX0.LoeW7VFBgwUE0JPXdgjGoDrhnAeZC_Y3NQ8kz0C0sls'

export const supabase = createClient(supabaseUrl, supabaseKey)