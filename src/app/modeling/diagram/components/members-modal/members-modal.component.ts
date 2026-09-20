import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardMember } from '../../models/board.model';
import { MemberRolePipe } from '../../pipes/member-role.pipe';

@Component({
  selector: 'app-members-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MemberRolePipe],
  templateUrl: './members-modal.component.html',
})
export class MembersModalComponent {
  boardId = input.required<string>();
  members = input<BoardMember[]>([]);
  loading = input<boolean>(false);
  inviting = input<boolean>(false);
  errorMsg = input<string | null>(null);
  currentUserId = input<string | null>(null);

  invite = output<{ email: string; role: 'editor' | 'viewer' }>();
  changeRole = output<{ userId: string; role: 'editor' | 'viewer' }>();
  removeMember = output<string>();
  closed = output<void>();

  inviteEmail = '';
  inviteRole: 'editor' | 'viewer' = 'editor';

  readonly isCurrentUserOwner = computed(() => {
    const uid = this.currentUserId();
    if (!uid) return false;
    const currentMember = this.members().find((m) => m.user_id === uid);
    return currentMember?.role === 'owner';
  });

  close(): void {
    this.closed.emit();
  }

  handleInvite(): void {
    if (!this.inviteEmail.trim()) return;
    this.invite.emit({
      email: this.inviteEmail.trim(),
      role: this.inviteRole,
    });
    this.inviteEmail = '';
  }

  handleRoleChange(userId: string, newRole: 'editor' | 'viewer'): void {
    this.changeRole.emit({ userId, role: newRole });
  }

  handleRemoveMember(userId: string): void {
    this.removeMember.emit(userId);
  }
}
