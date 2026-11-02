// 분산분석(ANOVA): 조건비교와 같은 실험 묶음에서 시편 1개당 '미충진 합'(구역 등급 합)을 반응값으로 놓고,
// 바뀐 조건(요인)마다 수준 간 차이가 시편 간 흩어짐(우연)보다 큰지 F 검정한다.
// - 모형: 주효과 + 2요인 상호작용. 오차 자유도가 2 미만이면 주효과만 (빠진 고차 상호작용은 오차로 들어간다)
// - 제곱합: Type II (조건별 시편 수가 달라도 쓸 수 있는 방식, 균형 자료면 일반 제곱합과 같다)
import { fillSum, sortLevels, fmt, jo } from './conditionCompare';

export const ALPHA = 0.05;
const TREND = 0.1;
const MIN_ERROR_DF_FOR_INTERACTIONS = 2;

// ── F 분포 위쪽 꼬리 확률 (로그감마 + 정규화 불완전 베타, Numerical Recipes 방식)
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const ci of c) s += ci / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betaCf(a, b, x) {
  const EPS = 3e-14, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function incBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(a, b, x)) / a : 1 - (bt * betaCf(b, a, 1 - x)) / b;
}
export function fPValue(F, d1, d2) {
  if (!(F > 0) || !(d1 > 0) || !(d2 > 0)) return 1;
  return incBeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
}

// ── 최소제곱: 열을 차례로 직교화(Gram-Schmidt)해 잔차제곱합(RSS)과 계수(rank)를 구한다.
// 없는 조합 때문에 겹치는 열은 건너뛰므로 빈 칸이 있는 실험도 계산된다.
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
function fitRss(cols, y) {
  const basis = [];
  const r = y.slice();
  for (const col of cols) {
    const v = col.slice();
    for (let pass = 0; pass < 2; pass++) {
      for (const q of basis) {
        const d = dot(v, q);
        for (let i = 0; i < v.length; i++) v[i] -= d * q[i];
      }
    }
    const nv = Math.sqrt(dot(v, v));
    if (nv < 1e-9 * Math.max(1, Math.sqrt(dot(col, col)))) continue;
    for (let i = 0; i < v.length; i++) v[i] /= nv;
    basis.push(v);
    const d = dot(r, v);
    for (let i = 0; i < r.length; i++) r[i] -= d * v[i];
  }
  return { rss: dot(r, r), rank: basis.length };
}

// 요인의 효과 코딩 열(수준 L개 → L-1열: 해당 수준 1, 마지막 수준 -1)
function effectCols(values, levels) {
  const last = levels[levels.length - 1];
  return levels.slice(0, -1).map(l => values.map(v => (v === l ? 1 : v === last ? -1 : 0)));
}

function termsFor(factors, obs, levelsOf, withInteractions) {
  const main = factors.map(f => ({ name: f, factors: [f], cols: effectCols(obs.map(o => o.cond[f]), levelsOf[f]) }));
  if (!withInteractions) return main;
  const inter = [];
  for (let i = 0; i < main.length; i++) {
    for (let j = i + 1; j < main.length; j++) {
      const cols = [];
      for (const a of main[i].cols) for (const b of main[j].cols) cols.push(a.map((v, k) => v * b[k]));
      inter.push({ name: `${main[i].name}×${main[j].name}`, factors: [main[i].name, main[j].name], cols });
    }
  }
  return [...main, ...inter];
}

function anovaTable(terms, y) {
  const ones = y.map(() => 1);
  const colsOf = ts => [ones, ...ts.flatMap(t => t.cols)];
  const full = fitRss(colsOf(terms), y);
  const errDf = y.length - full.rank;
  const rows = terms.map(t => {
    // Type II: 이 항을 포함하는 상위 항은 빼고, 이 항이 있을 때와 없을 때의 잔차 차이
    const others = terms.filter(u => u !== t && !t.factors.every(f => u.factors.includes(f)));
    const without = fitRss(colsOf(others), y);
    const withT = fitRss(colsOf([...others, t]), y);
    return { name: t.name, factors: t.factors, df: withT.rank - without.rank, ss: Math.max(0, without.rss - withT.rss) };
  });
  return { rows, errDf, errSs: full.rss };
}

