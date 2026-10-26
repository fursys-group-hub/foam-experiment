import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

// 초기 로드용 묶음 조회: 변수/금형/보일러/실험 Run
export async function GET() {
  try {
    const [factors, molds, boilers, runs] = await Promise.all([
      q('SELECT * FROM exp_factors ORDER BY sort_order'),
      q('SELECT * FROM exp_molds ORDER BY mold_id'),
      q('SELECT * FROM exp_boilers ORDER BY boiler_no'),
      // 최신순 = id 내림차순. created_at 이 NULL 인 Run 이 DESC 정렬에서 맨 위로 올라오는 문제를 피한다.
      q('SELECT * FROM exp_runs ORDER BY id DESC'),
    ]);
    return NextResponse.json({
      factors: factors.rows,
      molds: molds.rows,
      boilers: boilers.rows,
      runs: runs.rows,
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message ?? 'load failed' }, { status: 500 });
  }
}
