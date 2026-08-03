import { Pool } from 'pg';

// 회사 공용 DB(pg) 접속 — 브라우저에 노출되지 않는 서버 전용 모듈.
// 테이블은 public 이 아니라 app_260609_c0pz 스키마에 있으므로 search_path 로 지정한다.
// TLS 는 접속 문자열의 sslmode 로 처리한다. 인증서 검증을 끄는 코드
// (ssl:{rejectUnauthorized:false})는 쓰지 않는다.
// 회사 풀러(pooler)는 자체 서명 루트를 써서 표준 verify-full 이 실패하므로,
// 접속 문자열에 libpq 호환 sslmode(require=암호화)를 지정한다.
// 사용자가 받은 문자열을 그대로 넣어도 되도록, 없으면 자동으로 붙인다.
let pool = null;

function withSsl(url) {
  if (!url) return url;
  if (/[?&]sslmode=/.test(url)) return url; // 이미 지정돼 있으면 존중
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}uselibpqcompat=true&sslmode=require`;
}

export default function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: withSsl(process.env.DATABASE_URL),
      max: 3,
      options: '-c search_path=app_260609_c0pz,public',
    });
  }
  return pool;
}

export async function q(text, params) {
  return getPool().query(text, params);
}

// 여러 쿼리를 하나의 트랜잭션으로 실행 (지웠다가 다시 넣는 류의 다중 쓰기용)
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