// c = buildComparison(...) 결과
export function runAnova(c) {
  const factors = c.factors || [];
  const obs = [];
  for (const r of c.rows || []) for (const s of r.specs) obs.push({ cond: r.cond, y: fillSum(s) });
  const n = obs.length;
  const out = { n, nCond: (c.rows || []).filter(r => r.n > 0).length, factors, ok: false };
  if (!factors.length || n < 3) return { ...out, reason: '바뀐 조건과 시편이 충분하지 않아 분산분석을 할 수 없습니다.' };

  const levelsOf = {};
  factors.forEach(f => { levelsOf[f] = sortLevels([...new Set(obs.map(o => o.cond[f]))]); });
  const used = factors.filter(f => levelsOf[f].length >= 2);
  const y = obs.map(o => o.y);
  const mean = y.reduce((a, v) => a + v, 0) / n;
  const totalSs = y.reduce((a, v) => a + (v - mean) ** 2, 0);

  let interactions = used.length >= 2;
  let t = anovaTable(termsFor(used, obs, levelsOf, interactions), y);
  if (interactions && t.errDf < MIN_ERROR_DF_FOR_INTERACTIONS) {
    interactions = false;
    t = anovaTable(termsFor(used, obs, levelsOf, false), y);
  }
  if (t.errDf < 1) {
    return { ...out, reason: '반복(같은 조건의 시편)이 없고 남는 자유도도 없어 오차를 추정할 수 없습니다. 조건당 시편을 2개 이상 넣어 주세요.' };
  }
  const errMs = t.errSs / t.errDf;
  const rows = t.rows.filter(r => r.df > 0).map(r => {
    const ms = r.ss / r.df;
    const F = errMs > 0 ? ms / errMs : (ms > 0 ? Infinity : 0);
    const p = errMs > 0 ? fPValue(F, r.df, t.errDf) : (ms > 0 ? 0 : 1);
    return { ...r, ms, F, p, pct: totalSs > 0 ? (r.ss / totalSs) * 100 : 0, verdict: p < ALPHA ? 'sig' : p < TREND ? 'trend' : 'ns' };
  });

  // 요인별 수준 평균 (시편 기준)
  const levelMeans = {};
  used.forEach(f => {
    levelMeans[f] = levelsOf[f].map(l => {
      const v = obs.filter(o => o.cond[f] === l).map(o => o.y);
      const m = v.reduce((a, x) => a + x, 0) / v.length;
      const sd = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : null;
      return { level: l, mean: m, sd, n: v.length };
    });
  });

  // 2요인 상호작용의 칸 평균: 수준이 적은 요인(바깥)의 수준마다 다른 요인(안쪽)의 평균
  const cellMeans = {};
  rows.filter(r => r.factors.length === 2).forEach(r => {
    const [a, b] = r.factors;
    const [outer, inner] = levelsOf[a].length < levelsOf[b].length ? [a, b] : [b, a];
    cellMeans[r.name] = {
      outer, inner, outerLevels: levelsOf[outer], innerLevels: levelsOf[inner],
      cells: levelsOf[outer].map(o => levelsOf[inner].map(i => {
        const v = obs.filter(x => x.cond[outer] === o && x.cond[inner] === i).map(x => x.y);
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
      })),
    };
  });

  const replicated = (c.rows || []).some(r => r.n >= 2);
  return {
    ...out, ok: true, rows, interactions, levelsOf, levelMeans, cellMeans, replicated,
    error: { df: t.errDf, ss: t.errSs, ms: errMs }, total: { df: n - 1, ss: totalSs },
    lines: anovaLines(rows, levelMeans, cellMeans, { interactions, replicated, errDf: t.errDf, factors: used }),
  };
}

export function fmtP(p) {
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}
export const pText = p => (p < 0.001 ? 'p<0.001' : `p=${p.toFixed(3)}`);

function anovaLines(rows, levelMeans, cellMeans, info) {
  const lines = [];
  const sigInter = rows.filter(r => r.factors.length === 2 && r.verdict === 'sig');
  for (const r of [...rows].sort((a, b) => a.p - b.p)) {
    const stat = `F=${r.F === Infinity ? '∞' : r.F.toFixed(2)}, ${pText(r.p)}, 기여율 ${Math.round(r.pct)}%`;
    if (r.factors.length === 1) {
      const order = [...levelMeans[r.name]].sort((a, b) => a.mean - b.mean).map(l => `${l.level} ${fmt(l.mean)}`).join(' < ');
      const inter = sigInter.filter(x => x.factors.includes(r.name)).map(x => x.name);
      const caveat = inter.length ? ` · 단, ${inter.join('·')} 상호작용이 유의해 이 효과는 조합마다 다름` : '';
      if (r.verdict === 'sig') lines.push({ type: 'sig', text: `${r.name}: 유의함 (${stat}) — 평균 낮은 순 ${order}${caveat}` });
      else if (r.verdict === 'trend') lines.push({ type: 'trend', text: `${r.name}: 경향 있음, 유의 수준엔 못 미침 (${stat}) — 평균 낮은 순 ${order}` });
      else lines.push({ type: 'ns', text: `${r.name}: 차이가 우연 범위 안 (${stat})` });
    } else if (r.verdict !== 'ns') {
      const cm = cellMeans[r.name];
      const best = cm.outerLevels.map((o, oi) => {
        const row = cm.cells[oi];
        const min = Math.min(...row.filter(v => v != null));
        const lv = cm.innerLevels.filter((_, ii) => row[ii] != null && row[ii] - min < 0.05);
        return `${o}에선 ${lv.join('·')}(${fmt(min)})`;
      }).join(', ');
      lines.push({ type: r.verdict, text: `${r.name} 상호작용 ${r.verdict === 'sig' ? '유의' : '경향'} (${stat}) — ${cm.outer}마다 ${cm.inner}${jo(cm.inner, '이', '가')} 가장 낮은 수준: ${best}` });
    }
  }
  if (!rows.some(r => r.verdict === 'sig')) {
    lines.unshift({ type: 'warn', text: `유의 수준(p<${ALPHA})을 넘는 조건이 없음 — 조건 간 차이가 시편 간 흩어짐(우연) 범위 안에 있음` });
  }
  if (!info.replicated) {
    lines.push({ type: 'info', text: `조건당 시편이 1개라 ${info.interactions ? (info.factors.length >= 3 ? '3요인 이상 상호작용' : '남는 자유도') : '모형에 넣지 않은 상호작용'}을 오차로 썼음 (오차 자유도 ${info.errDf}) — 같은 조건 반복이 있어야 더 확실함` });
  } else if (info.errDf <= 5) {
    lines.push({ type: 'info', text: `오차 자유도가 ${info.errDf}로 작아 실제 차이가 있어도 유의하게 안 나올 수 있음` });
  }
  return lines;
}
