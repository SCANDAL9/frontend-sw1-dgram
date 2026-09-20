import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramService } from '../../../diagram/services/diagram.service';
import { WebsocketService } from '../../../diagram/services/websocket.service';
import { AuthService } from '../../../../workspace/authentication/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AiChatService } from '../../services/ai-chat.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { ChatMessageFormatPipe } from '../../pipes/chat-message-format.pipe';
import { ChatMsg, PendingConfirmation } from '../../models/ai-chat.models';

export type DrawerTab = 'chat' | 'export' | 'team';

@Component({
  selector: 'app-studio-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatMessageFormatPipe],
  templateUrl: './studio-drawer.component.html',
})
export class StudioDrawerComponent implements OnInit, OnDestroy {
  private aiChat = inject(AiChatService);
  private speech = inject(SpeechRecognitionService);
  public diagram = inject(DiagramService);
  private ws = inject(WebsocketService);
  public auth = inject(AuthService);
  private toast = inject(ToastService);

  boardId = input.required<string>();
  flowHost = input<HTMLElement | null>(null);
  isOpen = input<boolean>(false);
  activeTab = input<DrawerTab>('chat');
  closed = output<void>();

  @ViewChild('chatScrollContainer') private chatScrollContainer!: ElementRef;

  messages = signal<ChatMsg[]>([]);
  inputText = '';
  aiLoading = signal(false);
  aiStatus = signal('Generando con Vertex AI...');
  selectedImage = signal<File | null>(null);
  pendingConfirmation = signal<PendingConfirmation | null>(null);

  isSpeechSupported = this.speech.isSupported;
  isRecording = this.speech.isRecording;

  constructor() {
    effect(() => {
      if (this.isOpen() && this.boardId()) {
        this.loadChatHistory();
      }
    });
  }

  ngOnInit(): void {
    if (this.isOpen()) {
      this.loadChatHistory();
    }
  }

  ngOnDestroy(): void {
    this.speech.stop();
  }

  close(): void {
    this.speech.stop();
    this.closed.emit();
  }

  toggleVoiceRecognition(): void {
    if (this.isRecording()) {
      this.speech.stop();
    } else {
      const started = this.speech.start((transcript) => {
        this.inputText = transcript;
      });
      if (!started) {
        this.toast.error('Tu navegador no soporta reconocimiento de voz (Web Speech API).');
      }
    }
  }

  loadChatHistory(): void {
    this.aiChat.getHistory(this.boardId()).subscribe({
      next: (msgs) => {
        this.messages.set(msgs || []);
        this.scrollToBottom();
      },
      error: () => {},
    });
  }

  sendQuickPrompt(prompt: string): void {
    this.inputText = prompt;
    this.sendChatMessage();
  }

  onEnterPress(e: Event): void {
    const ke = e as KeyboardEvent;
    if (!ke.shiftKey) {
      e.preventDefault();
      this.sendChatMessage();
    }
  }

  onFileSelected(e: Event): void {
    const fileInput = e.target as HTMLInputElement;
    if (fileInput.files && fileInput.files[0]) {
      this.selectedImage.set(fileInput.files[0]);
    }
  }

  removeSelectedImage(): void {
    this.selectedImage.set(null);
  }

  sendChatMessage(): void {
    const text = this.inputText.trim();
    const image = this.selectedImage();
    if (!text && !image) return;

    this.aiLoading.set(true);
    const userId = this.auth.currentUser()?.id || this.ws.userId();

    if (image) {
      this.aiStatus.set('Analizando boceto con Vertex AI Vision...');
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

      this.aiChat.sendVision(this.boardId(), image, text, userId).subscribe({
        next: (res) => {
          this.aiLoading.set(false);
          this.handleAiResponse(res, true);
        },
        error: () => {
          this.aiLoading.set(false);
          this.messages.update((prev) => [
            ...prev,
            { sender_type: 'ai', content: 'Ocurrió un error al procesar la imagen con Vertex AI.' },
          ]);
          this.scrollToBottom();
        },
      });
    } else {
      this.aiStatus.set('Generando respuesta y comandos UML...');
      this.messages.update((prev) => [
        ...prev,
        { sender_type: 'user', content: text },
      ]);
      this.inputText = '';
      this.scrollToBottom();

      this.aiChat.sendMessage(this.boardId(), text, userId).subscribe({
        next: (res) => {
          this.aiLoading.set(false);
          this.handleAiResponse(res, false);
        },
        error: () => {
          this.aiLoading.set(false);
          this.messages.update((prev) => [
            ...prev,
            { sender_type: 'ai', content: 'Error de comunicación con el asistente IA.' },
          ]);
          this.scrollToBottom();
        },
      });
    }
  }

  private handleAiResponse(res: any, isVision: boolean = false): void {
    const replyText = res.reply || 'Comandos aplicados al diagrama.';
    const commands: any[] = res.commands || [];

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
        commands,
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

    const isDestructive = commands.some(
      (cmd) =>
        cmd.command_type === 'DELETE_ENTITY' ||
        cmd.command_type === 'DELETE_CLASS' ||
        cmd.command_type === 'DELETE_COLUMN' ||
        cmd.command_type === 'DELETE_ATTRIBUTE' ||
        cmd.command_type === 'DELETE_RELATION' ||
        cmd.command_type === 'DELETE_ASSOCIATION'
    );

    if (isDestructive) {
      const desc =
        commands.length === 1
          ? `Se solicita una acción destructiva (${commands[0].command_type}). ¿Deseas aplicarla?`
          : `Se solicitan ${commands.length} acciones que incluyen eliminaciones en el diagrama. ¿Deseas aplicarlas?`;

      this.pendingConfirmation.set({
        title: 'Confirmación requerida',
        description: desc,
        commands,
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

    this.executeCommandsDirectly(commands, replyText);
  }

  applyPendingCommands(): void {
    const pending = this.pendingConfirmation();
    if (!pending) return;
    const wasVision = pending.isVision;
    this.pendingConfirmation.set(null);
    this.executeCommandsDirectly(
      pending.commands,
      wasVision ? 'Boceto aprobado y generado en el diagrama.' : 'Cambios confirmados y aplicados al diagrama.'
    );
  }

  cancelPendingCommands(): void {
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

  private executeCommandsDirectly(commands: any[], replyText: string): void {
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
        commands,
      },
    ]);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }
}
