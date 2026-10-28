import { NextResponse } from 'next/server';
import { uploadFile, getSignedUrl, downloadText } from '@/lib/storage';

// 판단기준: 매뉴얼(JSON)과 품질 기준서 원문(PDF).
// 코드 저장소가 공개라서 내용은 저장소에 넣지 않고 비공개 버킷에만 둔다 — 앱에 로그인해야 받을 수 있다.
const DIR = 'foam-experiment/_guide';
const PATHS = { manual: `${DIR}/manual.json`, pdf: `${DIR}/standard.pdf` };
const MAX_BYTES = 20 * 1024 * 1024;

export async function GET() {
  try {
    const text = await downloadText(PATHS.manual);
    const manual = text ? JSON.parse(text) : null;
    const pdfUrl = await getSignedUrl(PATHS.pdf); // 원문이 없으면 null
    return NextResponse.json({ manual, pdfUrl });
  } catch (e) {
    return NextResponse.json({ error: e?.message ?? 'load failed' }, { status: 500 });
  }
}

// 교체: multipart { kind: 'manual' | 'pdf', file }. 저장 경로는 서버가 정한 두 곳뿐이다.
export async function POST(req) {
  try {
    const formData = await req.formData();
    const kind = String(formData.get('kind') ?? '');
    const file = formData.get('file');
    if (!PATHS[kind] || !file) {
      return NextResponse.json({ ok: false, error: 'kind(manual|pdf)·file 필요' }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: '20MB 이하만 올릴 수 있음' }, { status: 413 });
    }
    if (kind === 'manual') {
      const m = JSON.parse(new TextDecoder().decode(bytes)); // 깨진 JSON 은 저장하지 않음
      if (!m?.title || !Array.isArray(m.sections)) {
        return NextResponse.json({ ok: false, error: '매뉴얼 형식 오류: title·sections 필요' }, { status: 400 });
      }
      await uploadFile(PATHS.manual, bytes, 'application/json');
    } else {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
        return NextResponse.json({ ok: false, error: 'PDF 파일이 아님' }, { status: 400 });
      }
      await uploadFile(PATHS.pdf, bytes, 'application/pdf');
    }
    return NextResponse.json({ ok: true, path: PATHS[kind] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? '저장 실패' }, { status: 500 });
  }
}
