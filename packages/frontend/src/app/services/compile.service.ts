// Copyright (C) 2021 Clavicode Team
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
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { CppCompileRequest, CppCompileResponse , GccDiagnostics } from '../api';
import { NzNotificationDataOptions, NzNotificationService } from 'ng-zorro-antd/notification';
import { EditorService } from './editor.service';
import { Router } from '@angular/router';
import { PyodideService } from './pyodide.service';
import { of, Subscription, firstValueFrom } from 'rxjs';
import { catchError, take, timeout } from 'rxjs/operators';

const COMPILE_URL = `//${environment.backendHost}/cpp/compile`;

@Injectable({
  providedIn: 'root'
})
export class CompileService {

  private notifyOption: NzNotificationDataOptions = {
    nzDuration: 3000
  };

  stdin: string = "";

  constructor(private http: HttpClient, private editorService: EditorService,
              private router: Router,
              private notification: NzNotificationService,
              private pyodideService: PyodideService,
              ) {
  }

  private code() {
    return this.editorService.getCode();
  }

  async fileCompile() {
      const subscriptions: Subscription[] = [];
      const stdinLines = this.stdin.split("\n");
      let stdout = "";
      subscriptions.push(this.pyodideService.readRequest.subscribe(() => {
        if (stdinLines.length > 0) {
          this.pyodideService.readResponse.next(stdinLines.shift() ?? null);
        } else {
          this.pyodideService.readResponse.next(null);
        }
      }));
      subscriptions.push(this.pyodideService.writeRequest.subscribe((v) => {
        stdout += v;
        this.pyodideService.writeResponse.next();
      }));
      this.pyodideService.runCode(this.editorService.getCode(), false);
      const result = await firstValueFrom(this.pyodideService.closed.pipe(
        take(1),
        timeout(3000),
        catchError(() => of('Time limit exceeded')),
      ));
      if (result !== null) {
        console.log(result);
        const lastLine = result.trim().split("\n").pop();
        this.notification.error("运行错误", lastLine ?? "未知错误");
      }
      subscriptions.forEach(s => s.unsubscribe());
      return stdout;
  }
}
