// 브라우저 안에서 SQLite(sql.js)로 SQL을 실행하는 워커. 실행마다 빈 DB를 새로 만든다.
importScripts("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js");

const ready = initSqlJs({ locateFile: (f) => new URL(f, self.location.href).href })
  .then((SQL) => { self.postMessage({ type: "ready" }); return SQL; })
  .catch((e) => self.postMessage({ type: "fatal", message: String(e && e.message || e) }));

// ---------- MySQL 호환 함수 일부 ----------
function parseDt(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
}
const pad = (n, w = 2) => String(n).padStart(w, "0");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dateFormat(v, fmt) {
  const t = parseDt(v);
  if (!t || fmt === null) return null;
  const wd = new Date(Date.UTC(t.y, t.mo - 1, t.d)).getUTCDay();
  const map = {
    Y: t.y, y: pad(t.y % 100), m: pad(t.mo), c: t.mo, d: pad(t.d), e: t.d, H: pad(t.h),
    h: pad(((t.h + 11) % 12) + 1), i: pad(t.mi), s: pad(t.s), S: pad(t.s), p: t.h < 12 ? "AM" : "PM",
    M: MONTHS[t.mo - 1], b: MONTHS[t.mo - 1].slice(0, 3), W: DAYS[wd], a: DAYS[wd].slice(0, 3),
    T: `${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}`, "%": "%",
  };
  return String(fmt).replace(/%(.)/g, (all, k) => (k in map ? String(map[k]) : all));
}
const part = (key) => (v) => { const t = parseDt(v); return t ? t[key] : null; };
const dayNum = (t) => Date.UTC(t.y, t.mo - 1, t.d) / 86400000;
function now() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

function registerMysql(db) {
  db.create_function("YEAR", part("y"));
  db.create_function("MONTH", part("mo"));
  db.create_function("DAY", part("d"));
  db.create_function("DAYOFMONTH", part("d"));
  db.create_function("HOUR", part("h"));
  db.create_function("MINUTE", part("mi"));
  db.create_function("DATE_FORMAT", dateFormat);
  db.create_function("DATEDIFF", (a, b) => { const x = parseDt(a), y = parseDt(b); return x && y ? dayNum(x) - dayNum(y) : null; });
  db.create_function("TRUNCATE", (x, n) => { if (x === null) return null; const q = 10 ** (n || 0); return Math.trunc(x * q) / q; });
  db.create_function("IF", (c, a, b) => (c ? a : b));
  db.create_function("NOW", now);
  db.create_function("CURDATE", () => now().slice(0, 10));
}

const firstLine = (s) => (s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().split("\n")[0] || "").trim().slice(0, 80);

self.onmessage = async (e) => {
  const { id, setup, code } = e.data;
  const SQL = await ready;
  const t0 = performance.now();
  const db = new SQL.Database();
  const results = [];
  let res;
  try {
    registerMysql(db);
    if (setup.trim()) {
      try { db.exec(setup); } catch (err) {
        res = { status: "SETUP_ERROR", stderr: "[스키마/데이터 오류] " + err.message, results: [] };
      }
    }
    if (!res) {
      res = { status: "OK", stderr: "", results };
      for (const stmt of db.iterateStatements(code)) {
        const sql = firstLine(stmt.getSQL());
        try {
          const cols = stmt.getColumnNames();
          const rows = [];
          let truncated = false;
          while (stmt.step()) {
            if (rows.length >= 1000) { truncated = true; break; }
            rows.push(stmt.get());
          }
          if (cols.length) results.push({ sql, columns: cols, rows, truncated });
          else results.push({ sql, message: `OK (${db.getRowsModified()} rows affected)` });
        } catch (err) {
          results.push({ sql, error: err.message });
          res = { status: "RUNTIME_ERROR", stderr: err.message, results };
          break;
        } finally {
          stmt.free();
        }
      }
    }
  } catch (err) {
    results.push({ sql: "", error: err.message });
    res = { status: "RUNTIME_ERROR", stderr: err.message, results };
  } finally {
    db.close();
  }
  res.timeMs = Math.round(performance.now() - t0);
  self.postMessage({ type: "result", id, res });
};
