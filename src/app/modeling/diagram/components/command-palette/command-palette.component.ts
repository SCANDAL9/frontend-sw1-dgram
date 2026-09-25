import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DBEntity } from '../../models/diagram.model';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  category: 'class' | 'action';
  action: () => void;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-palette.component.html',
})
export class CommandPaletteComponent {
  entities = input<DBEntity[]>([]);
  isDark = input<boolean>(false);

  close = output<void>();
  jumpToEntity = output<string>();
  createClass = output<void>();
  toggleTheme = output<void>();
  triggerCodegen = output<void>();
  triggerExportSql = output<void>();
  triggerExportPng = output<void>();
  triggerMembers = output<void>();
  triggerAutoLayout = output<void>();
  triggerAiChat = output<void>();

  query = signal('');
  selectedIndex = signal(0);

  allItems = computed<CommandItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const items: CommandItem[] = [];

    // 1. Clases
    for (const e of this.entities()) {
      items.push({
        id: `class-${e.id}`,
        title: e.name,
        subtitle: `${e.attributes.length} attrs ${e.stereotype ? '· «' + e.stereotype + '»' : ''}`,
        category: 'class',
        action: () => {
          this.jumpToEntity.emit(e.id);
          this.close.emit();
        },
      });
    }

    // 2. Acciones Rápidas
    items.push(
      {
        id: 'action-new-class',
        title: 'Crear Nueva Clase',
        subtitle: 'Añadir entidad al canvas',
        category: 'action',
        action: () => {
          this.createClass.emit();
          this.close.emit();
        },
      },
      {
        id: 'action-auto-layout',
        title: 'Auto-Organizar Diagrama',
        subtitle: 'Alinear y distribuir entidades',
        category: 'action',
        action: () => {
          this.triggerAutoLayout.emit();
          this.close.emit();
        },
      },
      {
        id: 'action-toggle-theme',
        title: `Alternar a ${this.isDark() ? 'Modo Claro' : 'Modo Oscuro'}`,
        subtitle: 'Cambiar apariencia visual',
        category: 'action',
        action: () => {
          this.toggleTheme.emit();
          this.close.emit();
        },
      },
      {
        id: 'action-ai-chat',
        title: 'Asistente IA',
        subtitle: 'Generar diagrama desde texto o fotos',
        category: 'action',
        action: () => {
          this.triggerAiChat.emit();
          this.close.emit();
        },
      },
      {
        id: 'action-spring-boot',
        title: 'Generar Spring Boot JPA',
        subtitle: 'Crear bundle backend Java',
        category: 'action',
        action: () => {
          this.triggerCodegen.emit();
          this.close.emit();
        },
      },
      {
        id: 'action-export-sql',
        title: 'Exportar PostgreSQL DDL',
        subtitle: 'Descargar archivo schema.sql',
        category: 'action',
        action: () => {
          this.triggerExportSql.emit();
          this.close.emit();
        },
      },
      {
        id: 'action-members',
        title: 'Gestionar Colaboradores',
        subtitle: 'Invitar usuarios y roles',
        category: 'action',
        action: () => {
          this.triggerMembers.emit();
          this.close.emit();
        },
      }
    );

    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.subtitle && i.subtitle.toLowerCase().includes(q))
    );
  });

  filteredItems = computed(() => this.allItems());
  classItems = computed(() => this.filteredItems().filter((i) => i.category === 'class'));
  actionItems = computed(() => this.filteredItems().filter((i) => i.category === 'action'));

  getItemGlobalIndex(item: CommandItem): number {
    return this.filteredItems().findIndex((i) => i.id === item.id);
  }

  handleKeydown(e: KeyboardEvent): void {
    const count = this.filteredItems().length;
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex.update((i) => (i + 1) % count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex.update((i) => (i - 1 + count) % count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = this.filteredItems()[this.selectedIndex()];
      if (current) this.execute(current);
    } else if (e.key === 'Escape') {
      this.close.emit();
    }
  }

  execute(item: CommandItem): void {
    item.action();
  }
}
