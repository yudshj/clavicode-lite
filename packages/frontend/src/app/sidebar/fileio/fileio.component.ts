import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { Subscription, catchError, firstValueFrom, of, take, timeout } from 'rxjs';
import { EditorService } from 'src/app/services/editor.service';
import { PyodideService } from 'src/app/services/pyodide.service';
import { StatusService } from 'src/app/services/status.service';

@Component({
  selector: 'app-fileio',
  templateUrl: './fileio.component.html',
  styleUrls: ['./fileio.component.scss']
})
export class FileioComponent implements OnInit {

  constructor(private router: Router,
    private notification: NzNotificationService,
    private editorService: EditorService,
    private statusService: StatusService,
    private pyodideService: PyodideService) {
  }


  ngOnInit(): void {
  }

  stdin  = "";


  get enabled() {
    return this.statusService.value === 'ready';
  }
  
  stdout: string = "";
  async compile() {
    const subscriptions: Subscription[] = [];
    const stdinLines = this.stdin.split("\n");
    this.stdout = "";
    subscriptions.push(this.pyodideService.io.readRequest.subscribe(() => {
      if (stdinLines.length > 0) {
        this.pyodideService.io.readResponse.next(stdinLines.shift() ?? null);
      } else {
        this.pyodideService.io.readResponse.next(null);
      }
    }));
    subscriptions.push(this.pyodideService.io.writeRequest.subscribe((v) => {
      this.stdout += v;
      this.pyodideService.io.writeResponse.next();
    }));
    this.pyodideService.runCode(this.editorService.getCode(), false);
    const result = await firstValueFrom(this.pyodideService.io.closed.pipe(
      take(1),
      timeout(5000),
      catchError(() => of('Time limit exceeded')),
    ));
    if (result !== null) {
      console.log(result);
      const lastLine = result.trim().split("\n").pop();
      this.notification.error("运行错误", lastLine ?? "未知错误");
    }
    subscriptions.forEach(s => s.unsubscribe());
  }
}
