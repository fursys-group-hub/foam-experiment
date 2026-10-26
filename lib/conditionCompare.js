// 같은 금형에서 여러 조건(실험변수 + 고정변수)을 바꿔 가며 한 실험들을 비교한다.
// 지표 "평균 미충진" = 시편 1개당 구역별 미충진 등급(fill) 합계 — 낮을수록 좋다.
// (불량률은 경미한 결함도 불량으로 세서 모든 조건이 100%가 되기 쉬워 비교 지표로 쓰지 않는다.)

const EFFECT_MIN = 1.0; // 수준 간 평균 차이가 이 값(등급 1점)보다 작으면 '차이 작음'으로 본다

function zoneFill(v) {
  if (!v) return 0;
  return typeof v === 'number' ? v : v.fill || 0;
}
function fillSum(s) {
  return Object.values(s.defect_severity || {}).reduce((a, v) => a + zoneFill(v), 0);
}
function hasSurface(s) {
  return Object.values(s.defect_severity || {}).some(v => v && typeof v === 'object' && (v.surface || 0) > 0);
}

// 50℃ < 52℃, 700g < 710g 처럼 숫자로 시작하면 숫자 순, 아니면 가나다 순
export function sortLevels(vals) {
  return [...vals].sort((a, b) => {
    const x = parseFloat(a), y = parseFloat(b);
    if (!isNaN(x) && !isNaN(y) && x !== y) return x - y;
    if (!isNaN(x) !== !isNaN(y)) return isNaN(x) ? 1 : -1;
    return String(a).localeCompare(String(b), 'ko');
  });
}

export function fmt(v) {
  return (Math.round(v * 10) / 10).toFixed(1);
}

