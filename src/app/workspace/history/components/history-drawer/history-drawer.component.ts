import {
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HistoryItem, HistoryDetail } from '../../models/history.model';
import { HistoryTimeAgoPipe } from '../../pipes/history-time-ago.pipe';
import { HistoryCommandIconPipe } from '../../pipes/history-command-icon.pipe';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';

@Component({
  selector: 'app-history-drawer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HistoryTimeAgoPipe,
    HistoryCommandIconPipe,
    ModalComponent,
  ],
  templateUrl: './history-drawer.component.html',
})
export class HistoryDrawerComponent {
  boardId = input.required<string>();
  isOpen = input<boolean>(false);
  items = input<HistoryItem[]>([]);
  loading = input<boolean>(false);
  selectedDetail = input<HistoryDetail | null>(null);
  detailLoading = input<boolean>(false);
  restoring = input<boolean>(false);
  diagramVersion = input<number>(1);

  closed = output<void>();
  refresh = output<void>();
  filterActorChange = output<'all' | 'user' | 'ai'>();
  itemExpanded = output<string>();
  restoreRequested = output<number>();

  filterActor = signal<'all' | 'user' | 'ai'>('all');
  searchQuery = signal('');
  expandedItemId = signal<string | null>(null);
  confirmRestoreVersion = signal<number | null>(null);

  filteredItems = computed(() => {
    const list = this.items();
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return list;
    return list.filter((item) => {
      const summary = (item.summary || '').toLowerCase();
      const type = (item.command_type || '').toLowerCase();
      const target = (item.target_name || '').toLowerCase();
      return summary.includes(query) || type.includes(query) || target.includes(query);
    });
  });

  setFilterActor(actor: 'all' | 'user' | 'ai'): void {
    this.filterActor.set(actor);
    this.filterActorChange.emit(actor);
  }

  toggleExpand(item: HistoryItem): void {
    if (this.expandedItemId() === item.id) {
      this.expandedItemId.set(null);
      return;
    }
    this.expandedItemId.set(item.id);
    this.itemExpanded.emit(item.id);
  }

  promptRestore(version: number | null | undefined): void {
    if (version === null || version === undefined || version <= 0) return;
    this.confirmRestoreVersion.set(version);
  }

  cancelRestore(): void {
    this.confirmRestoreVersion.set(null);
  }

  executeRestore(): void {
    const targetVer = this.confirmRestoreVersion();
    if (!targetVer) return;
    this.restoreRequested.emit(targetVer);
    this.confirmRestoreVersion.set(null);
  }

  close(): void {
    this.closed.emit();
  }
}
