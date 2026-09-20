import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User } from '../../../authentication/models/auth.models';

@Component({
  selector: 'app-project-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './project-header.component.html',
})
export class ProjectHeaderComponent {
  searchQuery = input<string>('');
  currentUser = input<User | null>(null);
  isDark = input<boolean>(false);

  searchQueryChange = output<string>();
  toggleTheme = output<void>();
  openProfile = output<void>();
  openAuth = output<void>();
  logout = output<void>();
  createBoard = output<void>();
}
