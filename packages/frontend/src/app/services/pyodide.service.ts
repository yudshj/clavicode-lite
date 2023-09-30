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

import { Injectable } from '@angular/core';
import { PyodideRemote } from '../pyodide/type';
import * as Comlink from 'comlink';
import { Subject, firstValueFrom } from 'rxjs';
import { take, tap } from 'rxjs/operators';
import { DialogService } from '@ngneat/dialog';
import { ExecuteDialogComponent } from '../execute-dialog/execute-dialog.component';
import { terminalWidth } from '../execute-dialog/xterm/xterm.component';
import { StatusService } from './status.service';
import {
  CHUNK_SIZE,
  FS_PATCH_LINENO,
  MAX_PATH,
  MT_CREATE,
  MT_DONE,
  MT_LEN,
  MT_OFFSET,
  MT_PATH,
} from '../pyodide/constants';
import { FileLocalService } from './file-local.service';
import { NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

const INPUT_BUF_SIZE = 128 * 1024;
const encoder = new TextEncoder();

/**
 * Make stdout "unbuffered".
 *
 * Override sys.stdout, with write redefined:
 * - If the string to be written is ends with newline, then
 *   output the original string.
 * - Else, add an extra newline to the end, with a special
 *   character `\xff` as a mark.
 *
 * Pyodide only call `stdout(str)` when a newline is produced.
 * So the above strategy make every write to stdout is
 * observable. When a line output ends with `\xff`, then should
 * not print a newline with it.
 */
const STDOUT_UNBUFFER_PATCH = `
def patch_stdout():
    import sys
    class Wrapper:
        def write(self, s: str):
            if (s.endswith('\\n')):
                return sys.__stdout__.write(s)
            else:
                return sys.__stdout__.write(s + '\\xff\\n')
    sys.stdout = Wrapper()
patch_stdout()
del patch_stdout
`;
const STDOUT_UNBUFFER_PATCH_LINENO =
  STDOUT_UNBUFFER_PATCH.match(/\n/g)?.length ?? 0;

interface ControlToken {
  canceled: boolean;
  onLoaded?: () => void;
}

export interface ILocalTerm {
  /** prompt */
  readRequest: Subject<string | null>;
  /** Responsing `null` for EOF. */
  readResponse: Subject<string | null>;
  writeRequest: Subject<string>;
  writeResponse: Subject<void>;

  /** Emit value when Ctrl-C. */
  // interrupt: Subject<void>;

  /** Emit value when code execution complete. */
  closed: Subject<string | null>;

  onSlowStartup?: (cToken: ControlToken) => void;
  onStartup?: () => void;
}

interface RunCodeOptions {
  showDialog: boolean;
}

class WorkerManager {
  private worker: Comlink.Remote<PyodideRemote>;

  constructor() {
    if (typeof Worker === 'undefined') throw Error('Web worker not supported');
    const worker = new Worker(
      new URL('../pyodide/pyodide.worker.ts', import.meta.url)
    );
    this.worker = Comlink.wrap(worker);
  }

  async initIo(io: PyodideIO) {
    const inputCb = () => {
      io.input().then((str) => {
        if (str === null) {
          Atomics.store(io.inputMeta, 0, -1);
        } else {
          let bytes = encoder.encode(str);
          if (bytes.length > io.inputBuffer.length) {
            alert('Input is too long');
            bytes = bytes.slice(0, io.inputBuffer.length);
          }
          io.inputBuffer.set(bytes, 0);
          Atomics.store(io.inputMeta, 0, bytes.length);
        }
        Atomics.store(io.inputMeta, 1, 1);
        Atomics.notify(io.inputMeta, 1);
      });
    };
    await this.worker.init(
      Comlink.proxy(inputCb),
      io.inputBuffer,
      io.inputMeta,
      Comlink.proxy((s) => {
        if (s.endsWith('\xff')) {
          io.output(s.substring(0, s.length - 1));
        } else {
          io.output(s + '\n');
        }
      }),
      Comlink.proxy((s) => io.output(s + '\n')),
      io.interruptBuffer
    );
  }

  //
  // File system
  //

  private fsRDataBuffer = new Uint8Array(new SharedArrayBuffer(CHUNK_SIZE));
  private fsRMetaBuffer = new Int32Array(
    new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT + MAX_PATH)
  );
  private fsWDataBuffer = new Uint8Array(new SharedArrayBuffer(CHUNK_SIZE));
  private fsWMetaBuffer = new Int32Array(
    new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT + MAX_PATH)
  );

  initFs(flService: FileLocalService) {
    const getFilePath = (metaBuffer: Int32Array) => {
      let path = '';
      for (let i = 0; ; i++) {
        const int32 = metaBuffer[MT_PATH + Math.floor(i / 4)];
        const int8 = (int32 >> ((i % 4) * 8)) & 0xff;
        if (int8 === 0) break;
        path += String.fromCharCode(int8);
      }
      return path;
    };
    const readCallback = () => {
      const create = this.fsRMetaBuffer[MT_CREATE];
      const offset = this.fsRMetaBuffer[MT_OFFSET];
      const path = getFilePath(this.fsRMetaBuffer);
      // console.log({ create, offset, path });
      flService.readRaw(path, offset, create).then(([size, buffer]) => {
        this.fsRMetaBuffer[MT_LEN] = size;
        if (buffer !== null) {
          const writeSize = Math.min(size, CHUNK_SIZE);
          this.fsRDataBuffer.set(buffer.subarray(0, writeSize), 0);
        }
        Atomics.store(this.fsRMetaBuffer, MT_DONE, 1);
        Atomics.notify(this.fsRMetaBuffer, MT_DONE);
      });
    };
    const writeCallback = () => {
      const path = getFilePath(this.fsWMetaBuffer);
      const len = this.fsWMetaBuffer[MT_LEN];
      const offset = this.fsWMetaBuffer[MT_OFFSET];
      // console.log({ len, offset, path });
      const data = new Uint8Array(len);
      data.set(this.fsWDataBuffer.subarray(0, len));
      flService.writeRaw(path, offset, data).then((result) => {
        this.fsWMetaBuffer[MT_LEN] = result;
        Atomics.store(this.fsWMetaBuffer, MT_DONE, 1);
        Atomics.notify(this.fsWMetaBuffer, MT_DONE);
      });
    };
    this.worker.initFs(
      this.fsRDataBuffer,
      this.fsRMetaBuffer,
      Comlink.proxy(readCallback),
      this.fsWDataBuffer,
      this.fsWMetaBuffer,
      Comlink.proxy(writeCallback)
    );
  }

  async runCode(code: string) {
    return await this.worker.runCode(code);
  }
  async getReplInterface(outputCb: (s: string) => void, errCb: (s: string) => void,  promptCb: (s: string) => void) {
    return await this.worker.getReplInterface(Comlink.proxy(outputCb), Comlink.proxy(errCb), Comlink.proxy(promptCb));
  }
}

