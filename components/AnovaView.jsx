'use client';
import { useState } from 'react';
import { buildComparison, fmt } from '@/lib/conditionCompare';
import { runAnova, fmtP, pText, ALPHA } from '@/lib/anova';

const TONE = {
  sig: 'bg-purple-50 text-purple-900', trend: 'bg-blue-50 text-blue-900', ns: 'bg-gray-50 text-gray-600',
  warn: 'bg-amber-50 text-amber-900', info: 'bg-gray-50 text-gray-500',
};
const ICON = { sig: '✅', trend: '🔎', ns: '➖', warn: '⚠️', info: 'ℹ️' };
const VERDICT = {
  sig: <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">유의</span>,
  trend: <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">경향</span>,
  ns: <span className="text-gray-300">—</span>,
};
const num = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));

// 분산분석(ANOVA): 조건비교와 같은 실험 묶음으로, 바뀐 조건의 효과가 우연 범위를 넘는지 검정
export default function AnovaView({ runs, fixedMap, specsOf, mold }) {
  const [groupSig, setGroupSig] = useState(null);

  if (mold === 'all') {
    return (
      <div className="card text-center py-10 text-sm text-gray-500 leading-relaxed">
        위에서 <b className="text-gray-700">금형</b>을 선택하면<br />같은 금형 실험의 조건별 차이를 분산분석(ANOVA)으로 검정합니다.
      </div>
    );
  }

  const c = buildComparison(runs, fixedMap, specsOf, groupSig);
  const a = runAnova(c);
  const groupPicker = c.groups.length > 1 && (
    <div className="card">
      <p className="text-xs text-gray-400 mb-2">분석할 실험 묶음 (조건 구성이 같은 Run 끼리)</p>
      <div className="flex flex-wrap gap-2">
        {c.groups.map(gr => (
          <button key={gr.sig} onClick={() => setGroupSig(gr.sig)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${gr.sig === c.groupSig
              ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>
            {gr.label} ({gr.n}개)
          </button>
        ))}
      </div>
    </div>
  );
  if (!a.ok) {
    return (
      <div className="space-y-4">
        {groupPicker}
        <div className="card text-center py-10 text-sm text-gray-500 leading-relaxed">{a.reason}</div>
      </div>
    );
  }

  const maxMean = Math.max(1, ...Object.values(a.levelMeans).flat().map(l => l.mean));
  const shownInter = a.rows.filter(r => r.factors.length === 2 && r.verdict !== 'ns');
  return (
    <div className="space-y-4">
      {groupPicker}

      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🧮</span>
          <h3 className="text-sm font-semibold text-gray-700">분산분석 결론</h3>
        </div>
        <div className="text-[11px] text-gray-400 mb-3">
          {mold} · 조건 {a.nCond}개 · 시편 {a.n}개 · 요인: {a.factors.join(' · ')} · 모형: 주효과{a.interactions ? ' + 2요인 상호작용' : ''}
        </div>
        <div className="space-y-2">
          {a.lines.map((l, i) => (
            <div key={i} className={`text-sm rounded-lg p-3 leading-relaxed ${TONE[l.type]}`}>{ICON[l.type]} {l.text}</div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-xs text-gray-500 mb-3">분산분석표 (반응값 = 시편 1개당 미충진 합)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="py-1.5 pr-2 text-left font-normal">요인</th>
                <th className="py-1.5 px-1 text-right font-normal whitespace-nowrap">자유도</th>
                <th className="py-1.5 px-1 text-right font-normal whitespace-nowrap">제곱합</th>
                <th className="py-1.5 px-1 text-right font-normal whitespace-nowrap">평균제곱</th>
                <th className="py-1.5 px-1 text-right font-normal">F</th>
                <th className="py-1.5 px-1 text-right font-normal whitespace-nowrap">p값</th>
                <th className="py-1.5 px-1 text-right font-normal whitespace-nowrap">기여율</th>
                <th className="py-1.5 pl-2 text-center font-normal">판정</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map(r => (
                <tr key={r.name} className={`border-b border-gray-50 ${r.verdict === 'sig' ? 'bg-purple-50/60' : ''}`}>
                  <td className="py-1.5 pr-2 text-gray-700 whitespace-nowrap">{r.name}</td>
                  <td className="py-1.5 px-1 text-right">{r.df}</td>
                  <td className="py-1.5 px-1 text-right">{num(r.ss)}</td>
                  <td className="py-1.5 px-1 text-right">{num(r.ms)}</td>
                  <td className="py-1.5 px-1 text-right">{num(r.F)}</td>
                  <td className={`py-1.5 px-1 text-right ${r.p < ALPHA ? 'text-purple-700 font-semibold' : 'text-gray-500'}`}>{fmtP(r.p)}</td>
                  <td className="py-1.5 px-1 text-right">{Math.round(r.pct)}%</td>
                  <td className="py-1.5 pl-2 text-center">{VERDICT[r.verdict]}</td>
                </tr>
              ))}
              <tr className="border-b border-gray-50 text-gray-500">
                <td className="py-1.5 pr-2">오차</td>
                <td className="py-1.5 px-1 text-right">{a.error.df}</td>
                <td className="py-1.5 px-1 text-right">{num(a.error.ss)}</td>
                <td className="py-1.5 px-1 text-right">{num(a.error.ms)}</td>
                <td colSpan={4} />
              </tr>
              <tr className="text-gray-400">
                <td className="py-1.5 pr-2">합계</td>
                <td className="py-1.5 px-1 text-right">{a.total.df}</td>
                <td className="py-1.5 px-1 text-right">{num(a.total.ss)}</td>
                <td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[10px] text-gray-400 leading-relaxed">
          p값 = 실제로는 차이가 없는데 이만큼 차이가 날 확률. 0.05 미만이면 유의, 0.1 미만이면 경향.
          기여율 = 시편 간 전체 흩어짐 중 그 요인이 설명하는 비율. 제곱합은 Type II(조건별 시편 수가 달라도 됨).
        </div>
      </div>

      <div className="card">
        <h3 className="text-xs text-gray-500 mb-3">요인별 수준 평균 (시편 기준 · 낮을수록 좋음)</h3>
        <div className="space-y-4">
          {a.factors.filter(f => a.levelMeans[f]).map(f => {
            const row = a.rows.find(r => r.name === f);
            const min = Math.min(...a.levelMeans[f].map(l => l.mean));
            return (
              <div key={f}>
                <div className="flex justify-between items-baseline mb-1 gap-2">
                  <span className="text-sm font-medium text-gray-700">{f}</span>
                  {row && <span className={`text-xs ${row.p < ALPHA ? 'text-purple-700 font-semibold' : 'text-gray-400'}`}>{pText(row.p)}</span>}
                </div>
                <div className="space-y-1">
                  {a.levelMeans[f].map(l => (
                    <div key={l.level} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-gray-600 truncate">{l.level}</span>
                      <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
                        <div className="h-4 rounded" style={{
                          width: `${Math.max(4, (l.mean / maxMean) * 100)}%`,
                          background: row && row.p < ALPHA ? (l.mean === min ? '#34d399' : '#fca5a5') : '#cbd5e1',
                        }} />
                      </div>
                      <span className="w-20 text-right tabular-nums text-gray-700">
                        {fmt(l.mean)}{l.sd != null && <span className="text-gray-400"> ±{fmt(l.sd)}</span>}
                      </span>
                      <span className="w-10 text-right text-[10px] text-gray-400">{l.n}개</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[10px] text-gray-400">막대 = 평균 미충진, ± = 표준편차. 유의한 요인만 색으로 표시 (초록 = 가장 낮음)</div>
      </div>

      {shownInter.map(r => {
        const cm = a.cellMeans[r.name];
        return (
          <div key={r.name} className="card">
            <h3 className="text-xs text-gray-500 mb-3">
              {r.name} 상호작용 평균표 ({r.verdict === 'sig' ? '유의' : '경향'}, {pText(r.p)}) · 줄마다 초록 = 가장 낮음
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate tabular-nums" style={{ borderSpacing: 3 }}>
                <thead>
                  <tr>
                    <th className="text-[10px] text-gray-400 font-normal text-left">{cm.outer} \ {cm.inner}</th>
                    {cm.innerLevels.map(l => <th key={l} className="text-gray-500 font-medium">{l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cm.outerLevels.map((o, oi) => {
                    const vals = cm.cells[oi].filter(v => v != null);
                    const lo = Math.min(...vals);
                    return (
                      <tr key={o}>
                        <td className="text-gray-500 font-medium whitespace-nowrap pr-1">{o}</td>
                        {cm.cells[oi].map((v, ii) => (
                          <td key={ii} className="text-center rounded-md py-2"
                            style={v == null ? { background: '#f3f4f6', color: '#9ca3af' }
                              : v - lo < 0.05 ? { background: '#bbf7d0', color: '#065f46', fontWeight: 600 } : { background: '#f9fafb', color: '#374151' }}>
                            {v == null ? '—' : fmt(v)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-gray-400 leading-relaxed px-1">
        미충진 점수는 0~3단계를 더한 값이라 ANOVA의 정규분포 가정에 근사적으로만 맞습니다.
        p값이 경계(0.05 근처)이면 같은 조건을 반복해 다시 확인하세요.
      </div>
    </div>
  );
}
