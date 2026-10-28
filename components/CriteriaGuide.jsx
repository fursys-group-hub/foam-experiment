'use client';
import { useEffect, useState } from 'react';

// 로트입력의 미충진 버튼과 같은 이름·색
const GRADE = [
  { label: '없음', bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' },
  { label: '경미', bg: '#FEF3C7', border: '#D97706', text: '#92400E' },
  { label: '보통', bg: '#FED7AA', border: '#EA580C', text: '#9A3412' },
  { label: '심각', bg: '#FECACA', border: '#DC2626', text: '#991B1B' },
];
const ZONES = ['좌상', '상', '우상', '좌중', '중앙', '우중', '좌하', '하', '우하'];
const MM = 4; // 크기 비교 그림: 1mm = 4px (그림끼리 같은 비율)

function GradeBadge({ g }) {
  const s = GRADE[g] || GRADE[0];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {g} {s.label}
    </span>
  );
}

function Table({ b }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            {b.head.map((h, i) => <th key={i} className="py-2 px-2 text-left font-medium whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-100 align-top">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-2 px-2 leading-relaxed ${String(cell).startsWith('불합격') ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                  {b.grade && ci === 0 ? <GradeBadge g={Number(cell)} /> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sizes({ b }) {
  const h = Math.max(...b.items.map(it => (it.shape === 'circle' ? it.d : it.w))) * MM + 8;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-gray-100 rounded-lg p-3">
      {b.items.map((it, i) => {
        const w = (it.shape === 'circle' ? it.d : it.l) * MM + 8;
        return (
          <div key={i} className="flex flex-col items-center text-center">
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              {it.shape === 'circle'
                ? <circle cx={w / 2} cy={h / 2} r={(it.d / 2) * MM} fill="none" stroke="#374151" strokeWidth="2" />
                : <rect x={4} y={h / 2 - (it.w / 2) * MM} width={it.l * MM} height={it.w * MM} rx={(it.w / 2) * MM}
                    fill="none" stroke="#374151" strokeWidth="2" />}
            </svg>
            <div className="text-xs font-semibold text-gray-800 mt-1">{it.label}</div>
            {it.sub && <div className="text-[10px] text-gray-400">{it.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ZoneGrid({ b }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid grid-cols-3 gap-0.5 w-40 shrink-0">
        {b.zones.map((g, i) => {
          const s = GRADE[g] || GRADE[0];
          return (
            <div key={i} className="h-12 rounded flex flex-col items-center justify-center"
              style={{ background: g ? s.bg : '#f9fafb', border: `1px solid ${g ? s.border : '#e5e7eb'}` }}>
              <span className="text-[9px] text-gray-400 leading-none">{ZONES[i]}</span>
              <span className="text-lg font-bold leading-tight" style={{ color: g ? s.text : '#d1d5db' }}>{g}</span>
            </div>
          );
        })}
      </div>
      {b.caption && <div className="text-xs text-blue-700 font-medium">{b.caption}</div>}
    </div>
  );
}

function Block({ b, pdfUrl }) {
  if (b.type === 'table') return <Table b={b} />;
  if (b.type === 'sizes') return <Sizes b={b} />;
  if (b.type === 'grid') return <ZoneGrid b={b} />;
  if (b.type === 'note') return <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">{b.text}</p>;
  if (b.type === 'list') {
    return (
      <ul className="space-y-1.5">
        {b.items.map((t, i) => (
          <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2"><span className="text-gray-300">•</span><span>{t}</span></li>
        ))}
      </ul>
    );
  }
  if (b.type === 'pdf') {
    return pdfUrl
      ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 text-white text-xs font-medium hover:bg-gray-700">
          📄 {b.label || '원문 보기 (PDF)'}
        </a>
      : <p className="text-xs text-gray-400">원문 PDF가 아직 등록되지 않았습니다.</p>;
  }
  return null;
}

// 판단기준 창. 내용(매뉴얼·원문 PDF)은 /api/guide 가 비공개 저장소에서 내려준다.
export default function CriteriaGuide({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/guide').then(r => r.json())
      .then(d => (d.error ? setError(d.error) : setData(d)))
      .catch(e => setError(String(e)));
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const m = data?.manual;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 overflow-y-auto p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl mx-auto my-4" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white rounded-t-xl border-b border-gray-100 px-4 py-3 flex items-start gap-3 z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800">📏 {m?.title || '판단기준'}</h2>
            {m?.subtitle && <p className="text-xs text-gray-500 mt-0.5">{m.subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1" aria-label="닫기">✕</button>
        </div>
        <div className="px-4 py-4 space-y-6">
          {error && <p className="text-sm text-red-600">판단기준을 불러오지 못했습니다: {error}</p>}
          {!error && !data && <p className="text-sm text-gray-400 text-center py-8">불러오는 중...</p>}
          {data && !m && <p className="text-sm text-gray-500 text-center py-8">판단기준이 아직 등록되지 않았습니다.</p>}
          {m && (m.basis || m.revision) && (
            <p className="text-[11px] text-gray-400">
              {m.basis && <>근거: {m.basis}</>}{m.basis && m.revision && ' · '}{m.revision && <>개정 {m.revision}</>}
            </p>
          )}
          {m?.sections.map((s, i) => (
            <section key={i} className="space-y-2.5">
              <h3 className="text-sm font-semibold text-gray-800 border-l-4 border-purple-500 pl-2">{s.title}</h3>
              {s.blocks.map((b, j) => <Block key={j} b={b} pdfUrl={data.pdfUrl} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
