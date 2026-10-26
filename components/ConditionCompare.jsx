'use client';
import { useState } from 'react';
import { buildComparison, gridLayout, fmt } from '@/lib/conditionCompare';

const TONE = {
  strong: 'bg-purple-50 text-purple-900', cond: 'bg-purple-50 text-purple-900', inter: 'bg-blue-50 text-blue-900',
  best: 'bg-green-50 text-green-900', rec: 'bg-green-50 text-green-900',
  weak: 'bg-gray-50 text-gray-700', warn: 'bg-amber-50 text-amber-900', info: 'bg-gray-50 text-gray-500',
};
const ICON = { strong: '📊', cond: '🔎', inter: '🔁', best: '🏆', rec: '✅', weak: '➖', warn: '⚠️', info: 'ℹ️' };

// 같은 금형의 Run 들을 조건(실험변수 + 고정변수) 조합별로 비교하는 화면
export default function ConditionCompare({ runs, fixedMap, specsOf, mold }) {
  const [groupSig, setGroupSig] = useState(null); // 비교할 실험 묶음 (null = 가장 최근 묶음)

  if (mold === 'all') {
    return (
      <div className="card text-center py-10 text-sm text-gray-500 leading-relaxed">
        위에서 <b className="text-gray-700">금형</b>을 선택하면<br />같은 금형의 실험끼리 조건(온도·주입량·패턴 등)을 비교합니다.
      </div>
    );
  }

  const c = buildComparison(runs, fixedMap, specsOf, groupSig);
  const groupPicker = c.groups.length > 1 && (
    <div className="card">
      <p className="text-xs text-gray-400 mb-2">비교할 실험 묶음 (조건 구성이 같은 Run 끼리 비교)</p>
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
  if (!c.factors.length || c.ranked.length < 2) {
    return (
      <div className="space-y-4">
        {groupPicker}
        <div className="card text-center py-10 text-sm text-gray-500">
          {!c.factors.length
            ? '이 금형의 Run 사이에 바뀐 조건이 없어 비교할 수 없습니다.'
            : '시편 데이터가 있는 조건이 2개 이상 있어야 비교할 수 있습니다.'}
        </div>
      </div>
    );
  }

  const lo = c.ranked[0].avgFill;
  const hi = c.ranked[c.ranked.length - 1].avgFill;
  const g = gridLayout(c.factors, c.levelsOf);
  const find = cond => c.rows.find(r => Object.entries(cond).every(([k, v]) => r.cond[k] === v));
  const cellStyle = r => {
    if (!r || !r.n) return { background: '#f3f4f6', color: '#9ca3af' };
    if (r.rank === 1) return { background: '#bbf7d0', color: '#065f46', fontWeight: 600 };
    const t = hi > lo ? (r.avgFill - lo) / (hi - lo) : 0;
    return { background: `rgba(220,38,38,${(0.08 + t * 0.62).toFixed(2)})`, color: t > 0.55 ? '#fff' : '#7f1d1d' };
  };
  const maxMean = Math.max(1, ...c.effects.flatMap(e => e.levels.map(l => l.mean || 0)));

  return (
    <div className="space-y-4">
      {groupPicker}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🤖</span>
          <h3 className="text-sm font-semibold text-gray-700">조건 비교 결론</h3>
        </div>
        <div className="text-[11px] text-gray-400 mb-3">
          {mold} · 비교 Run {c.n}개 · 바뀐 조건: {c.factors.join(' · ')}
          {c.common.length > 0 && ` · 공통: ${c.common.map(x => `${x.name} ${x.value}`).join(', ')}`}
        </div>
        <div className="space-y-2">
          {c.lines.map((l, i) => (
            <div key={i} className={`text-sm rounded-lg p-3 leading-relaxed ${TONE[l.type]}`}>{ICON[l.type]} {l.text}</div>
          ))}
        </div>
        <div className="mt-3 text-[10px] text-gray-400">평균 미충진 = 시편 1개당 구역별 미충진 등급 합계 (낮을수록 좋음)</div>
      </div>

      <div className="card">
        <h3 className="text-xs text-gray-500 mb-3">변수별 효과 (평균 미충진 · 낮을수록 좋음)</h3>
        <div className="space-y-4">
          {c.effects.map(e => {
            const unit = e.levels.length === 2 ? '쌍' : '묶음';
            return (
              <div key={e.name}>
                <div className="flex justify-between items-baseline mb-1 gap-2">
                  <span className="text-sm font-medium text-gray-700">{e.name}</span>
                  <span className={`text-xs text-right ${e.effect >= 1 ? 'text-purple-700 font-semibold' : 'text-gray-400'}`}>
                    차이 {fmt(e.effect)}{e.effect < 1 && ' (작음)'}
                    {e.paired && ` · 같은 조건끼리 ${e.blocks}${unit} 비교${e.ties ? `, 동점 ${e.ties}` : ''}`}
                  </span>
                </div>
                <div className="space-y-1">
                  {e.levels.map(l => (
                    <div key={l.level} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 text-gray-600 truncate">{l.level}</span>
                      <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
                        {l.mean != null && (
                          <div className="h-4 rounded" style={{
                            width: `${Math.max(4, (l.mean / maxMean) * 100)}%`,
                            // 차이가 작은 조건은 어느 수준도 강조하지 않는다
                            background: e.effect < 1 ? '#cbd5e1' : e.best.includes(l.level) ? '#34d399' : '#fca5a5',
                          }} />
                        )}
                      </div>
                      <span className="w-8 text-right tabular-nums text-gray-700">{l.mean != null ? fmt(l.mean) : '-'}</span>
                      {e.paired && <span className="w-16 text-right text-[10px] text-gray-400">{e.wins[l.level]}{unit} 최저</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {g && (
        <div className="card">
          <h3 className="text-xs text-gray-500 mb-3">조건 지도 (칸 = 평균 미충진, 초록 = 가장 낮음)</h3>
          <div className={`grid gap-4 ${g.split ? 'sm:grid-cols-2' : ''}`}>
            {(g.split ? c.levelsOf[g.split] : [null]).map(sv => (
              <div key={sv ?? 'all'}>
                {g.split && <div className="text-xs font-medium text-gray-600 mb-1">{g.split}: {sv}</div>}
                <table className="w-full text-xs border-separate" style={{ borderSpacing: 3 }}>
                  <thead>
                    <tr>
                      <th className="text-[10px] text-gray-400 font-normal text-left">{g.row} \ {g.col}</th>
                      {c.levelsOf[g.col].map(cv => <th key={cv} className="text-gray-500 font-medium">{cv}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {c.levelsOf[g.row].map(rv => (
                      <tr key={rv}>
                        <td className="text-gray-500 font-medium whitespace-nowrap pr-1">{rv}</td>
                        {c.levelsOf[g.col].map(cv => {
                          const r = find({ [g.row]: rv, [g.col]: cv, ...(g.split ? { [g.split]: sv } : {}) });
                          return (
                            <td key={cv} className="text-center rounded-md py-2 tabular-nums" style={cellStyle(r)}>
                              {!r ? '—' : r.n ? fmt(r.avgFill) : '결측'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-xs text-gray-500 mb-3">조건별 순위 (평균 미충진 낮은 순)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="py-1.5 pr-2 text-left font-normal">순위</th>
                {c.factors.map(f => <th key={f} className="py-1.5 pr-2 text-left font-normal whitespace-nowrap">{f}</th>)}
                <th className="py-1.5 text-right font-normal whitespace-nowrap">평균 미충진</th>
                <th className="py-1.5 text-right font-normal">표면불량</th>
                <th className="py-1.5 text-right font-normal">시편</th>
              </tr>
            </thead>
            <tbody>
              {c.ranked.map(r => (
                <tr key={r.key} className={`border-b border-gray-50 ${r.rank === 1 ? 'bg-green-50' : ''}`}>
                  <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">{r.rank === 1 ? '🏆 1' : r.rank}</td>
                  {c.factors.map(f => <td key={f} className="py-1.5 pr-2">{r.cond[f]}</td>)}
                  <td className="py-1.5 text-right tabular-nums font-medium">{fmt(r.avgFill)}</td>
                  <td className="py-1.5 text-right tabular-nums text-blue-500">{r.avgSurf ? `${Math.round(r.avgSurf * 100)}%` : '-'}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-400">{r.n}</td>
                </tr>
              ))}
              {c.missing.map(r => (
                <tr key={r.key} className="text-gray-300">
                  <td className="py-1.5 pr-2">-</td>
                  {c.factors.map(f => <td key={f} className="py-1.5 pr-2">{r.cond[f]}</td>)}
                  <td className="py-1.5 text-right" colSpan={3}>결측(시편 없음)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