// 앞 단어의 받침에 따라 조사 고르기 (은/는, 이/가). 숫자·단위는 읽는 소리 기준
export function jo(word, withBatchim, withoutBatchim) {
  const s = String(word).replace(/[')\]\s]+$/, '');
  const ch = s.charCodeAt(s.length - 1);
  let has = false;
  if (ch >= 0xac00 && ch <= 0xd7a3) has = (ch - 0xac00) % 28 !== 0; // 완성형 한글
  else if (/[0-9]$/.test(s)) has = /[013678]$/.test(s); // 영·일·삼·육·칠·팔
  else if (/g$/i.test(s)) has = true; // 그램
  return has ? withBatchim : withoutBatchim; // ℃(도), ㅣ(이), ㅡ(으), mm 등은 받침 없음
}

// 변수 순서: 실험변수로 많이 쓰인 것 먼저, 그다음 이름 순
function orderNames(names, its) {
  const activeCnt = n => its.filter(it => it.run.active_factor_name === n).length;
  return [...names].sort((a, b) => activeCnt(b) - activeCnt(a) || a.localeCompare(b, 'ko'));
}

/**
 * runs: 비교할 Run 목록(보통 한 금형) / fixedMap: { runId: [{factor_name, fixed_value}] } / specsOf(runId): 시편 배열
 * groupSig: 비교할 실험 묶음(조건 구성) — 없으면 가장 최근 묶음
 */
export function buildComparison(runs, fixedMap, specsOf, groupSig = null) {
  const excluded = [];
  const items = [];
  for (const run of runs) {
    if (run.is_control || !run.active_factor_name) {
      excluded.push({ run, reason: run.is_control ? '대조군' : '실험변수 없음' });
      continue;
    }
    const cond = { [run.active_factor_name]: String(run.active_factor_value ?? '').trim() };
    for (const f of fixedMap[run.id] || []) cond[f.factor_name] = String(f.fixed_value ?? '').trim();
    items.push({ run, cond, sig: Object.keys(cond).sort().join('|') });
  }

  // 변수 이름 묶음(조건 구성)이 같은 Run 끼리만 비교한다.
  // 값이 2가지 이상인 조건이 있는 묶음만 비교 후보이고, 기본은 가장 최근(큰 id) 묶음
  const bySig = {};
  items.forEach(it => { (bySig[it.sig] = bySig[it.sig] || []).push(it); });
  const candidates = Object.entries(bySig).map(([sig, its]) => {
    const vary = Object.keys(its[0].cond).filter(n => new Set(its.map(it => it.cond[n])).size >= 2);
    return { sig, its, n: its.length, maxId: Math.max(...its.map(it => it.run.id)), label: orderNames(vary, its).join('·') };
  }).filter(g => g.label).sort((a, b) => b.maxId - a.maxId);
  const chosen = candidates.find(g => g.sig === groupSig) || candidates[0];
  const group = chosen ? chosen.its : [];
  items.filter(it => !group.includes(it))
    .forEach(it => excluded.push({ run: it.run, reason: '조건 구성 다름' }));

  const names = orderNames(group.length ? Object.keys(group[0].cond) : [], group);
  const levelsOf = {};
  names.forEach(n => { levelsOf[n] = sortLevels([...new Set(group.map(it => it.cond[n]))]); });
  const factors = names.filter(n => levelsOf[n].length >= 2); // 실제로 바뀐 조건
  const common = names.filter(n => levelsOf[n].length < 2).map(n => ({ name: n, value: levelsOf[n][0] }));

  // 같은 조건의 Run 이 여러 개면(반복 실험) 시편을 합쳐 한 줄로
  const byKey = {};
  for (const it of group) {
    const key = factors.map(n => it.cond[n]).join('\u0001');
    const row = byKey[key] || (byKey[key] = {
      key, cond: Object.fromEntries(factors.map(n => [n, it.cond[n]])), runIds: [], specs: [],
    });
    row.runIds.push(it.run.id);
    row.specs.push(...specsOf(it.run.id));
  }
  const rows = Object.values(byKey).map(r => {
    const n = r.specs.length;
    return {
      ...r, n,
      avgFill: n ? r.specs.reduce((a, s) => a + fillSum(s), 0) / n : null,
      avgSurf: n ? r.specs.filter(hasSurface).length / n : null,
    };
  });
  const ranked = rows.filter(r => r.n > 0)
    .sort((a, b) => a.avgFill - b.avgFill || a.avgSurf - b.avgSurf || a.key.localeCompare(b.key, 'ko'));
  ranked.forEach((r, i) => { r.rank = i > 0 && r.avgFill === ranked[i - 1].avgFill ? ranked[i - 1].rank : i + 1; });
  const missing = rows.filter(r => r.n === 0);

  // 변수별 효과: 다른 조건이 같은 묶음끼리(짝지어) 비교해야 결측·불균형에 덜 흔들린다
  const effects = factors.map(F => {
    const others = factors.filter(n => n !== F);
    const levels = levelsOf[F];
    const blocks = {};
    ranked.forEach(r => {
      const bk = others.map(n => r.cond[n]).join('\u0001');
      (blocks[bk] = blocks[bk] || {})[r.cond[F]] = r.avgFill;
    });
    const complete = Object.values(blocks).filter(b => levels.every(l => b[l] != null));
    const paired = others.length > 0 && complete.length > 0;
    const means = levels.map(l => {
      const vals = paired ? complete.map(b => b[l]) : ranked.filter(r => r.cond[F] === l).map(r => r.avgFill);
      return { level: l, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
    });
    const valid = means.filter(m => m.mean != null);
    const lo = valid.length ? Math.min(...valid.map(m => m.mean)) : 0;
    const hi = valid.length ? Math.max(...valid.map(m => m.mean)) : 0;
    const wins = Object.fromEntries(levels.map(l => [l, 0]));
    let ties = 0;
    if (paired) {
      complete.forEach(b => {
        const m = Math.min(...levels.map(l => b[l]));
        const w = levels.filter(l => b[l] === m);
        if (w.length === 1) wins[w[0]] += 1; else ties += 1;
      });
    }
    return {
      name: F, others, levels: means, effect: valid.length >= 2 ? hi - lo : 0,
      best: valid.filter(m => m.mean === lo).map(m => m.level),
      worst: valid.filter(m => m.mean === hi).map(m => m.level),
      paired, blocks: paired ? complete.length : 0, wins, ties,
    };
  }).sort((a, b) => b.effect - a.effect);

  // 자동 결론 문장
  const q = v => (isNaN(parseFloat(v)) ? `'${v}'` : v); // 글자 값(ㅣ, ㅡ, 원형)은 따옴표로 구분
  const label = cond => factors.map(n => q(cond[n])).join(' · ');
  const range = n => { const l = levelsOf[n]; return `${l[0]}~${l[l.length - 1]}`; };

  // 조건 S 를 수준 s 로 고정했을 때, 조건 F2 의 어느 수준이 나머지 조건이 같은 묶음마다 일관되게
  // 가장 낮은지(mode 'best') 또는 가장 높은지('worst'). 묶음 2개 이상, 한 번 이상은 단독이어야 인정.
  function sliceDominance(S, s, F2, mode) {
    const rest = factors.filter(n => n !== S && n !== F2);
    const blocks = {};
    ranked.filter(r => r.cond[S] === s).forEach(r => {
      const bk = rest.map(n => r.cond[n]).join('\u0001');
      (blocks[bk] = blocks[bk] || {})[r.cond[F2]] = r.avgFill;
    });
    const found = [];
    levelsOf[F2].forEach(l => {
      const bs = Object.values(blocks).filter(b => b[l] != null && Object.keys(b).length >= 2);
      if (bs.length < 2) return;
      const res = bs.map(b => {
        const others = Object.entries(b).filter(([k]) => k !== l).map(([, v]) => v);
        return mode === 'best'
          ? [b[l] <= Math.min(...others), b[l] < Math.min(...others)]
          : [b[l] >= Math.max(...others), b[l] > Math.max(...others)];
      });
      if (res.every(([ok]) => ok) && res.some(([, strict]) => strict)) {
        found.push({ level: l, blocks: bs.length, mean: bs.reduce((a, b) => a + b[l], 0) / bs.length, rest });
      }
    });
    return found;
  }
  const where = d => (d.rest.length === 1 ? `${d.rest[0]} ${d.blocks}개` : `다른 조건 ${d.blocks}가지`);

  const lines = [];
  const strong = effects.filter(e => e.effect >= EFFECT_MIN);
  const weak = effects.filter(e => e.effect < EFFECT_MIN);
  strong.forEach((e, i) => {
    const b = e.levels.find(m => m.level === e.best[0]);
    const w = e.levels.find(m => m.level === e.worst[0]);
    const pct = w.mean > 0 ? Math.round((w.mean - b.mean) / w.mean * 100) : 0;
    const bestW = e.best.map(q).join('/');
    let text = `${i === 0 ? '가장 영향이 큰 조건' : '영향이 있는 조건'}은 ${e.name}: ${bestW}(평균 ${fmt(b.mean)})${jo(bestW, '이', '가')} `
      + `${e.worst.map(q).join('/')}(평균 ${fmt(w.mean)})보다 미충진 ${pct}% 적음`;
    if (e.paired && e.best.length === 1) {
      const unit = e.levels.length === 2 ? '쌍' : '묶음';
      const othersW = e.others.join('·');
      text += ` (${othersW}${jo(othersW, '이', '가')} 같은 ${e.blocks}${unit} 중 ${e.wins[e.best[0]]}${unit}에서 `
        + `${q(e.best[0])}${jo(e.best[0], '이', '가')} ${e.levels.length === 2 ? '더' : '가장'} 낮음`
        + (e.ties ? `, ${e.ties}${unit} 동점)` : ')');
    } else if (!e.paired && e.others.length) {
      text += ' (다른 조건이 같은 짝이 없어 단순 평균으로 비교)';
    }
    lines.push({ type: 'strong', text });
  });

  // 가장 영향이 큰 조건을 가장 좋은 수준으로 고정했을 때 나머지 조건의 좋은 수준 (교호작용까지)
  const top = strong[0];
  const recParts = [];
  const interNames = [];
  let flat = weak.map(e => e.name); // 일관된 차이가 없는 조건
  if (top && top.best.length === 1 && factors.length >= 2) {
    const s = top.best[0];
    const parts = [];
    const inter = [];
    flat = [];
    factors.filter(n => n !== top.name).forEach(F2 => {
      const dom = sliceDominance(top.name, s, F2, 'best');
      if (dom.length !== 1) { flat.push(F2); return; }
      const d = dom[0];
      parts.push(`${F2} ${q(d.level)}${jo(d.level, '이', '가')} ${where(d)} 모두에서 가장 낮거나 같음(평균 ${fmt(d.mean)})`);
      recParts.push({ name: F2, text: `${F2} ${q(d.level)}` });
      top.levels.map(m => m.level).filter(o => o !== s).forEach(o => {
        const w = sliceDominance(top.name, o, F2, 'worst').find(x => x.level === d.level);
        if (w) {
          inter.push(`단, ${top.name} ${q(o)}에서는 ${F2} ${q(d.level)}${jo(d.level, '이', '가')} ${where(w)} 모두에서 가장 높거나 같음 — ${F2} 효과가 ${top.name}에 따라 반대`);
          interNames.push(F2);
        }
      });
    });
    const flatW = flat.join('·');
    const flatText = flat.length ? `${flatW}${jo(flatW, '은', '는')} 일관된 차이 없음` : '';
    lines.push({ type: 'cond', text: `${top.name} ${q(s)}일 때: ${[...parts, flatText].filter(Boolean).join(' · ')}` });
    inter.forEach(t => lines.push({ type: 'inter', text: t }));
  }
  if (weak.length) {
    const cancel = weak.filter(e => interNames.includes(e.name)).map(e => e.name).join('·');
    const lastWeak = weak[weak.length - 1].name;
    lines.push({
      type: 'weak',
      text: `전체 평균으로 보면 ${weak.map(e => `${e.name}(차이 ${fmt(e.effect)})`).join(', ')}${jo(lastWeak, '은', '는')} 영향이 작음`
        + (cancel ? ` — ${cancel}${jo(cancel, '은', '는')} ${top.name}에 따라 효과가 반대라 평균에서 상쇄됨` : ''),
    });
  }
  if (ranked.length) {
    const best = ranked.filter(r => r.rank === 1);
    lines.push({ type: 'best', text: `평균 미충진이 가장 낮은 조건(${fmt(best[0].avgFill)}): ${best.map(r => label(r.cond)).join(', ')}` });
  }
  if (top) {
    const recs = [`${top.name} ${top.best.map(q).join('/')}`, ...recParts.map(p => p.text)];
    strong.slice(1).forEach(e => {
      if (!recParts.some(p => p.name === e.name)) recs.push(`${e.name} ${e.best.map(q).join('/')}`);
    });
    const flatNote = flat.filter(n => !strong.some(e => e.name === n)).map(n => `${n} ${range(n)}`);
    lines.push({
      type: 'rec',
      text: `추천 방향: ${recs.join(' + ')}` + (flatNote.length ? ` (${flatNote.join(', ')} 범위에서는 일관된 차이 없음)` : ''),
    });
  }
  const small = ranked.filter(r => r.n < 3);
  if (ranked.length && small.length === ranked.length) {
    const ns = ranked.map(r => r.n);
    const lo = Math.min(...ns), hi = Math.max(...ns);
    lines.push({ type: 'warn', text: `조건당 시편 ${lo === hi ? lo : `${lo}~${hi}`}개 — 1~2점 차이는 우연일 수 있어 조건당 3개 이상 반복을 권장` });
  } else if (small.length) {
    lines.push({ type: 'warn', text: `시편이 3개 미만인 조건: ${small.map(r => `${label(r.cond)}(${r.n}개)`).join(', ')} — 이 조건의 값은 흔들릴 수 있음` });
  }
  if (missing.length) lines.push({ type: 'warn', text: `결측(시편 없음): ${missing.map(r => label(r.cond)).join(', ')}` });
  if (excluded.length) {
    const agg = {};
    excluded.forEach(x => {
      const k = x.reason === '대조군' ? '대조군' : `${x.run.active_factor_name || '변수 없음'} 실험\u0001${x.reason}`;
      agg[k] = (agg[k] || 0) + 1;
    });
    const parts = Object.entries(agg).map(([k, cnt]) => {
      if (k === '대조군') return `대조군 ${cnt}개`;
      const [lab, reason] = k.split('\u0001');
      return `${lab} ${cnt}개(${reason})`;
    });
    lines.push({ type: 'info', text: `비교에서 제외: ${parts.join(', ')}` });
  }

  return {
    n: group.length, factors, common, levelsOf, rows, ranked, missing, effects, excluded, lines,
    groups: candidates.map(g => ({ sig: g.sig, n: g.n, label: g.label })), groupSig: chosen ? chosen.sig : null,
  };
}

// 조건 지도 배치: 변수 2개면 표 1장, 3개면 수준이 가장 적은 변수로 나눠 표 여러 장
export function gridLayout(factors, levelsOf) {
  if (factors.length === 2) return { split: null, row: factors[0], col: factors[1] };
  if (factors.length === 3) {
    const split = [...factors].sort((a, b) => levelsOf[a].length - levelsOf[b].length)[0];
    const [row, col] = factors.filter(f => f !== split);
    return { split, row, col };
  }
  return null;
}