export interface RunCodeResult {
  result: any;
  globals: any;
};

export class PyodideIO implements ILocalTerm {
  private worker = new WorkerManager();

  readonly readRequest = new Subject<string | null>();
  readonly readResponse = new Subject<string | null>();
  readonly writeRequest = new Subject<string>();
  readonly writeResponse = new Subject<void>();
  readonly closed = new Subject<string | null>();

  readonly inputBuffer = new Uint8Array(new SharedArrayBuffer(INPUT_BUF_SIZE));
  // [ input_len, written ]
  readonly inputMeta = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2)
  );

  readonly interruptBuffer = new Uint8Array(new SharedArrayBuffer(1));

  readonly initPromise: Promise<void>;

  constructor(flService: FileLocalService) {
    this.initPromise = this.worker
      .initIo(this)
      .then(() => this.worker.initFs(flService))
      .catch((e) => {
        console.error(e);
        alert(`初始化解释器时出现错误：${e}，建议刷新页面。`);
      });
  }

  async input(prompt?: string): Promise<string | null> {
    const r = firstValueFrom(this.readResponse.pipe(take(1)));
    this.readRequest.next(prompt ? prompt : null);
    return r;
  }

  async output(str: string) {
    const r = firstValueFrom(this.writeResponse.pipe(take(1)));
    this.writeRequest.next(str);
    return r;
  }

  async runCode(code: string, cToken?: ControlToken) {
    await this.initPromise;
    if (cToken?.canceled) {
      return;
    }
    this.interruptBuffer[0] = 0;
    if (cToken?.onLoaded) {
      cToken.onLoaded();
    }
    code = STDOUT_UNBUFFER_PATCH + code;
    const result = await this.worker.runCode(code);
    if (result.success) {
      this.close();
    } else {
      // Correct line numbers
      let SHIFT_LINENO = FS_PATCH_LINENO + STDOUT_UNBUFFER_PATCH_LINENO;
      let errorMsg: string = result.error.message;
      const regex = /File "<exec>", line (\d+)/g;
      let match = regex.exec(errorMsg);
      while (match !== null) {
        const line = parseInt(match[1]) - SHIFT_LINENO;
        errorMsg = errorMsg.replace(match[0], `File "<exec>", line ${line}`);
        match = regex.exec(errorMsg);
      }
      this.close(errorMsg);
    }
  }

  close(result: string | null = null) {
    this.interruptBuffer[0] = 2;
    // Wait for all stdout printed. Any better solution?
    setTimeout(() => this.closed.next(result), 100);
  }

  async enableReplInterface() {
    let interpreter: (s: string) => void;
    const promptCb = async (s: string) => {
      const input = await this.input(s);
      interpreter(input ?? '');
    };
    interpreter = await this.worker.getReplInterface(
      (s) => { this.output(s); },
      (s) => { this.output(s); },
      promptCb
    );
  }
}

@Injectable({
  providedIn: 'root',
})
export class PyodideService {
  readonly io: PyodideIO;

  constructor(
    private modal: NzModalService,
    private flService: FileLocalService,
    private statusService: StatusService,
    private dialogService: DialogService
  ) {
    this.io = new PyodideIO(flService);
  }

  async runCode(code: string, showDialog = true) {
    let ref: NzModalRef | null = null;
    let ctrlToken: ControlToken = {
      canceled: false,
      onLoaded: () => {
        ref?.close();
        clearTimeout(delayedModalLoad);
        if (showDialog) {
          this.openDialog();
        }
      }
    }
    const delayedModalLoad = setTimeout(() => {
      ref = this.modal.create({
        nzTitle: '解释器加载中...',
        nzContent: '首次加载可能需要数十秒到数分钟不等。',
        nzClosable: false,
        nzMaskClosable: false,
        nzFooter: [
          {
            label: '取消',
            onClick: () => {
              ctrlToken.canceled = true;
              ref?.destroy();
            },
          },
        ],
      });
    }, 100);
    try {
      this.statusService.next('local-executing');
      await this.io.runCode(code, ctrlToken);
    } finally {
      this.statusService.next('ready');
    }
  }

  private openDialog() {
    const ref = this.dialogService.open(ExecuteDialogComponent, {
      draggable: true,
      width: `${terminalWidth()}px`,
      dragConstraint: 'constrain',
    });
    ref.afterClosed$.subscribe(() => {
      this.io.close();
      this.statusService.next('ready');
    });
  }
}
