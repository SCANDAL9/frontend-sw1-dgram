import { Component, inject, input, output, signal, OnInit, effect, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommandService } from '../../services/command.service';
import { DiagramService } from '../../services/diagram.service';
import { SelectionService, UMLRelationKind } from '../../services/selection.service';
import { ExportService } from '../../../../generation/schema/services/export.service';
import { WebsocketService } from '../../services/websocket.service';
import { DBAttribute, DBRelation, ClassifierType } from '../../models/diagram.model';
import { ThemeService } from '../../../../core/services/theme.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LayoutService } from '../../services/layout.service';

export type DrawerTab = 'chat' | 'export' | 'team';

export interface UMLRelationDef {
  kind: UMLRelationKind;
  label: string;
  description: string;
  iconPath: string;
  isDashed?: boolean;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './toolbar.component.html',
  host: { class: 'block w-full' },
})
export class ToolbarComponent implements OnInit {
  flowHost = input<HTMLElement | null>(null);
  boardId = input<string>('default-board');
  selectedRelationId = input<string | null>(null);
  isHistoryOpen = input<boolean>(false);
  isStudioOpen = input<boolean>(false);
  currentStudioTab = input<DrawerTab>('chat');

  openCommandPalette = output<void>();
  triggerAutoLayout = output<void>();
  deleteSelectedElements = output<void>();
  openHistory = output<void>();
  openStudioDrawer = output<DrawerTab>();

  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      this.toggleHistoryDrawer();
    }
  }

  toggleHistoryDrawer(): void {
    this.openHistory.emit();
  }



  cmd = inject(CommandService);
  diagram = inject(DiagramService);
  selection = inject(SelectionService);
  exportSvc = inject(ExportService);
  ws = inject(WebsocketService);
  theme = inject(ThemeService);
  toast = inject(ToastService);
  layoutSvc = inject(LayoutService);
  private route = inject(ActivatedRoute);

  autoLayout(): void {
    this.layoutSvc.autoLayout();
    this.toast.info('Diagrama organizado automáticamente');
  }

  showClassifierDropdown = signal(false);
  showRelationDropdown = signal(false);
  showProjectMenu = signal(false);
  showExportMenu = signal(false);

  readonly classifierOptions = [
    { type: 'class' as ClassifierType, label: 'Clase', icon: 'M3 3h18v18H3z', desc: 'Clase concreta estándar' },
    { type: 'abstract_class' as ClassifierType, label: 'Clase Abstracta', icon: 'M3 3h18v18H3z', desc: 'Clase no instanciable (/abs)' },
    { type: 'interface' as ClassifierType, label: 'Interfaz', icon: 'M3 3h18v18H3z', desc: 'Contrato «interface»' },
    { type: 'enumeration' as ClassifierType, label: 'Enumeración', icon: 'M4 6h16M4 12h16M4 18h16', desc: 'Constantes «enumeration»' },
    { type: 'datatype' as ClassifierType, label: 'DataType', icon: 'M12 2l9 5-9 5-9-5 9-5z', desc: 'Valor inmutable «dataType»' },
  ];


  toggleExportMenu(): void {
    this.showExportMenu.update((v) => !v);
    this.showProjectMenu.set(false);
  }

  exportSQL(): void {
    const ids = Array.from(this.selection.ids());
    const selectedIds = ids.length > 0 ? ids : undefined;
    this.exportSvc.downloadSql(selectedIds);
    this.toast.success(selectedIds ? 'Script SQL (seleccionados) descargado' : 'Script SQL descargado');
  }

  exportJSON(): void {
    const ids = Array.from(this.selection.ids());
    const selectedIds = ids.length > 0 ? ids : undefined;
    this.exportSvc.downloadJson(selectedIds);
    this.toast.success(selectedIds ? 'Esquema JSON (seleccionados) descargado' : 'Esquema JSON descargado');
  }

  async exportPNG(): Promise<void> {
    const host = this.flowHost();
    if (!host) return;
    const ids = Array.from(this.selection.ids());
    const selectedIds = ids.length > 0 ? ids : undefined;
    try {
      await this.exportSvc.toPng(host, 'diagram.png', selectedIds);
      this.toast.success(selectedIds ? 'Imagen PNG (seleccionados) guardada' : 'Imagen PNG guardada');
    } catch {
      this.toast.error('Error al exportar PNG');
    }
  }

  // The 6 Canonical UML Relationships (No repeated associations, no ASCII art)
  readonly umlRelations: UMLRelationDef[] = [
    {
      kind: 'Association',
      label: 'Asociación',
      description: 'Conexión estructural entre dos clases',
      iconPath: 'M3 12h18',
    },
    {
      kind: 'Generalization',
      label: 'Herencia / Generalización',
      description: 'Subclase hereda estructura de superclase',
      iconPath: 'M3 12h13 M16 7l6 5-6 5z',
    },
    {
      kind: 'Aggregation',
      label: 'Agregación',
      description: 'Todo-parte débil (componente independiente)',
      iconPath: 'M3 12h12 M15 12l3.5-4 3.5 4-3.5 4z',
    },
    {
      kind: 'Composition',
      label: 'Composición',
      description: 'Todo-parte fuerte (vida ligada al contenedor)',
      iconPath: 'M3 12h12 M15 12l3.5-4 3.5 4-3.5 4z',
    },
    {
      kind: 'Dependency',
      label: 'Dependencia',
      description: 'Uso transitorio o parámetro de método',
      iconPath: 'M3 12h15 M15 8l6 4-6 4',
      isDashed: true,
    },
    {
      kind: 'Realization',
      label: 'Realización / Interfaz',
      description: 'Implementación de contrato o interfaz',
      iconPath: 'M3 12h13 M16 7l6 5-6 5z',
      isDashed: true,
    },
  ];

  readonly currentRelationDef = computed(() => {
    const k = this.selection.currentRelationKind();
    return this.umlRelations.find((r) => r.kind === k) ?? this.umlRelations[0];
  });

  readonly selectedEntity = computed(() => {
    const id = this.selection.singleId();
    return id ? this.diagram.getEntity(id) : null;
  });

  readonly selectedRelation = computed(() => {
    const relId = this.selectedRelationId();
    if (!relId) return null;
    return this.diagram.relations().find((r) => r.id === relId) ?? null;
  });

  ngOnInit() {}

  openDrawer(tab: DrawerTab): void {
    this.openStudioDrawer.emit(tab);
  }

  toggleChatDrawer(): void {
    this.openDrawer('chat');
  }

  toggleCodegenModal(): void {
    this.openDrawer('export');
  }

  toggleMembersModal(): void {
    this.openDrawer('team');
  }

  exportSql(): void {
    const ids = Array.from(this.selection.ids());
    const selectedIds = ids.length > 0 ? ids : undefined;
    this.exportSvc.downloadSql(selectedIds);
    this.toast.success(selectedIds ? 'SQL DDL (seleccionados) exportado' : 'SQL DDL exportado');
  }

  async exportPng(): Promise<void> {
    const host = this.flowHost();
    if (!host) return;
    const ids = Array.from(this.selection.ids());
    const selectedIds = ids.length > 0 ? ids : undefined;
    try {
      await this.exportSvc.toPng(host, 'schema.png', selectedIds);
      this.toast.success(selectedIds ? 'Imagen PNG (seleccionados) guardada' : 'Imagen PNG guardada');
    } catch {
      this.toast.error('Error al generar PNG');
    }
  }

  toggleProjectMenu(): void {
    this.showProjectMenu.update((v) => !v);
    this.showExportMenu.set(false);
  }

  // --- Modeling Tools ---
  setSelectTool(): void {
    this.selection.setTool('select');
  }

  setHandTool(): void {
    this.selection.setTool('hand');
  }

  selectRelationKind(kind: UMLRelationKind): void {
    this.selection.setRelationKind(kind);
    this.showRelationDropdown.set(false);
    this.toast.info(`Herramienta: ${kind}`);
  }

  createClassifier(type: ClassifierType = 'class'): void {
    const isEnum = type === 'enumeration';
    const isAbs = type === 'abstract_class';
    const isInterface = type === 'interface';
    const isDataType = type === 'datatype';

    let prefix = 'Clase';
    if (isEnum) prefix = 'Enum';
    else if (isInterface) prefix = 'Interface';
    else if (isDataType) prefix = 'DataType';

    let n = 1;
    const names = new Set(this.diagram.entities().map(e => e.name));
    while (names.has(`${prefix}${n}`)) n++;
    const name = `${prefix}${n}`;
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : this.nextUniqueId(name);

    const count = this.diagram.entityCount();
    const cols = 3;
    const x = 100 + (count % cols) * 320;
    const y = 100 + Math.floor(count / cols) * 220;

    let initialCols: any[] = [];
    if (isEnum) {
      initialCols = [
        { name: 'VALOR_1', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'VALOR_2', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      ];
    } else if (isDataType) {
      initialCols = [
        { name: 'value', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '-' },
      ];
    } else if (isInterface) {
      initialCols = [];
    } else {
      initialCols = [
        { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
      ];
    }

    this.cmd.createEntity(
      id,
      name,
      initialCols,
      { x, y },
      {
        element_type: type,
        elementType: type,
        stereotype: type !== 'class' ? type : null,
        is_abstract: isAbs,
      }
    );
    this.selection.set([id]);
    this.diagram.pendingEditId.set(id);
    this.showClassifierDropdown.set(false);
    this.toast.success(`${prefix} ${name} creada`);
    setTimeout(() => this.diagram.pendingEditId.set(null), 2000);
  }

  createDirectTable(): void {
    this.createClassifier('class');
  }

  // --- Contextual Actions for Selected Entity / Relation ---
  addAttrToSelected(): void {
    const e = this.selectedEntity();
    if (!e) return;
    const nextColName = `attr${e.attributes.length + 1}`;
    this.cmd.addColumn(e.id, {
      name: nextColName,
      type: 'String',
      pk: false,
      fk: false,
      nullable: true,
      references: null,
      visibility: '+',
    });
    this.toast.info(`Atributo añadido a ${e.name}`);
  }

  duplicateSelected(): void {
    for (const id of [...this.selection.ids()]) {
      const src = this.diagram.getEntity(id);
      if (!src) continue;
      const newId = this.nextUniqueId(`${src.name}_copy`);
      this.cmd.createEntity(
        newId,
        `${src.name}_copy`,
        src.attributes.map((a) => ({ ...a })),
        { x: src.position.x + 36, y: src.position.y + 36 }
      );
    }
    this.toast.info('Elemento duplicado');
  }

  deleteSelected(): void {
    if (this.selection.hasSelection()) {
      for (const id of [...this.selection.ids()]) {
        this.cmd.deleteEntity(id);
      }
      this.selection.clear();
      this.toast.info('Clase eliminada');
      return;
    }
    const relId = this.selectedRelationId();
    if (relId) {
      this.cmd.deleteRelation(relId);
      this.deleteSelectedElements.emit();
      this.toast.info('Relación eliminada');
    }
  }

  // --- Cardinality & Relation Type Management ---
  parseRelationKind(typeStr: string): UMLRelationKind {
    if (!typeStr) return 'Association';
    if (typeStr.startsWith('Generalization')) return 'Generalization';
    if (typeStr.startsWith('Aggregation')) return 'Aggregation';
    if (typeStr.startsWith('Composition')) return 'Composition';
    if (typeStr.startsWith('Dependency')) return 'Dependency';
    if (typeStr.startsWith('Realization')) return 'Realization';
    return 'Association';
  }

  getSourceMultiplicity(rel: DBRelation): string {
    if (rel.sourceMultiplicity) return rel.sourceMultiplicity;
    const parts = rel.type.split(':');
    if (parts.length === 3) return parts[1];
    if (parts.length === 2) return parts[0];
    return '';
  }

  getTargetMultiplicity(rel: DBRelation): string {
    if (rel.targetMultiplicity) return rel.targetMultiplicity;
    const parts = rel.type.split(':');
    if (parts.length === 3) return parts[2];
    if (parts.length === 2) return parts[1];
    return '';
  }

  private wouldCreateGeneralizationCycle(childId: string, parentId: string, excludeRelId?: string): boolean {
    if (childId === parentId) return true;

    const visited = new Set<string>();
    const queue = [parentId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === childId) return true;
      visited.add(curr);

      const parentRelations = this.diagram.relations().filter(
        (r) =>
          r.id !== excludeRelId &&
          r.sourceId === curr &&
          (r.type.startsWith('Generalization') || r.type.startsWith('Realization'))
      );

      for (const pr of parentRelations) {
        if (!visited.has(pr.targetId)) {
          queue.push(pr.targetId);
        }
      }
    }

    return false;
  }

  updateRelationKind(kind: UMLRelationKind): void {
    const rel = this.selectedRelation();
    if (!rel) return;
    if (kind === 'Generalization' || kind === 'Realization') {
      if (this.wouldCreateGeneralizationCycle(rel.sourceId, rel.targetId, rel.id)) {
        this.toast.error('Herencia circular no permitida: crearía un ciclo en la jerarquía.');
        return;
      }
      this.cmd.updateRelation(rel.id, { type: kind });
    } else if (kind === 'Dependency') {
      this.cmd.updateRelation(rel.id, { type: kind });
    } else {
      const src = this.getSourceMultiplicity(rel);
      const tgt = this.getTargetMultiplicity(rel);
      const type = (!src && !tgt) ? kind : `${kind}:${src}:${tgt}`;
      this.cmd.updateRelation(rel.id, { type });
    }
    this.toast.info(`Tipo cambiado a ${kind}`);
  }

  updateSourceMultiplicity(val: string): void {
    const rel = this.selectedRelation();
    if (!rel) return;
    const tgt = this.getTargetMultiplicity(rel);
    this.cmd.applyMultiplicityChange(rel.id, val, tgt);
  }

  updateTargetMultiplicity(val: string): void {
    const rel = this.selectedRelation();
    if (!rel) return;
    const src = this.getSourceMultiplicity(rel);
    this.cmd.applyMultiplicityChange(rel.id, src, val);
  }

  private nextTablaName(): string {
    let n = 1;
    const names = new Set(this.diagram.entities().map(e => e.name));
    while (names.has(`Tabla${n}`)) n++;
    return `Tabla${n}`;
  }

  private nextUniqueId(name: string): string {
    const base = name.toLowerCase().replace(/\s+/g, '_');
    let id = base;
    let n = 2;
    while (this.diagram.getEntity(id)) {
      id = `${base}_${n++}`;
    }
    return id;
  }

  unlinkAssociationClass(rel: DBRelation): void {
    if (!rel.associationClassId) return;
    const assoc = this.diagram.getEntity(rel.associationClassId);
    if (assoc && assoc.attributes && assoc.attributes.length > 0) {
      const ok = typeof window !== 'undefined'
        ? window.confirm(
            `¿Deseas desvincular y eliminar la clase intermedia "${assoc.name}" con sus ${assoc.attributes.length} atributo(s)?`
          )
        : true;
      if (!ok) return;
    }
    this.cmd.unlinkAssociationClass(rel.id);
    if (assoc) {
      this.cmd.deleteEntity(assoc.id);
    }
    this.toast.info('Clase de asociación desvinculada');
  }

  getEntityName(id: string): string {
    return this.diagram.getEntity(id)?.name || id;
  }
}
