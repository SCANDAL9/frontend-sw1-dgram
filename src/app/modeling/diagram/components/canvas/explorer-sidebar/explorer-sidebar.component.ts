import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DBEntity, DBRelation } from '../../../models/diagram.model';
import { ProjectClass } from '../../../services/board.service';
import { AuthService } from '../../../../../workspace/authentication/services/auth.service';
import { ThemeService } from '../../../../../core/services/theme.service';

@Component({
  selector: 'app-explorer-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './explorer-sidebar.component.html',
})
export class ExplorerSidebarComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);

  @Input() isOpen = true;
  @Input() boardId = 'default-board';
  @Input() entities: DBEntity[] = [];
  @Input() relations: DBRelation[] = [];
  @Input() selectedEntityId: string | null = null;
  @Input() selectedRelationId: string | null = null;
  @Input() expandedEntityIds = new Set<string>();
  @Input() projectCatalogClasses: ProjectClass[] = [];
  @Input() isLoadingCatalog = false;

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleExpandEntity = new EventEmitter<string>();
  @Output() toggleAllExpand = new EventEmitter<void>();
  @Output() entitySelected = new EventEmitter<string>();
  @Output() entityJumpRequested = new EventEmitter<string>();
  @Output() relationSelected = new EventEmitter<string>();
  @Output() entityContextMenu = new EventEmitter<{ event: MouseEvent; entityId?: string }>();
  @Output() attachClass = new EventEmitter<ProjectClass>();
  @Output() importXmi = new EventEmitter<File>();
  @Output() openCodegen = new EventEmitter<void>();
  @Output() openMembers = new EventEmitter<void>();
  @Output() exportSql = new EventEmitter<void>();
  @Output() exportJson = new EventEmitter<void>();
  @Output() exportXmi = new EventEmitter<void>();
  @Output() exportPng = new EventEmitter<void>();

  readonly sidebarSearch = signal('');
  readonly isClassesSectionOpen = signal(true);
  readonly isRelationsSectionOpen = signal(true);
  readonly isProjectCatalogOpen = signal(true);
  readonly showSidebarExportMenu = signal(false);
  readonly showSidebarUserMenu = signal(false);

  readonly filteredEntities = computed(() => {
    const query = this.sidebarSearch().trim().toLowerCase();
    if (!query) return this.entities;
    return this.entities.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.attributes.some((a) => a.name.toLowerCase().includes(query))
    );
  });

  readonly filteredRelations = computed(() => {
    const query = this.sidebarSearch().trim().toLowerCase();
    if (!query) return this.relations;
    return this.relations.filter((r) => {
      const src = this.getEntityName(r.sourceId).toLowerCase();
      const tgt = this.getEntityName(r.targetId).toLowerCase();
      return src.includes(query) || tgt.includes(query) || r.type.toLowerCase().includes(query);
    });
  });

  getEntityName(id: string): string {
    return this.entities.find((e) => e.id === id)?.name ?? id;
  }

  isEntityExpanded(id: string): boolean {
    return this.expandedEntityIds.has(id);
  }

  formatVisibility(vis?: string): string {
    if (!vis) return '+';
    if (vis === 'public' || vis === '+') return '+';
    if (vis === 'private' || vis === '-') return '-';
    if (vis === 'protected' || vis === '#') return '#';
    if (vis === 'package' || vis === '~') return '~';
    return vis;
  }

  toggleExportMenu(): void {
    this.showSidebarExportMenu.update((v) => !v);
    this.showSidebarUserMenu.set(false);
  }

  toggleUserMenu(): void {
    this.showSidebarUserMenu.update((v) => !v);
    this.showSidebarExportMenu.set(false);
  }

  onXmiSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.importXmi.emit(input.files[0]);
    input.value = '';
  }
}
