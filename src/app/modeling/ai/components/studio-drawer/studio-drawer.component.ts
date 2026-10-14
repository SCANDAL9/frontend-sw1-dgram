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
import { StudioAudioPlayerService } from '../../services/studio-audio-player.service';
import { StudioCommandExecutorService } from '../../services/studio-command-executor.service';
import { StudioChatSessionService } from '../../services/studio-chat-session.service';
import { ChatMessageFormatPipe } from '../../pipes/chat-message-format.pipe';
import { AuthMediaUrlPipe } from '../../pipes/auth-media-url.pipe';
import { ChatMsg } from '../../models/ai-chat.models';
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
  private audioPlayer = inject(StudioAudioPlayerService);
  private commandExecutor = inject(StudioCommandExecutorService);
  private chatSession = inject(StudioChatSessionService);
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

  // State delegates from services
  readonly conversations = this.chatSession.conversations;
  readonly activeConversationId = this.chatSession.activeConversationId;
  readonly messages = this.chatSession.messages;
  readonly aiLoading = this.chatSession.aiLoading;
  readonly aiStatus = this.chatSession.aiStatus;

  readonly selectedAudio = this.audioPlayer.selectedAudio;
  readonly isPlayingAudio = this.audioPlayer.isPlayingAudio;
  readonly audioCurrentTime = this.audioPlayer.audioCurrentTime;
  readonly audioDuration = this.audioPlayer.audioDuration;

  readonly pendingConfirmation = this.commandExecutor.pendingConfirmation;

  // Local UI state
  inputText = '';
  selectedImage = signal<File | null>(null);
  selectedImageUrl = signal<string | null>(null);
  isAttachmentMenuOpen = signal<boolean>(false);

  readonly isRecordingAudio = this.audioRecorder.isRecording;
  readonly recordingSeconds = this.audioRecorder.recordingSeconds;
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
    this.audioPlayer.stopAudioPlayback();
    if (this.selectedImageUrl()) {
      URL.revokeObjectURL(this.selectedImageUrl()!);
    }
  }

  close(): void {
    this.audioRecorder.cancelRecording();
    this.audioPlayer.stopAudioPlayback();
    this.closed.emit();
  }

  // Audio Recording & Playback delegates
  async toggleAudioRecording(): Promise<void> {
    if (this.isRecordingAudio()) {
      const file = await this.audioRecorder.stopRecording();
      if (file) {
        this.audioPlayer.setupAudioPreview(file);
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
      this.audioPlayer.setupAudioPreview(file);
      fileInput.value = '';
    }
  }

  toggleAudioPlayback(): void {
    this.audioPlayer.toggleAudioPlayback();
  }

  stopAudioPlayback(): void {
    this.audioPlayer.stopAudioPlayback();
  }

  formatAudioTime(seconds: number): string {
    return this.audioPlayer.formatAudioTime(seconds);
  }

  removeSelectedAudio(): void {
    this.audioPlayer.removeSelectedAudio();
  }

  // Chat conversation delegates
  loadConversations(selectLatest: boolean = false): void {
    this.chatSession.loadConversations(this.boardId(), selectLatest, () => this.scrollToBottom());
  }

  startNewChat(): void {
    this.chatSession.startNewChat(this.boardId(), () => this.scrollToBottom());
  }

  switchConversation(conversationId: string): void {
    this.chatSession.switchConversation(this.boardId(), conversationId, () => this.scrollToBottom());
  }

  deleteActiveConversation(): void {
    this.chatSession.deleteActiveConversation(this.boardId(), () => this.scrollToBottom());
  }

  loadChatHistory(conversationId?: string): void {
    this.chatSession.loadChatHistory(this.boardId(), conversationId, () => this.scrollToBottom());
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

    if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith('image/')) {
          imageFile = file;
          break;
        }
      }
    }

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

  // Pending commands confirmation delegates
  applyPendingCommands(): void {
    const result = this.commandExecutor.applyPendingCommands();
    if (result) {
      this.chatSession.addMessage({
        sender_type: 'ai',
        content: result.replyText,
        commands: result.commands,
      });
      this.scrollToBottom();
    }
  }

  cancelPendingCommands(): void {
    const result = this.commandExecutor.cancelPendingCommands();
    if (result) {
      this.chatSession.addMessage({
        sender_type: 'system',
        content: result.wasVision
          ? 'Detección de boceto descartada por el usuario.'
          : 'Acción destructiva cancelada por el usuario.',
      });
      this.scrollToBottom();
    }
  }

  async sendChatMessage(): Promise<void> {
    if (this.isRecordingAudio()) {
      const recorded = await this.audioRecorder.stopRecording();
      if (recorded) {
        this.audioPlayer.setupAudioPreview(recorded);
      }
    }

    const text = this.inputText.trim();
    const image = this.selectedImage();
    const audio = this.selectedAudio();
    if (!text && !image && !audio) return;

    this.chatSession.setAiLoading(true);
    const userId = this.auth.currentUser()?.id || this.ws.userId();
    const convId = this.activeConversationId() || undefined;

    if (audio && image) {
      this.chatSession.setAiStatus('Analizando boceto y nota de voz multimodal...');
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
      this.chatSession.addMessage(userMsg);
      this.inputText = '';
      this.audioPlayer.removeSelectedAudio();
      this.removeSelectedImage();
      this.scrollToBottom();

      this.aiChat.sendVision(this.boardId(), image, text || undefined, userId, convId, audio).subscribe({
        next: (res) => {
          this.chatSession.setAiLoading(false);
          this.processAiResponse(res, true);
          this.loadConversations(false);
        },
        error: () => {
          this.chatSession.setAiLoading(false);
          this.chatSession.addMessage({
            sender_type: 'ai',
            content: 'Ocurrió un error al procesar el boceto y la nota de voz.',
          });
          this.scrollToBottom();
        },
      });
    } else if (audio) {
      this.chatSession.setAiStatus('Transcribiendo audio y ejecutando comandos...');
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
      this.chatSession.addMessage(userMsg);
      this.inputText = '';
      this.audioPlayer.removeSelectedAudio();
      this.scrollToBottom();

      this.aiChat.sendAudio(this.boardId(), audio, text || undefined, userId, convId).subscribe({
        next: (res: any) => {
          this.chatSession.setAiLoading(false);
          if (res.conversation_id && res.conversation_id !== this.activeConversationId()) {
            this.chatSession.setActiveConversationId(res.conversation_id);
          }
          this.processAiResponse(res, false);
          this.loadConversations(false);
        },
        error: () => {
          this.chatSession.setAiLoading(false);
          this.chatSession.addMessage({
            sender_type: 'ai',
            content: 'Ocurrió un error al procesar la nota de voz.',
          });
          this.scrollToBottom();
        },
      });
    } else if (image) {
      this.chatSession.setAiStatus('Analizando boceto con visión artificial...');
      this.chatSession.addMessage({
        sender_type: 'user',
        content: text ? `[Boceto adjunto]: ${text}` : '[Boceto de diagrama adjunto]',
      });
      this.inputText = '';
      this.removeSelectedImage();
      this.scrollToBottom();

      this.aiChat.sendVision(this.boardId(), image, text, userId, convId).subscribe({
        next: (res) => {
          this.chatSession.setAiLoading(false);
          this.processAiResponse(res, true);
          this.loadConversations(false);
        },
        error: () => {
          this.chatSession.setAiLoading(false);
          this.chatSession.addMessage({
            sender_type: 'ai',
            content: 'Ocurrió un error al procesar la imagen.',
          });
          this.scrollToBottom();
        },
      });
    } else {
      this.chatSession.setAiStatus('Generando respuesta y comandos UML...');
      this.chatSession.addMessage({ sender_type: 'user', content: text });
      this.inputText = '';
      this.scrollToBottom();

      this.aiChat.sendMessage(this.boardId(), text, userId, convId).subscribe({
        next: (res) => {
          this.chatSession.setAiLoading(false);
          if (res.conversation_id && res.conversation_id !== this.activeConversationId()) {
            this.chatSession.setActiveConversationId(res.conversation_id);
          }
          this.processAiResponse(res, false);
          this.loadConversations(false);
        },
        error: () => {
          this.chatSession.setAiLoading(false);
          this.chatSession.addMessage({
            sender_type: 'ai',
            content: 'Error de comunicación con el asistente IA.',
          });
          this.scrollToBottom();
        },
      });
    }
  }

  private processAiResponse(res: any, isVision: boolean): void {
    const result = this.commandExecutor.handleAiResponse(res, isVision);
    if (result.isPending) {
      this.chatSession.addMessage({
        sender_type: 'ai',
        content: result.replyText,
      });
    } else {
      this.chatSession.addMessage({
        sender_type: 'ai',
        content: result.replyText,
        commands: result.commands,
      });
    }
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
