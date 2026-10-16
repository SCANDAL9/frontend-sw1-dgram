import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DBEntity, DBRelation } from '../../models/diagram.model';
import { ProjectClass } from '../../models/board.model';
import { User } from '../../../../workspace/authentication/models/auth.models';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-explorer-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './explorer-sidebar.component.html',
  host: {
    class: 'h-full flex flex-col shrink-0 overflow-hidden',
  },
})
export class ExplorerSidebarComponent {
  theme = inject(ThemeService);

  isOpen = input<boolean>(true);
  boardId = input<string>('default-board');
  currentUser = input<User | null>(null);
  entities = input<DBEntity[]>([]);
  relations = input<DBRelation[]>([]);
  selectedEntityId = input<string | null>(null);
  selectedRelationId = input<string | null>(null);
  expandedEntityIds = input<Set<string>>(new Set<string>());
  projectCatalogClasses = input<ProjectClass[]>([]);
  isLoadingCatalog = input<boolean>(false);

  toggleSidebar = output<void>();
  toggleExpandEntity = output<string>();
  toggleEntityVisibility = output<string>();
  toggleAllExpand = output<void>();
  entitySelected = output<string>();
  entityJumpRequested = output<string>();
  relationSelected = output<string>();
  entityContextMenu = output<{ event: MouseEvent; entityId?: string }>();
  attachClass = output<ProjectClass>();
  deleteCatalogClass = output<ProjectClass>();
  importXmi = output<File>();
  openCodegen = output<void>();
  openMembers = output<void>();
  openAuth = output<void>();
  openProfile = output<void>();
  logout = output<void>();
  exportSql = output<void>();
  exportJson = output<void>();
  exportXmi = output<void>();
  exportPng = output<void>();

  readonly sidebarSearch = signal('');
  readonly showCatalogModal = signal(false);
  readonly catalogSearch = signal('');
  readonly showSidebarExportMenu = signal(false);
  readonly showSidebarUserMenu = signal(false);

  readonly filteredEntities = computed(() => {
    const query = this.sidebarSearch().trim().toLowerCase();
    const list = this.entities();
    if (!query) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.attributes.some((a) => a.name.toLowerCase().includes(query))
    );
  });

  readonly filteredCatalogClasses = computed(() => {
    const query = this.catalogSearch().trim().toLowerCase();
    const list = this.projectCatalogClasses();
    if (!query) return list;
    return list.filter((c) => c.name.toLowerCase().includes(query));
  });

  readonly filteredRelations = computed(() => {
    const query = this.sidebarSearch().trim().toLowerCase();
    const list = this.relations();
    if (!query) return list;
    return list.filter((r) => {
      const src = this.getEntityName(r.sourceId).toLowerCase();
      const tgt = this.getEntityName(r.targetId).toLowerCase();
      return src.includes(query) || tgt.includes(query) || r.type.toLowerCase().includes(query);
    });
  });

  isEntityOnBoard(pCls: ProjectClass): boolean {
    return this.entities().some(
      (e) => e.id === pCls.id || e.name.toLowerCase() === pCls.name.toLowerCase()
    );
  }

  jumpTo(pCls: ProjectClass): void {
    const existing = this.entities().find(
      (e) => e.id === pCls.id || e.name.toLowerCase() === pCls.name.toLowerCase()
    );
    if (existing) {
      this.entityJumpRequested.emit(existing.id);
    }
  }

  getEntityName(id: string): string {
    return this.entities().find((e) => e.id === id)?.name ?? id;
  }

  isEntityExpanded(id: string): boolean {
    return this.expandedEntityIds().has(id);
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
