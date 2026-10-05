import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
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
import { AudioRecordingService } from '../../services/audio-recording.service';
import { ChatMessageFormatPipe } from '../../pipes/chat-message-format.pipe';
import { AuthMediaUrlPipe } from '../../pipes/auth-media-url.pipe';
import { ChatMsg, PendingConfirmation, ChatConversationSession } from '../../models/ai-chat.models';
import { environment } from '../../../../../environments/environment';

export type DrawerTab = 'chat' | 'export' | 'team';

@Component({
  selector: 'app-studio-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatMessageFormatPipe, AuthMediaUrlPipe],
  templateUrl: './studio-drawer.component.html',
})
export class StudioDrawerComponent implements OnInit, OnDestroy {
  private aiChat = inject(AiChatService);
  private audioRecorder = inject(AudioRecordingService);
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

  conversations = signal<ChatConversationSession[]>([]);
  activeConversationId = signal<string | null>(null);
  messages = signal<ChatMsg[]>([]);
  inputText = '';
  aiLoading = signal(false);
  aiStatus = signal('Generando respuesta...');
  selectedImage = signal<File | null>(null);
  selectedImageUrl = signal<string | null>(null);
  selectedAudio = signal<File | null>(null);
  isAttachmentMenuOpen = signal<boolean>(false);

  // Audio preview playback
  private audioElement: HTMLAudioElement | null = null;
  isPlayingAudio = signal<boolean>(false);
  audioCurrentTime = signal<number>(0);
  audioDuration = signal<number>(0);
  pendingConfirmation = signal<PendingConfirmation | null>(null);

  isRecordingAudio = this.audioRecorder.isRecording;
  recordingSeconds = this.audioRecorder.recordingSeconds;
  readonly recordingDurationText = computed(() => {
    const s = this.recordingSeconds();
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  });

  constructor() {
    effect(() => {
      if (this.isOpen() && this.boardId()) {
        this.loadConversations(false);
      }
    });
  }

  ngOnInit(): void {
    if (this.isOpen()) {
      this.loadConversations(false);
    }
  }

  ngOnDestroy(): void {
    this.audioRecorder.cancelRecording();
    this.stopAudioPlayback();
    if (this.selectedImageUrl()) {
      URL.revokeObjectURL(this.selectedImageUrl()!);
    }
  }

  close(): void {
    this.audioRecorder.cancelRecording();
    this.stopAudioPlayback();
    this.closed.emit();
  }

  async toggleAudioRecording(): Promise<void> {
    if (this.isRecordingAudio()) {
      const file = await this.audioRecorder.stopRecording();
      if (file) {
        this.selectedAudio.set(file);
        this.setupAudioPreview(file);
      }
    } else {
      const ok = await this.audioRecorder.startRecording();
      if (!ok) {
        this.toast.error('No se pudo acceder al micrófono para grabar.');
      }
    }
  }

  cancelAudioRecording(): void {
    this.audioRecorder.cancelRecording();
  }

