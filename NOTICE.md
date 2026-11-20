# Cote IDE — 사용한 오픈소스

이 사이트는 코드를 서버 없이 브라우저 안에서 실행하기 위해 아래 오픈소스를 그대로 포함하거나 불러옵니다.

| 구성 요소 | 용도 | 라이선스 | 출처 |
|---|---|---|---|
| Pyodide 0.26.4 (`py/`) | 브라우저용 Python | MPL-2.0 | https://github.com/pyodide/pyodide |
| TeaVM javac (`java/`) | 브라우저용 Java 컴파일러 | Apache-2.0 (TeaVM), GPL-2.0 with Classpath Exception (OpenJDK javac·클래스 라이브러리) | https://github.com/konsoletyper/teavm-javac |
| sql.js 1.10.3 (`sql/`) | 브라우저용 SQLite | MIT | https://github.com/sql-js/sql.js |
| Monaco Editor 0.45.0 | 코드 편집기 (cdnjs에서 불러옴) | MIT | https://github.com/microsoft/monaco-editor |

각 파일은 위 프로젝트가 배포한 빌드를 그대로 사용했습니다. 단, `java/compile-classlib-teavm.bin`은 클래스 파일 안에 남아 있던 TeaVM 내부 이름(`org/teavm/classlib/java/util/TMap$Entry` 등)을 표준 이름(`java/util/Map$Entry`)으로 바꿨습니다. 이 수정이 없으면 `Map.Entry` 같은 중첩 타입을 컴파일할 수 없습니다.
