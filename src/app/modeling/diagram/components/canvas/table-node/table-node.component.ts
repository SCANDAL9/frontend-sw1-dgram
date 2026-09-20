import { Component, input, output, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FFlowModule } from '@foblex/flow';
import { DBEntity, DBAttribute } from '../../../models/diagram.model';

@Component({
  selector: 'app-table-node',
  standalone: true,
  imports: [CommonModule, FFlowModule, FormsModule],
  templateUrl: './table-node.component.html',
})
export class TableNodeComponent {
  entity = input.required<DBEntity>();
  packageName = input<string | null>(null);
  isPendingEdit = input<boolean>(false);

  editStarted = output<string>();
  editEnded = output<string>();
  entityRenamed = output<{ id: string; name: string }>();
  attrUpdated = output<{ entityId: string; origName: string; changes: { name?: string; type?: string } }>();
  attrAdded = output<{ entityId: string; attr: Partial<DBAttribute> }>();
  entityResized = output<{ id: string; width: number; height: number }>();

  editing = signal(false);
  draft = signal('');
  editingAttr = signal<string | null>(null);
  draftAttrName = signal('');
  draftAttrType = signal('');

  readonly isEnum = computed(() => {
    const e = this.entity();
    return e?.elementType === 'enumeration' || e?.stereotype?.toLowerCase() === 'enumeration';
  });

  readonly isInterface = computed(() => {
    const e = this.entity();
    return e?.elementType === 'interface' || e?.stereotype?.toLowerCase() === 'interface';
  });

  readonly isDataType = computed(() => {
    const e = this.entity();
    return e?.elementType === 'datatype' || e?.stereotype?.toLowerCase() === 'datatype';
  });

  readonly isAbstract = computed(() => {
    const e = this.entity();
    return !!e?.isAbstract || e?.elementType === 'abstract_class' || e?.stereotype?.toLowerCase() === 'abstract';
  });

  constructor() {
    effect(() => {
      if (this.isPendingEdit()) {
        setTimeout(() => this.startEdit(), 30);
      }
    });
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
    const e = this.entity();
    this.draft.set(e.name);
    this.editing.set(true);
    this.editStarted.emit(e.id);
    setTimeout(() => {
      const el = document.getElementById(`uml-name-${e.id}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 0);
  }

  confirm(): void {
    const e = this.entity();
    const v = this.draft().trim();
    if (v && v !== e.name) {
      this.entityRenamed.emit({ id: e.id, name: v });
    }
    this.editing.set(false);
    this.editEnded.emit(e.id);
  }

  cancel(): void {
    this.editing.set(false);
    this.editEnded.emit(this.entity().id);
  }

  startEditAttr(col: DBAttribute): void {
    const e = this.entity();
    this.editingAttr.set(col.name);
    this.draftAttrName.set(col.name);
    this.draftAttrType.set(col.type);
    this.editStarted.emit(e.id);
    setTimeout(() => {
      const el = document.getElementById(`attr-${e.id}-${col.name}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 0);
  }

  confirmAttr(origName: string): void {
    const e = this.entity();
    const name = this.draftAttrName().trim();
    const type = this.draftAttrType().trim() || 'String';
    if (!name) {
      this.editingAttr.set(null);
      this.editEnded.emit(e.id);
      return;
    }
    if (name !== origName) {
      this.attrUpdated.emit({ entityId: e.id, origName, changes: { name, type } });
    } else {
      const col = e.attributes.find((a) => a.name === origName);
      if (col && type !== col.type) {
        this.attrUpdated.emit({ entityId: e.id, origName, changes: { type } });
      }
    }
    this.editingAttr.set(null);
    this.editEnded.emit(e.id);
  }

  cancelAttr(): void {
    this.editingAttr.set(null);
    this.editEnded.emit(this.entity().id);
  }

  addAttrInline(): void {
    const e = this.entity();
    const base = 'newAttr';
    let n = 1;
    let name = `${base}${n}`;
    while (e.attributes.some((a) => a.name === name)) {
      n++;
      name = `${base}${n}`;
    }
    const newAttr: Partial<DBAttribute> = {
      name,
      type: 'String',
      pk: false,
      fk: false,
      nullable: true,
      references: null,
      visibility: '+',
    };
    this.attrAdded.emit({ entityId: e.id, attr: newAttr });
    setTimeout(
      () =>
        this.startEditAttr({
          name,
          type: 'String',
          pk: false,
          fk: false,
          nullable: true,
          references: null,
        }),
      50
    );
  }

  onResizeStart(e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const ent = this.entity();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = ent.width || 200;
    const startHeight = ent.height || 120;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(160, Math.round(startWidth + (moveEvent.clientX - startX)));
      const newHeight = Math.max(80, Math.round(startHeight + (moveEvent.clientY - startY)));
      ent.width = newWidth;
      ent.height = newHeight;
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const finalWidth = Math.max(160, Math.round(startWidth + (upEvent.clientX - startX)));
      const finalHeight = Math.max(80, Math.round(startHeight + (upEvent.clientY - startY)));
      this.entityResized.emit({ id: ent.id, width: finalWidth, height: finalHeight });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
}
