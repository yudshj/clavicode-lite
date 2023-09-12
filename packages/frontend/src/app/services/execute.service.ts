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
import { Observable, Observer, Subject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { WebsocketService } from './websocket.service';
import { RuntimeError, WsDebugGdbS2C, WsExecuteC2S, WsExecuteS2C } from '../api';
import { DialogService } from '@ngneat/dialog';
import { ExecuteDialogComponent } from '../execute-dialog/execute-dialog.component';
import { terminalWidth } from '../execute-dialog/xterm/xterm.component';
import { StatusService } from './status.service';

// export const TEMP_EXECUTE_TOKEN = "0344a132-6e41-46c9-81b1-08fcb795b0cd";
// const EXECUTE_URL = `ws://${environment.backendHost}/ws/execute/${TEMP_EXECUTE_TOKEN}`;

export interface IRemoteTermService {
  sender: Observer<{ type: 'tin', content: string }> | null;
  receiver: Observable<WsExecuteS2C | WsDebugGdbS2C> | null;
}

@Injectable({
  providedIn: 'root'
})
export class ExecuteService implements IRemoteTermService {
  public sender: Observer<WsExecuteC2S> | null = null;
  public receiver: Observable<WsExecuteS2C> | null = null;

  constructor(
    private statusService: StatusService,
    private dialogService: DialogService,
    private wsService: WebsocketService) {
  }

  private openDialog() {
    const ref = this.dialogService.open(ExecuteDialogComponent, {
      draggable: true,
      width: `${terminalWidth()}px`,
      dragConstraint: 'constrain'
    });
    ref.afterClosed$.subscribe(() => {
      this.close();
    });
  }

  close() {
    if (this.sender === null) return;
    this.sender.next({
      type: 'shutdown'
    });
    this.sender.complete();
    this.sender = null;
    this.receiver = null;
    this.statusService.next('ready');
  }

}