  onAudioFileSelected(e: Event): void {
    const fileInput = e.target as HTMLInputElement;
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      this.selectedAudio.set(file);
      this.setupAudioPreview(file);
      fileInput.value = '';
    }
  }

  setupAudioPreview(file: File): void {
    this.stopAudioPlayback();
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      this.audioElement = audio;
      audio.onloadedmetadata = () => {
        this.audioDuration.set(audio.duration || 0);
      };
      audio.ontimeupdate = () => {
        this.audioCurrentTime.set(audio.currentTime || 0);
      };
      audio.onended = () => {
        this.isPlayingAudio.set(false);
        this.audioCurrentTime.set(0);
      };
    } catch {
      // Audio playback preview fallback
    }
  }

  toggleAudioPlayback(): void {
    if (!this.audioElement) return;
    if (this.isPlayingAudio()) {
      this.audioElement.pause();
      this.isPlayingAudio.set(false);
    } else {
      this.audioElement.play().catch(() => {});
      this.isPlayingAudio.set(true);
    }
  }

  stopAudioPlayback(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    this.isPlayingAudio.set(false);
    this.audioCurrentTime.set(0);
    this.audioDuration.set(0);
  }

  formatAudioTime(seconds: number): string {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  removeSelectedAudio(): void {
    this.stopAudioPlayback();
    this.selectedAudio.set(null);
  }

  loadConversations(selectLatest: boolean = false): void {
    this.aiChat.getConversations(this.boardId()).subscribe({
      next: (convs) => {
        this.conversations.set(convs || []);
        if (convs && convs.length > 0) {
          const currentId = this.activeConversationId();
          const exists = currentId && convs.some((c) => c.id === currentId);
          if (!exists || selectLatest) {
            this.activeConversationId.set(convs[0].id);
            this.loadChatHistory(convs[0].id);
          }
        } else {
          this.startNewChat();
        }
      },
      error: () => {},
    });
  }

  startNewChat(): void {
    this.aiChat.createConversation(this.boardId(), 'Nuevo Chat').subscribe({
      next: (conv) => {
        this.conversations.update((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
        this.activeConversationId.set(conv.id);
        this.messages.set([]);
      },
      error: () => {
        this.toast.error('No se pudo iniciar un nuevo chat.');
      },
    });
  }

  switchConversation(conversationId: string): void {
    if (this.activeConversationId() === conversationId) return;
    this.activeConversationId.set(conversationId);
    this.loadChatHistory(conversationId);
  }

  deleteActiveConversation(): void {
    const currentId = this.activeConversationId();
    if (!currentId) return;

    this.aiChat.deleteConversation(this.boardId(), currentId).subscribe({
      next: () => {
        const remaining = this.conversations().filter((c) => c.id !== currentId);
        this.conversations.set(remaining);
        if (remaining.length > 0) {
          this.activeConversationId.set(remaining[0].id);
          this.loadChatHistory(remaining[0].id);
        } else {
          this.startNewChat();
        }
        this.toast.info('Conversación eliminada.');
      },
      error: () => {
        this.toast.error('No se pudo eliminar la conversación.');
      },
    });
  }

  loadChatHistory(conversationId?: string): void {
    const targetId = conversationId || this.activeConversationId() || undefined;
    this.aiChat.getHistory(this.boardId(), targetId).subscribe({
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

  @HostListener('paste', ['$event'])
  handlePaste(event: ClipboardEvent): void {
    if (!this.isOpen() || this.activeTab() !== 'chat') {
      return;
    }
    this.processClipboardPaste(event);
  }

  processClipboardPaste(event: ClipboardEvent): void {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    let imageFile: File | null = null;

    // 1. Inspect clipboard items
    const items = clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFile = file;
            break;
          }
        }
      }
    }

    // 2. Fallback to clipboard files list
    if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith('image/')) {
          imageFile = file;
          break;
        }
      }
    }

    // 3. Stage the image and stop native text paste of image binaries
    if (imageFile) {
      event.preventDefault();
      event.stopPropagation();
      const ext = imageFile.type.split('/')[1] || 'png';
      const fileName = imageFile.name && imageFile.name !== 'image.png'
        ? imageFile.name
        : `clipboard-${Date.now()}.${ext}`;
      const namedFile = new File([imageFile], fileName, { type: imageFile.type });

      this.setImageFile(namedFile);
      this.toast.info('Imagen pegada desde el portapapeles');
    }
  }

  private setImageFile(file: File): void {
    if (this.selectedImageUrl()) {
      URL.revokeObjectURL(this.selectedImageUrl()!);
    }
    this.selectedImage.set(file);
    this.selectedImageUrl.set(URL.createObjectURL(file));
  }

  onFileSelected(e: Event): void {
    const fileInput = e.target as HTMLInputElement;
    if (fileInput.files && fileInput.files[0]) {
      this.setImageFile(fileInput.files[0]);
      fileInput.value = '';
    }
  }

  removeSelectedImage(): void {
    if (this.selectedImageUrl()) {
      URL.revokeObjectURL(this.selectedImageUrl()!);
      this.selectedImageUrl.set(null);
    }
    this.selectedImage.set(null);
  }

  toggleMsgAudio(player: HTMLAudioElement): void {
    if (player.paused) {
      player.play().catch((err) => console.error('Audio play error:', err));
    } else {
      player.pause();
    }
  }

  openImagePreview(url: string | null | undefined): void {
    if (!url) return;
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      window.open(url, '_blank');
      return;
    }
    let fullUrl = url;
    if (url.startsWith('/api')) {
      const backendBase = environment.apiUrl.replace(/\/api\/?$/, '');
      fullUrl = `${backendBase}${url}`;
    }
    const token = this.auth.token();
    const resolvedUrl = token ? `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : fullUrl;
    window.open(resolvedUrl, '_blank');
  }

  async sendChatMessage(): Promise<void> {
    if (this.isRecordingAudio()) {
      const recorded = await this.audioRecorder.stopRecording();
      if (recorded) {
        this.selectedAudio.set(recorded);
      }
    }

    const text = this.inputText.trim();
    const image = this.selectedImage();
    const audio = this.selectedAudio();
    if (!text && !image && !audio) return;

    this.aiLoading.set(true);
    const userId = this.auth.currentUser()?.id || this.ws.userId();
    const convId = this.activeConversationId() || undefined;

    if (audio && image) {
      this.aiStatus.set('Analizando boceto y nota de voz multimodal...');
      const userContent = text
        ? `[Boceto + Nota de voz]: "${text}"`
        : '🖼️🎙️ Boceto y nota de voz adjuntados para análisis...';
      const audioBlobUrl = URL.createObjectURL(audio);
      const userMsg: ChatMsg = {
        sender_type: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
        attachments: [
          {
            id: `att-img-${Date.now()}`,
            type: 'image',
            storage_url: this.selectedImageUrl() || '',
            file_name: image.name,
          },
          {
            id: `att-aud-${Date.now()}`,
            type: 'audio',
            storage_url: audioBlobUrl,
            file_name: audio.name,
          },
        ],
      };
      this.messages.update((prev) => [...prev, userMsg]);
      this.inputText = '';
      this.stopAudioPlayback();
      this.selectedAudio.set(null);
      this.removeSelectedImage();
      this.scrollToBottom();

      this.aiChat.sendVision(this.boardId(), image, text || undefined, userId, convId, audio).subscribe({
        next: (res) => {
          this.aiLoading.set(false);
          this.handleAiResponse(res, true);
          this.loadConversations(false);
        },
        error: () => {
          this.aiLoading.set(false);
          this.messages.update((prev) => [
            ...prev,
            { sender_type: 'ai', content: 'Ocurrió un error al procesar el boceto y la nota de voz.' },
          ]);
          this.scrollToBottom();
        },
      });
    } else if (audio) {
      this.aiStatus.set('Transcribiendo audio y ejecutando comandos...');
      const userContent = text ? `[Nota de voz]: "${text}"` : '🎙️ Nota de voz adjunta para transcripción...';
      const audioBlobUrl = URL.createObjectURL(audio);
      const userMsg: ChatMsg = {
        sender_type: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
        attachments: [
          {
            id: `att-aud-${Date.now()}`,
            type: 'audio',
            storage_url: audioBlobUrl,
            file_name: audio.name,
          },
        ],
      };
      this.messages.update((prev) => [...prev, userMsg]);
      this.inputText = '';
      this.stopAudioPlayback();
      this.selectedAudio.set(null);
      this.scrollToBottom();

      this.aiChat.sendAudio(this.boardId(), audio, text || undefined, userId, convId).subscribe({
        next: (res: any) => {
          this.aiLoading.set(false);
          if (res.conversation_id && res.conversation_id !== this.activeConversationId()) {
            this.activeConversationId.set(res.conversation_id);
          }
          this.handleAiResponse(res, false);
          this.loadConversations(false);
        },
        error: () => {
          this.aiLoading.set(false);
          this.messages.update((prev) => [
            ...prev,
            { sender_type: 'ai', content: 'Ocurrió un error al procesar la nota de voz.' },
          ]);
          this.scrollToBottom();
        },
      });
    } else if (image) {
      this.aiStatus.set('Analizando boceto con visión artificial...');
      this.messages.update((prev) => [
        ...prev,
        {
          sender_type: 'user',
          content: text ? `[Boceto adjunto]: ${text}` : '[Boceto de diagrama adjunto]',
        },
      ]);
      this.inputText = '';
      this.removeSelectedImage();
      this.scrollToBottom();

      this.aiChat.sendVision(this.boardId(), image, text, userId, convId).subscribe({
        next: (res) => {
          this.aiLoading.set(false);
          this.handleAiResponse(res, true);
          this.loadConversations(false);
        },
        error: () => {
          this.aiLoading.set(false);
          this.messages.update((prev) => [
            ...prev,
            { sender_type: 'ai', content: 'Ocurrió un error al procesar la imagen.' },
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

      this.aiChat.sendMessage(this.boardId(), text, userId, convId).subscribe({
        next: (res) => {
          this.aiLoading.set(false);
          if (res.conversation_id && res.conversation_id !== this.activeConversationId()) {
            this.activeConversationId.set(res.conversation_id);
          }
          this.handleAiResponse(res, false);
          this.loadConversations(false);
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
      const payload = { ...(cmd.payload || {}) };
      if (
        (cmd.command_type === 'CREATE_ENTITY' || cmd.command_type === 'CREATE_CLASS') &&
        !payload.entity_id &&
        !payload.class_id
      ) {
        const generatedId = `ent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        payload.entity_id = generatedId;
        payload.class_id = generatedId;
      }

      const fullCmd = {
        command_id: cmd.command_id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        command_type: cmd.command_type,
        payload,
        actor: 'ai:copilot',
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
