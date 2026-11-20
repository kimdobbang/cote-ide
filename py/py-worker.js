// 브라우저 안에서 Python(Pyodide)을 실행하는 워커.
// 무한 루프는 페이지가 이 워커를 종료(terminate)하는 방식으로 끊는다.
importScripts("pyodide.js");

const HARNESS = `
import sys, io, json, traceback, inspect

def _cote_tb(e):
    # 실행기 프레임은 숨기고 사용자 코드(main.py / solution.py) 위치부터 보여준다
    tb = e.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename not in ("main.py", "solution.py"):
        tb = tb.tb_next
    return "".join(traceback.format_exception(type(e), e, tb))

def _cote_capture(fn):
    out, err = io.StringIO(), io.StringIO()
    old = sys.stdout, sys.stderr, sys.stdin
    sys.stdout, sys.stderr = out, err
    status, extra = "OK", None
    try:
        extra = fn()
    except SystemExit as e:
        if e.code not in (None, 0):
            status = "RUNTIME_ERROR"
            err.write(f"SystemExit: {e.code}\\n")
    except _CoteInputError as e:
        status = "INPUT_ERROR"
        err.write(str(e) + "\\n")
    except BaseException as e:
        status = "RUNTIME_ERROR"
        err.write(_cote_tb(e))
    finally:
        sys.stdout, sys.stderr, sys.stdin = old
    return status, out.getvalue(), err.getvalue(), extra

class _CoteInputError(Exception):
    pass

def _cote_stdin(code, data):
    def run():
        sys.stdin = io.StringIO(data)
        exec(compile(code, "main.py", "exec"), {"__name__": "__main__"})
    s, o, e, _ = _cote_capture(run)
    return json.dumps({"status": s, "stdout": o, "stderr": e})

def _cote_conv(o):
    if isinstance(o, (list, tuple)):
        return [_cote_conv(x) for x in o]
    if isinstance(o, (set, frozenset)):
        return [_cote_conv(x) for x in sorted(o, key=repr)]
    if isinstance(o, dict):
        return {str(k): _cote_conv(v) for k, v in o.items()}
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return str(o)
    if o is None or isinstance(o, (str, int, float, bool)):
        return o
    return repr(o)

def _cote_func(code, args_json):
    args = json.loads(args_json)
    def run():
        g = {"__name__": "solution"}
        exec(compile(code, "solution.py", "exec"), g)
        fn = g.get("solution")
        if fn is None:
            raise _CoteInputError("solution 함수가 정의되어 있지 않습니다.")
        try:
            inspect.signature(fn).bind(*args)
        except TypeError:
            n = len(inspect.signature(fn).parameters)
            raise _CoteInputError(f"파라미터 개수가 다릅니다: solution은 {n}개, 입력값은 {len(args)}개")
        return json.dumps(_cote_conv(fn(*args)), ensure_ascii=False)
    s, o, e, res = _cote_capture(run)
    return json.dumps({"status": s, "stdout": o, "stderr": e, "result": res})
`;

let pyodide = null;
const ready = (async () => {
  pyodide = await loadPyodide({ indexURL: new URL(".", self.location.href).href });
  pyodide.runPython(HARNESS);
  self.postMessage({ type: "ready" });
})().catch((e) => self.postMessage({ type: "fatal", message: String(e && e.message || e) }));

self.onmessage = async (e) => {
  const { id, kind, code, input, args } = e.data;
  await ready;
  const t0 = performance.now();
  let res;
  try {
    const g = pyodide.globals;
    const fn = g.get(kind === "func" ? "_cote_func" : "_cote_stdin");
    res = JSON.parse(fn(code, kind === "func" ? args : input));
    fn.destroy();
  } catch (err) {
    res = { status: "RUNTIME_ERROR", stdout: "", stderr: String(err && err.message || err) };
  }
  res.timeMs = Math.round(performance.now() - t0);
  self.postMessage({ type: "result", id, res });
};
