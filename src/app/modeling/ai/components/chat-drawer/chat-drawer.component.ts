import { Component, Input, Output, EventEmitter, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { DiagramService } from '../../../diagram/services/diagram.service';
import { WebsocketService } from '../../../diagram/services/websocket.service';
import { AuthService } from '../../../../workspace/authentication/services/auth.service';

export interface ChatMsg {
  id?: string;
  sender_type: 'user' | 'ai' | 'system';
  user_id?: string | null;
  content: string;
  created_at?: string;
  commands?: any[];
  agent?: string;
  traces?: any[];
}

@Component({
  selector: 'app-chat-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-drawer.component.html',
})
export class ChatDrawerComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private diagram = inject(DiagramService);
  private ws = inject(WebsocketService);
  public auth = inject(AuthService);

  @Input({ required: true }) boardId!: string;
  @Input() isOpen = signal(false);
  @Output() closed = new EventEmitter<void>();
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  messages = signal<ChatMsg[]>([]);
  inputText = '';
  loading = signal(false);
  loadingStatus = signal('Procesando con Vertex AI...');
  selectedImage = signal<File | null>(null);
  pendingConfirmation = signal<{
    title?: string;
    description: string;
    commands: any[];
    isVision?: boolean;
    detectedEntities?: string[];
  } | null>(null);

  // Web Speech API
  isSpeechSupported = signal(
    typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition)
  );
  isRecording = signal(false);
  private recognition: any = null;

  ngOnInit() {
    this.loadHistory();
  }

  ngOnDestroy() {
    this.stopVoiceRecognition();
  }

  close() {
    this.stopVoiceRecognition();
    this.closed.emit();
  }

  // --- Web Speech API ---
  toggleVoiceRecognition() {
    if (this.isRecording()) {
      this.stopVoiceRecognition();
      return;
    }
    this.startVoiceRecognition();
  }

  private startVoiceRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'es-ES';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isRecording.set(true);
      };

      this.recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          this.inputText = transcript;
        }
      };

      this.recognition.onerror = (err: any) => {
        console.warn('Speech recognition error:', err);
        this.isRecording.set(false);
      };

      this.recognition.onend = () => {
        this.isRecording.set(false);
      };

      this.recognition.start();
    } catch (e) {
      console.error('Error starting speech recognition:', e);
      this.isRecording.set(false);
    }
  }

  private stopVoiceRecognition() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.isRecording.set(false);
  }

  loadHistory() {
    this.http.get<ChatMsg[]>(`${environment.apiUrl}/chat/boards/${this.boardId}/messages`).subscribe({
      next: (msgs) => {
        this.messages.set(msgs || []);
        this.scrollToBottom();
      },
      error: () => {},
    });
  }

  sendQuick(prompt: string) {
    this.inputText = prompt;
    this.sendMessage();
  }

  onEnterPress(e: Event) {
    const ke = e as KeyboardEvent;
    if (!ke.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedImage.set(input.files[0]);
    }
  }

  removeImage() {
    this.selectedImage.set(null);
  }

  sendMessage() {
    const text = this.inputText.trim();
    const image = this.selectedImage();
    if (!text && !image) return;

    this.loading.set(true);

    if (image) {
      // Flujo de Vision OCR
      this.loadingStatus.set('Analizando boceto con Vertex AI Vision...');
      const formData = new FormData();
      formData.append('file', image);
      if (text) formData.append('prompt', text);
      const userId = this.auth.currentUser()?.id || this.ws.userId();
      if (userId) formData.append('user_id', userId);

      this.messages.update((prev) => [
        ...prev,
        {
          sender_type: 'user',
          content: text ? `[Boceto adjunto]: ${text}` : '[Boceto de diagrama adjunto]',
        },
      ]);
      this.inputText = '';
      this.selectedImage.set(null);
      this.scrollToBottom();

      this.http.post<any>(`${environment.apiUrl}/chat/boards/${this.boardId}/vision`, formData).subscribe({
        next: (res) => {
          this.loading.set(false);
          this.handleAiResponse(res, true);
        },
        error: (err) => {
          this.loading.set(false);
          this.messages.update((prev) => [
            ...prev,
            {
              sender_type: 'ai',
              content: 'Ocurrió un error al procesar la imagen con Vertex AI.',
            },
          ]);
          this.scrollToBottom();
        },
      });
    } else {
      // Flujo de texto estándar
      this.loadingStatus.set('Generando respuesta y comandos...');
      this.messages.update((prev) => [
        ...prev,
        {
          sender_type: 'user',
          content: text,
        },
      ]);
      this.inputText = '';
      this.scrollToBottom();

      const payload = {
        text,
        user_id: this.auth.currentUser()?.id || this.ws.userId(),
      };

      this.http.post<any>(`${environment.apiUrl}/chat/boards/${this.boardId}/message`, payload).subscribe({
        next: (res) => {
          this.loading.set(false);
          this.handleAiResponse(res, false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messages.update((prev) => [
            ...prev,
            {
              sender_type: 'ai',
              content: 'Error de comunicación con el asistente IA.',
            },
          ]);
          this.scrollToBottom();
        },
      });
    }
  }

  private handleAiResponse(res: any, isVision: boolean = false) {
    const replyText = res.reply || 'Comandos aplicados al diagrama.';
    const commands: any[] = res.commands || [];

    // Previsualización y confirmación previa obligatoria para Vision OCR
    if (isVision && commands.length > 0) {
      const classNames = commands
        .filter((c) => (c.command_type === 'CREATE_ENTITY' || c.command_type === 'CREATE_CLASS') && c.payload?.name)
        .map((c) => c.payload.name);

      const desc =
        classNames.length > 0
          ? `Se detectaron ${classNames.length} entidad(es) en el boceto (${classNames.join(', ')}). ¿Deseas aplicarlas al lienzo?`
          : `Se detectaron ${commands.length} cambio(s) a partir del boceto. ¿Deseas aplicarlos al lienzo?`;

      this.pendingConfirmation.set({
        title: 'Previsualización Vision OCR',
        description: desc,
        commands: commands,
        isVision: true,
        detectedEntities: classNames,
      });

      this.messages.update((prev) => [
        ...prev,
        {
          sender_type: 'ai',
          content: replyText + '\n\n*(Boceto analizado. Revisa la previsualización antes de aplicar al diagrama)*',
        },
      ]);
      this.scrollToBottom();
      return;
    }

    const isDestructive = commands.some((cmd) =>
      cmd.command_type === 'DELETE_ENTITY' ||
      cmd.command_type === 'DELETE_CLASS' ||
      cmd.command_type === 'DELETE_COLUMN' ||
      cmd.command_type === 'DELETE_ATTRIBUTE' ||
      cmd.command_type === 'DELETE_RELATION' ||
      cmd.command_type === 'DELETE_ASSOCIATION'
    );

    if (isDestructive) {
      const desc = commands.length === 1
        ? `Se solicita una acción destructiva (${commands[0].command_type}). ¿Deseas aplicarla?`
        : `Se solicitan ${commands.length} acciones que incluyen eliminaciones en el diagrama. ¿Deseas aplicarlas?`;

      this.pendingConfirmation.set({
        title: 'Confirmación requerida',
        description: desc,
        commands: commands,
        isVision: false,
      });

      this.messages.update((prev) => [
        ...prev,
        {
          sender_type: 'ai',
          content: replyText + '\n\n*(Acción en pausa esperando tu confirmación)*',
        },
      ]);
      this.scrollToBottom();
      return;
    }

    this.executeCommandsDirectly(commands, replyText, res.agent, res.traces);
  }

  applyPendingCommands() {
    const pending = this.pendingConfirmation();
    if (!pending) return;
    const wasVision = pending.isVision;
    this.pendingConfirmation.set(null);
    this.executeCommandsDirectly(
      pending.commands,
      wasVision ? 'Boceto aprobado y generado en el diagrama.' : 'Cambios confirmados y aplicados al diagrama.'
    );
  }

  cancelPendingCommands() {
    const pending = this.pendingConfirmation();
    const wasVision = pending?.isVision;
    this.pendingConfirmation.set(null);
    this.messages.update((prev) => [
      ...prev,
      {
        sender_type: 'system',
        content: wasVision
          ? 'Detección de boceto descartada por el usuario.'
          : 'Acción destructiva cancelada por el usuario.',
      },
    ]);
    this.scrollToBottom();
  }

  private executeCommandsDirectly(commands: any[], replyText: string, agent?: string, traces?: any[]) {
    for (const cmd of commands) {
      const fullCmd = {
        command_id: cmd.command_id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        command_type: cmd.command_type,
        payload: cmd.payload,
        actor: 'ai:vertex-gemini',
        timestamp: new Date().toISOString(),
        model_version: this.diagram.version() + 1,
      };

      this.diagram.applyCommand(fullCmd);
      this.ws.markApplied(fullCmd.command_id);
      this.ws.send({ type: 'command:send', data: fullCmd });
    }

    this.messages.update((prev) => [
      ...prev,
      {
        sender_type: 'ai',
        content: replyText,
        commands: commands,
        agent: agent,
        traces: traces,
      },
    ]);
    this.scrollToBottom();
  }


  formatMessage(text: string): string {
    if (!text) return '';
    // Formato básico para negritas y saltos de línea
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }
}
