import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type Status = 'ready' | 'local-executing';

@Injectable({
  providedIn: 'root'
})
export class StatusService extends BehaviorSubject<Status> {

  constructor() {
    super('ready');
  }
}
