// Copyright (C) 2022 Clavicode Team
//
// This file is part of clavicode-frontend.
//
// clavicode-frontend is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// clavicode-frontend is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with clavicode-frontend.  If not, see <http://www.gnu.org/licenses/>.

/// <reference lib="webworker" />

import * as Comlink from 'comlink';
import { FS_PATCH } from './constants';
import { openLocal, closeLocal } from './fs.worker';
import type {
  PyodideExecutionResult,
  PyodideRemote,
  ReplInterface,
  SelfType,
} from './type';

const PYODIDE_VERSION = 'v0.19.0';

importScripts(
  `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`
);
declare let loadPyodide: any;

const Self: SelfType = self as any;

const decoder = new TextDecoder();

async function init(
  inCb: () => void,
  inBuf: Uint8Array,
  inMeta: Int32Array,
  outCb: (s: string) => void,
  errCb: (s: string) => void,
  int: Uint8Array
) {
  const inputCallback = () => {
    inCb();
    Atomics.wait(inMeta, 1, 0);
    Atomics.store(inMeta, 1, 0);
    const size = Atomics.exchange(inMeta, 0, 0);
    if (size === -1) return null;
    const bytes = inBuf.slice(0, size);
    const line = decoder.decode(bytes);
    return line;
  };
  Self.pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`,
    stdin: inputCallback,
    stdout: outCb,
    stderr: errCb,
  });
  Self.pyodide.setInterruptBuffer(int);
  // await Self.pyodide.loadPackage(["numpy", "pytz"]);
  console.log(Self.pyodide);
}

export function initFs(
  readDataBuffer: Uint8Array,
  readMetaBuffer: Int32Array,
  readCallback: () => void,
  writeDataBuffer: Uint8Array,
  writeMetaBuffer: Int32Array,
  writeCallback: () => void
) {
  Self.pyodide.FS.mkdir('/mnt');
  Self.pyodide.FS.mkdir('/mnt/local');
  Self.fsRDataBuffer = readDataBuffer;
  Self.fsRMetaBuffer = readMetaBuffer;
  Self.fsWDataBuffer = writeDataBuffer;
  Self.fsWMetaBuffer = writeMetaBuffer;
  Self.fsWCallback = writeCallback;
  Self.fsRCallback = readCallback;
  Self['open_local'] = (path: string, mode: string) => {
    const r = openLocal(path, mode);
    console.log(r);
    return r;
  };
  Self['close_local'] = (path: string, data: any) =>
    closeLocal(path, data.toJs());
}

const REPL_INIT_CODE = `
import sys
from pyodide import to_js
from pyodide.console import PyodideConsole, repr_shorten, BANNER
import __main__
BANNER = "This is the Pyodide terminal emulator.\\n" + BANNER
pyconsole = PyodideConsole(__main__.__dict__)
import builtins
async def await_fut(fut):
    res = await fut
    if res is not None:
        builtins._ = res
    return to_js([res], depth=1)
def clear_console():
    pyconsole.buffer = []
`;

async function runCode(code: string): Promise<PyodideExecutionResult> {
  try {
    await Self.pyodide.loadPackagesFromImports(code);
    code = FS_PATCH + code;
    let result = await Self.pyodide.runPythonAsync(code);
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error,
    };
  }
}

async function getReplInterface(
  outCb: (s: string) => void, 
  errCb: (s: string) => void, 
  promptCb: (s: string) => void): Promise<ReplInterface> {
  const globals = Self.pyodide.globals;
  await Self.pyodide.runPythonAsync(REPL_INIT_CODE);
  const repr_shorten = globals.get('repr_shorten');
  const banner = globals.get('BANNER');
  const await_fut = globals.get('await_fut');
  const pyconsole = globals.get('pyconsole');
  const clear_console = globals.get('clear_console');
  const ps1 = ">>> ";
  const ps2 = "... ";

  async function interpreter(command: string) {
    // multiline should be splitted (useful when pasting)
    let prompt = ps1;
    for (const c of command.split("\n")) {
      let fut = pyconsole.push(c);
      prompt = fut.syntax_check === "incomplete" ? ps2 : ps1;
      switch (fut.syntax_check) {
        case "syntax-error":
          errCb(fut.formatted_error.trimEnd());
          continue;
        case "incomplete":
          continue;
        case "complete":
          break;
        default:
          throw new Error(`Unexpected type ${fut.syntax_check}`);
      }
      // In JavaScript, await automatically also awaits any results of
      // awaits, so if an async function returns a future, it will await
      // the inner future too. This is not what we want so we
      // temporarily put it into a list to protect it.
      let wrapped = await_fut(fut);
      // complete case, get result / error and print it.
      try {
        let [value] = await wrapped;
        if (value !== undefined) {
          outCb(
            repr_shorten.callKwargs(value, {
              separator: "\n[[;orange;]<long output truncated>]\n",
            })
          );
        }
        if (Self.pyodide.isPyProxy(value)) {
          value.destroy();
        }
      } catch (e) {
        if (e !== null && typeof e === "object" && "constructor" in e && e.constructor.name === "PythonError") {
          const message = fut.formatted_error ?? (("message" in e) ? e.message : String(e)) ;
          errCb(message);
        } else {
          throw e;
        }
      } finally {
        fut.destroy();
        wrapped.destroy();
      }
    }
    promptCb(prompt);
  }
  pyconsole.stdout_callback = (s: string) => outCb(s);
  pyconsole.stderr_callback = (s: string) => errCb(s.trimEnd());
  outCb(banner + "\n");
  promptCb(ps1);

  return Comlink.proxy(interpreter);
}

Comlink.expose(<PyodideRemote>{ init, initFs, runCode, getReplInterface });
