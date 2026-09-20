import { Component, input, output, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DBEntity, DBAttribute, UmlPackage } from '../../models/diagram.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  entity = input<DBEntity | null>(null);
  packages = input<UmlPackage[]>([]);
  availableDataTypes = input<string[]>([]);

  close = output<void>();
  entityDeleted = output<string>();
  nameChanged = output<{ id: string; name: string }>();
  classifierTypeChanged = output<{ id: string; val: string; isAbstract: boolean }>();
  stereotypeChanged = output<{ id: string; stereotype: string | null }>();
  abstractToggled = output<{ id: string; isAbstract: boolean }>();
  columnAdded = output<{ id: string; col: Partial<DBAttribute> }>();
  columnDeleted = output<{ id: string; colName: string }>();
  columnUpdated = output<{ id: string; colName: string; changes: Partial<DBAttribute> }>();
  packageAssigned = output<{ id: string; pkgId: string }>();
  packageCreatedAndAssigned = output<{ id: string; name: string }>();

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

  readonly dataTypesList = computed<string[]>(() => {
    const custom = (this.availableDataTypes() || []).filter(
      (n: string) => Boolean(n) && n !== this.entity()?.name
    );
    return Array.from(new Set([...this.baseDataTypes, ...custom]));
  });

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

  constructor() {
    effect(() => {
      const e = this.entity();
      if (e) {
        this.tempName.set(e.name);
      }
    });
  }

  startRename(): void {
    this.tempName.set(this.entity()?.name || '');
    this.editingName.set(true);
  }

  saveName(): void {
    const e = this.entity();
    const name = this.tempName().trim();
    if (e && name && name !== e.name) {
      this.nameChanged.emit({ id: e.id, name });
    }
    this.editingName.set(false);
  }

  updateClassifierType(val: string): void {
    const e = this.entity();
    if (e) {
      const isAbs = val === 'abstract_class';
      this.classifierTypeChanged.emit({ id: e.id, val, isAbstract: isAbs });
    }
  }

  updateStereotype(val: string): void {
    const e = this.entity();
    if (e) {
      const st = val === 'None' ? null : val;
      this.stereotypeChanged.emit({ id: e.id, stereotype: st });
    }
  }

  toggleAbstract(): void {
    const e = this.entity();
    if (e) {
      this.abstractToggled.emit({ id: e.id, isAbstract: !e.isAbstract });
    }
  }

  deleteEntity(): void {
    const e = this.entity();
    if (e) {
      this.entityDeleted.emit(e.id);
      this.close.emit();
    }
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
    const e = this.entity();
    const col = this.newCol();
    if (!e || !col.name?.trim()) return;

    this.columnAdded.emit({
      id: e.id,
      col: {
        name: col.name.trim(),
        type: col.type || 'String',
        pk: !!col.pk,
        fk: !!col.fk,
        nullable: col.nullable ?? true,
        references: col.references || null,
        visibility: col.visibility || '+',
        isDerived: !!col.isDerived,
        defaultValue: col.defaultValue || null,
      },
    });
    this.showAddColumn.set(false);
  }

  deleteColumn(colName: string): void {
    const e = this.entity();
    if (e) {
      this.columnDeleted.emit({ id: e.id, colName });
    }
  }

  updateAttr(col: DBAttribute, changes: Partial<DBAttribute>): void {
    const e = this.entity();
    if (e) {
      this.columnUpdated.emit({
        id: e.id,
        colName: col.name,
        changes: {
          ...changes,
          isDerived: changes.isDerived !== undefined ? changes.isDerived : col.isDerived,
          defaultValue: changes.defaultValue !== undefined ? changes.defaultValue : col.defaultValue,
        },
      });
    }
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

  updatePackage(pkgId: string): void {
    const e = this.entity();
    if (e) {
      this.packageAssigned.emit({ id: e.id, pkgId });
    }
  }

  createPackageAndAssign(name: string): void {
    const e = this.entity();
    const trimmed = name.trim();
    if (!e || !trimmed) return;
    this.packageCreatedAndAssigned.emit({ id: e.id, name: trimmed });
  }
}
