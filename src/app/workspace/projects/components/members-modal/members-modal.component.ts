import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../authentication/services/auth.service';


export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'editor' | 'viewer';
  joined_at?: string;
}

@Component({
  selector: 'app-members-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './members-modal.component.html',
})
export class MembersModalComponent implements OnInit {
  private http = inject(HttpClient);
  public auth = inject(AuthService);

  @Input({ required: true }) boardId!: string;
  @Output() closed = new EventEmitter<void>();

  members = signal<ProjectMember[]>([]);
  loading = signal(false);
  inviting = signal(false);
  errorMsg = signal<string | null>(null);

  inviteEmail = '';
  inviteRole: 'editor' | 'viewer' = 'editor';

  ngOnInit() {
    this.loadMembers();
  }

  close() {
    this.closed.emit();
  }

  loadMembers() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.http.get<ProjectMember[]>(`${environment.apiUrl}/boards/${this.boardId}/members`).subscribe({
      next: (list) => {
        this.members.set(list || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  handleInvite() {
    if (!this.inviteEmail.trim()) return;
    this.inviting.set(true);
    this.errorMsg.set(null);

    const payload = {
      email: this.inviteEmail.trim(),
      role: this.inviteRole,
    };

    const url = `${environment.apiUrl}/boards/${this.boardId}/members/invite`;

    this.http.post<ProjectMember>(url, payload).subscribe({
      next: () => {
        this.inviting.set(false);
        this.inviteEmail = '';
        this.loadMembers();
      },
      error: (err) => {
        this.inviting.set(false);
        this.errorMsg.set(err.error?.detail || 'Error al invitar al colaborador');
      },
    });
  }

  removeMember(userId: string) {
    this.http.delete(`${environment.apiUrl}/boards/${this.boardId}/members/${userId}`).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.user_id !== userId));
      },
      error: () => {
        this.loadMembers();
      },
    });
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'owner': return 'Propietario';
      case 'editor': return 'Editor';
      case 'viewer': return 'Lector';
      default: return role;
    }
  }
}
