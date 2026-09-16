import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WebsocketService, Peer } from '../../../../modeling/diagram/services/websocket.service';


@Component({
  selector: 'app-presence',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './presence.component.html',
})
export class PresenceComponent {
  ws = inject(WebsocketService);

  showChat = signal(false);
  draft = signal('');

  peers(): Peer[] {
    return this.ws.peers();
  }

  toggleChat(): void {
    this.showChat.set(!this.showChat());
  }

  send(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.ws.sendChat(text);
    this.draft.set('');
  }
}