import { Injectable } from '@angular/core';
import { ILocalTerm, PyodideIO } from './pyodide.service';
import { Subject } from 'rxjs';
import { FileLocalService } from './file-local.service';

@Injectable({
  providedIn: 'root'
})
export class ReplService {

  io: PyodideIO;

  constructor(private flService: FileLocalService) {
    this.io = new PyodideIO(flService);
    this.init();
  }

  private async init() {
    const delayedLoadHint = setTimeout(() => {
      this.io.output("正在加载 Python 解释器。首次加载可能需要数十秒到数分钟不等。\n");
    }, 100);
    await this.io.initPromise;
    clearTimeout(delayedLoadHint);
    await this.io.enableReplInterface();
  }
}
