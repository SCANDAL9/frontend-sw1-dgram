import { Component, Input, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FFlowModule } from '@foblex/flow';
import { DBEntity, DBAttribute } from '../../../models/diagram.model';
import { CommandService } from '../../../services/command.service';
import { DiagramService } from '../../../services/diagram.service';
import { WebsocketService } from '../../../services/websocket.service';

@Component({
  selector: 'app-table-node',
  standalone: true,
  imports: [CommonModule, FFlowModule, FormsModule],
  templateUrl: './table-node.component.html',
})
export class TableNodeComponent {
  @Input({ required: true }) entity!: DBEntity;
  private cmd = inject(CommandService);
  private diagram = inject(DiagramService);
  private ws = inject(WebsocketService);

  editing = signal(false);
  draft = signal('');
  editingAttr = signal<string | null>(null);
  draftAttrName = signal('');
  draftAttrType = signal('');

  constructor() {
    effect(() => {
      if (this.diagram.pendingEditId() === this.entity?.id) {
        setTimeout(() => this.startEdit(), 30);
      }
    });
  }

  isEnum(): boolean {
    return this.entity?.elementType === 'enumeration' || this.entity?.stereotype?.toLowerCase() === 'enumeration';
  }

  isInterface(): boolean {
    return this.entity?.elementType === 'interface' || this.entity?.stereotype?.toLowerCase() === 'interface';
  }

  isDataType(): boolean {
    return this.entity?.elementType === 'datatype' || this.entity?.stereotype?.toLowerCase() === 'datatype';
  }

  isAbstract(): boolean {
    return !!this.entity?.isAbstract || this.entity?.elementType === 'abstract_class' || this.entity?.stereotype?.toLowerCase() === 'abstract';
  }

  getStereotypeClass(st: string | null | undefined): string {
    if (!st) return '';
    const s = st.toLowerCase();
    if (s === 'enumeration' || s === 'enum') {
      return 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    }
    if (s === 'interface') {
      return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    if (s === 'datatype' || s === 'data_type') {
      return 'bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
    }
    if (s === 'abstract' || s === 'abstract_class') {
      return 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
    return 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
  }

  formatVisibility(vis: string | undefined, isPk: boolean = false): string {
    if (!vis) return isPk ? '-' : '+';
    const v = vis.trim().toLowerCase();
    if (v === 'public' || v === '+') return '+';
    if (v === 'private' || v === '-') return '-';
    if (v === 'protected' || v === '#') return '#';
    if (v === 'package' || v === '~') return '~';
    return isPk ? '-' : '+';
  }

  getVisibilityColor(vis: string | undefined, isPk: boolean): string {
    return 'text-zinc-400 dark:text-zinc-500 font-mono font-medium';
  }

  startEdit(): void {
    this.draft.set(this.entity.name);
    this.editing.set(true);
    this.ws.sendSelection([this.entity.id], this.entity.id);
    setTimeout(() => {
      const el = document.getElementById(`uml-name-${this.entity.id}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 0);
  }

  confirm(): void {
    const v = this.draft().trim();
    if (v && v !== this.entity.name) this.cmd.updateEntity(this.entity.id, v);
    this.editing.set(false);
    this.ws.sendSelection([this.entity.id], null);
  }

  cancel(): void {
    this.editing.set(false);
    this.ws.sendSelection([this.entity.id], null);
  }

  startEditAttr(col: DBAttribute): void {
    this.editingAttr.set(col.name);
    this.draftAttrName.set(col.name);
    this.draftAttrType.set(col.type);
    this.ws.sendSelection([this.entity.id], this.entity.id);
    setTimeout(() => {
      const el = document.getElementById(`attr-${this.entity.id}-${col.name}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 0);
  }

  confirmAttr(origName: string): void {
    const name = this.draftAttrName().trim();
    const type = this.draftAttrType().trim() || 'String';
    if (!name) {
      this.editingAttr.set(null);
      this.ws.sendSelection([this.entity.id], null);
      return;
    }
    if (name !== origName) {
      const col = this.entity.attributes.find((a) => a.name === origName);
      if (col) {
        this.cmd.updateColumn(this.entity.id, origName, { name, type });
      }
    } else {
      const col = this.entity.attributes.find((a) => a.name === origName);
      if (col && type !== col.type) this.cmd.updateColumn(this.entity.id, origName, { type });
    }
    this.editingAttr.set(null);
    this.ws.sendSelection([this.entity.id], null);
  }

  cancelAttr(): void {
    this.editingAttr.set(null);
    this.ws.sendSelection([this.entity.id], null);
  }

  addAttrInline(): void {
    const base = 'newAttr';
    let n = 1;
    let name = `${base}${n}`;
    while (this.entity.attributes.some((a) => a.name === name)) {
      n++;
      name = `${base}${n}`;
    }
    this.cmd.addColumn(this.entity.id, {
      name,
      type: 'String',
      pk: false,
      fk: false,
      nullable: true,
      references: null,
      visibility: '+',
    });
    setTimeout(() => this.startEditAttr({ name, type: 'String', pk: false, fk: false, nullable: true, references: null }), 50);
  }
}
