import { Component, inject, Input, Output, EventEmitter, signal, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramService } from '../../services/diagram.service';
import { CommandService } from '../../services/command.service';
import { DBEntity, DBAttribute } from '../../models/diagram.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements OnChanges {
  @Input({ required: true }) entityId = '';
  @Output() close = new EventEmitter<void>();

  diagram = inject(DiagramService);
  cmd = inject(CommandService);

  entity = signal<DBEntity | null>(null);
  editingName = signal(false);
  tempName = signal('');
  showAddColumn = signal(false);
  activeTab = signal<'attrs' | 'style'>('attrs');
  selectedAttrName = signal<string | null>(null);

  newCol = signal<Partial<DBAttribute>>({
    name: '',
    type: 'String',
    pk: false,
    fk: false,
    nullable: true,
    references: null,
    visibility: '+',
    isDerived: false,
    defaultValue: '',
  });

  stereotypes: string[] = ['None', 'Entity', 'Service', 'Repository', 'Controller', 'Enumeration', 'Interface', 'DataType'];
  classifierTypes: { label: string; value: 'class' | 'abstract_class' | 'interface' | 'enumeration' | 'datatype' }[] = [
    { label: 'Clase', value: 'class' },
    { label: 'Clase Abstracta', value: 'abstract_class' },
    { label: 'Interfaz', value: 'interface' },
    { label: 'Enumeración (Enum)', value: 'enumeration' },
    { label: 'DataType (Value Object)', value: 'datatype' },
  ];
  baseDataTypes: string[] = ['String', 'UUID', 'int', 'Integer', 'Long', 'Boolean', 'Double', 'Money', 'Date', 'DateTime', 'JSON'];
  visibilityOptions: { label: string; value: string; hint: string }[] = [
    { label: '+', value: '+', hint: 'Public' },
    { label: '-', value: '-', hint: 'Private' },
    { label: '#', value: '#', hint: 'Protected' },
    { label: '~', value: '~', hint: 'Package' },
  ];

  get availableDataTypes(): string[] {
    const custom = (this.diagram.entities() || [])
      .map((e: DBEntity) => e.name)
      .filter((n: string) => Boolean(n) && n !== this.entity()?.name);
    return Array.from(new Set([...this.baseDataTypes, ...custom]));
  }

  isEnum(): boolean {
    const e = this.entity();
    return e?.elementType === 'enumeration' || e?.stereotype?.toLowerCase() === 'enumeration';
  }

  formatVisibility(vis: string | undefined): string {
    if (!vis) return '+';
    const v = vis.trim().toLowerCase();
    if (v === 'public' || v === '+') return '+';
    if (v === 'private' || v === '-') return '-';
    if (v === 'protected' || v === '#') return '#';
    if (v === 'package' || v === '~') return '~';
    return '+';
  }

  ngOnChanges(): void {
    this.refreshEntity();
  }

  private refreshEntity(): void {
    const e = this.diagram.getEntity(this.entityId) || null;
    this.entity.set(e);
    if (e) {
      this.tempName.set(e.name);
    }
  }

  startRename(): void {
    this.tempName.set(this.entity()?.name || '');
    this.editingName.set(true);
  }

  saveName(): void {
    const name = this.tempName().trim();
    if (name && name !== this.entity()?.name) {
      this.cmd.updateEntity(this.entityId, name);
      this.refreshEntity();
    }
    this.editingName.set(false);
  }

  updateClassifierType(val: string): void {
    const isAbs = val === 'abstract_class';
    const currentName = this.entity()?.name || 'Class';
    this.cmd.updateEntity(this.entityId, currentName, {
      element_type: val,
      elementType: val,
      stereotype: val !== 'class' ? val : null,
      is_abstract: isAbs,
    } as any);
    this.refreshEntity();
  }

  updateStereotype(val: string): void {
    const st = val === 'None' ? null : val;
    this.cmd.updateEntity(this.entityId, this.entity()?.name || 'Class', { stereotype: st });
    this.refreshEntity();
  }

  toggleAbstract(): void {
    const current = !!this.entity()?.isAbstract;
    this.cmd.updateEntity(this.entityId, this.entity()?.name || 'Class', { is_abstract: !current });
    this.refreshEntity();
  }

  deleteEntity(): void {
    this.cmd.deleteEntity(this.entityId);
    this.close.emit();
  }

  startAddColumn(): void {
    this.newCol.set({
      name: '',
      type: 'String',
      pk: false,
      fk: false,
      nullable: true,
      references: null,
      visibility: '+',
      isDerived: false,
      defaultValue: '',
    });
    this.showAddColumn.set(true);
  }

  confirmAddColumn(): void {
    const col = this.newCol();
    if (!col.name?.trim()) return;

    this.cmd.addColumn(this.entityId, {
      name: col.name.trim(),
      type: col.type || 'String',
      pk: !!col.pk,
      fk: !!col.fk,
      nullable: col.nullable ?? true,
      references: col.references || null,
      visibility: col.visibility || '+',
      is_derived: !!col.isDerived,
      default_value: col.defaultValue || null,
    });
    this.showAddColumn.set(false);
    this.refreshEntity();
  }

  deleteColumn(colName: string): void {
    this.cmd.deleteColumn(this.entityId, colName);
    this.refreshEntity();
  }

  updateAttr(col: DBAttribute, changes: Partial<DBAttribute>): void {
    this.cmd.updateColumn(this.entityId, col.name, {
      ...changes,
      is_derived: changes.isDerived !== undefined ? changes.isDerived : col.isDerived,
      default_value: changes.defaultValue !== undefined ? changes.defaultValue : col.defaultValue,
    } as any);
    this.refreshEntity();
  }

  togglePk(col: DBAttribute): void {
    this.updateAttr(col, { pk: !col.pk });
  }

  toggleFk(col: DBAttribute): void {
    this.updateAttr(col, { fk: !col.fk });
  }

  toggleNullable(col: DBAttribute): void {
    this.updateAttr(col, { nullable: !col.nullable });
  }

  toggleDerived(col: DBAttribute): void {
    this.updateAttr(col, { isDerived: !col.isDerived });
  }

  updateVisibility(col: DBAttribute, vis: string): void {
    this.updateAttr(col, { visibility: vis });
  }

  updateDefaultValue(col: DBAttribute, val: string): void {
    this.updateAttr(col, { defaultValue: val || null });
  }

  toggleAttrSelect(name: string): void {
    this.selectedAttrName.set(this.selectedAttrName() === name ? null : name);
  }

  setNewColName(val: string): void {
    this.newCol.set({ ...this.newCol(), name: val });
  }

  setNewColType(val: string): void {
    this.newCol.set({ ...this.newCol(), type: val });
  }

  setNewColVisibility(val: string): void {
    this.newCol.set({ ...this.newCol(), visibility: val });
  }

  setNewColDefaultValue(val: string): void {
    this.newCol.set({ ...this.newCol(), defaultValue: val });
  }

  toggleNewColPk(): void {
    const c = this.newCol();
    this.newCol.set({ ...c, pk: !c.pk });
  }

  toggleNewColFk(): void {
    const c = this.newCol();
    this.newCol.set({ ...c, fk: !c.fk });
  }

  toggleNewColNullable(): void {
    const c = this.newCol();
    this.newCol.set({ ...c, nullable: !c.nullable });
  }

  toggleNewColDerived(): void {
    const c = this.newCol();
    this.newCol.set({ ...c, isDerived: !c.isDerived });
  }
}

