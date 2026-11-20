// 컴파일된 Java 프로그램(WebAssembly)을 실행하는 워커. 입력은 main의 인자로 전달한다.
// 무한 루프는 페이지가 이 워커를 종료하는 방식으로 끊는다.
import { load } from "./compiler.wasm-runtime.js";

const LIMIT = 1 << 20;

self.onmessage = async (e) => {
  const { id, wasm, arg } = e.data;
  let stdout = "", stderr = "", status = "OK";
  const t0 = performance.now();
  try {
    const mod = await load(wasm, {
      installImports(o) {
        o.teavmConsole.putcharStdout = (c) => { if (stdout.length < LIMIT) stdout += String.fromCharCode(c); };
        o.teavmConsole.putcharStderr = (c) => { if (stderr.length < LIMIT) stderr += String.fromCharCode(c); };
      },
    });
    mod.exports.main([arg]);
  } catch (err) {
    status = "RUNTIME_ERROR";
    const text = describe(err);
    // Java 예외는 프로그램이 이미 이름·메시지를 출력했으므로 덧붙이지 않는다
    if (text && !stderr.includes(text)) stderr += (stderr && !stderr.endsWith("\n") ? "\n" : "") + text;
  }
  self.postMessage({ type: "result", id, res: { status, stdout, stderr, timeMs: Math.round(performance.now() - t0) } });
};

// WebAssembly 실행 오류를 Java 예외 이름으로 바꿔 보여준다
function describe(err) {
  const msg = String((err && err.message) || err);
  if (/could not fetch message/.test(msg)) return "";
  const map = [
    [/array element access out of bounds|index out of bounds/i, "java.lang.ArrayIndexOutOfBoundsException (배열 범위를 벗어난 접근)"],
    [/null pointer|null reference|dereferencing a null/i, "java.lang.NullPointerException (null 값을 사용함)"],
    [/Maximum call stack size exceeded|too much recursion|call stack exhausted/i,
      "java.lang.StackOverflowError (재귀가 너무 깊습니다. 브라우저 버전은 약 1만 단계까지만 가능합니다)"],
    [/divide by zero|division by zero/i, "java.lang.ArithmeticException: / by zero"],
    [/illegal cast/i, "java.lang.ClassCastException"],
    [/out of memory|Out of memory/i, "java.lang.OutOfMemoryError"],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  return msg;
}
