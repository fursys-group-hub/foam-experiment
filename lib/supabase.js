import { createClient } from '@supabase/supabase-js';

// 배포 시 설정값(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)이 아직 비어 있어도 빌드가 멈추지 않도록
// 임시 기본값을 둔다. 실제 값을 넣고 다시 올리면(재배포) 그 값이 우선 적용된다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
