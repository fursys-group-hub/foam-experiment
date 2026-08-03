import { NextResponse } from 'next/server';
import getPool from '@/lib/db';

// 일회성 진단용: 환경변수 설정 여부 + DB 실제 연결 결과를 그대로 보여준다.
export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL ? '설정됨' : '없음',
    SUPABASE_URL: process.env.SUPABASE_URL ? '설정됨' : '없음',
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ? '설정됨' : '없음',
    SUPABASE_EMAIL: process.env.SUPABASE_EMAIL ? '설정됨' : '없음',
    SUPABASE_PASSWORD: process.env.SUPABASE_PASSWORD ? '설정됨' : '없음',
    SUPABASE_BUCKET: process.env.SUPABASE_BUCKET ? '설정됨' : '없음',
  };
  try {
    const r = await getPool().query('select current_schema() cs, 1 n');
    return NextResponse.json({ ok: true, env, current_schema: r.rows[0].cs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, env, error: { name: e?.name ?? null, code: e?.code ?? null, message: e?.message ?? null, str: String(e) } },
      { status: 500 },
    );
  }
}
