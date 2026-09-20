import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-project-filters',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-filters.component.html',
})
export class ProjectFiltersComponent {
  activeTab = input<'boards' | 'projects'>('boards');
  boardCount = input<number>(0);
  projectCount = input<number>(0);
  viewMode = input<'grid' | 'list'>('grid');

  activeTabChange = output<'boards' | 'projects'>();
  viewModeChange = output<'grid' | 'list'>();
  openCreateProject = output<void>();
}
