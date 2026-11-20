// TeaVM javac(브라우저용 Java 컴파일러)를 띄우는 워커. teavm.org/playground 의 worker.js 와 같은 동작.
(async function () {
  const teavm = await import("./compiler.wasm-runtime.js");
  const compiler = await teavm.load("compiler.wasm");
  compiler.exports.installWorker();
})();
