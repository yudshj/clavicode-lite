import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { BehaviorSubject, Observable } from 'rxjs';
import { EditorService } from './editor.service';
import { FileLocalService } from './file-local.service';
import { PyodideService } from './pyodide.service';
import { StatusService } from './status.service';
import { TabsService } from './tabs.service';

type Action = {
  name: string;
  icon?: string;
  shortcut?: string;
  enabled: () => boolean;
  run: () => void;
};

@Injectable({
  providedIn: 'root'
})
export class ActionService {

  constructor(
    private eventManager: EventManager,
    @Inject(DOCUMENT) private document: Document,
    private pyodideService: PyodideService,
    private tabsService: TabsService,
    private flService: FileLocalService,
    private editorService: EditorService,
    private statusService: StatusService) {
      for (const i in this.actions) {
        const action = this.actions[i];
        if (action.shortcut) {
          this.addShortcut(action.shortcut).subscribe(() => {
            if (action.enabled()) action.run();
          });
        }
      }
    }

  readonly actions: Record<string, Action> = {
    'compile.interactive': {
      name: '编译运行',
      icon: 'play-circle',
      shortcut: 'control.b',
      enabled: () => {
        const type = this.tabsService.getActive()[0]?.type;
        return type === 'pinned' || type === 'local';
      },
      run: async () => {
        this.pyodideService.runCode(this.editorService.getCode());
      }
    },
    'file.save': {
      name: '保存',
      icon: 'save',
      shortcut: 'control.s',
      enabled: () => this.tabsService.getActive()[0]?.type === 'local',
      run: () => this.flService.save(this.tabsService.getActive()[0])
    }
  }

  runAction(id: string): void {
    const action = this.actions[id];
    if (action?.enabled()) action.run();
  }

  private addShortcut(key: string) {
    const event = `keydown.${key}`;
    return new Observable<KeyboardEvent>((observer) => {
      const handler = (e: KeyboardEvent) => {
        e.preventDefault();
        observer.next(e);
      };
      const dispose = this.eventManager.addEventListener(
        this.document.body, event, handler
      );
      return () => dispose();
    });
  }

}
