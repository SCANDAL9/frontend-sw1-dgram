import { Component, Input, Output, EventEmitter, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { DiagramService } from '../../../diagram/services/diagram.service';
import { WebsocketService } from '../../../diagram/services/websocket.service';
import { AuthService } from '../../../../workspace/authentication/services/auth.service';
import { BoardService } from '../../../diagram/services/board.service';
import { ExportService } from '../../../../generation/schema/services/export.service';
import { ToastService } from '../../../../core/services/toast.service';

export interface ChatMsg {
  id?: string;
  sender_type: 'user' | 'ai' | 'system';
  user_id?: string | null;
  content: string;
  created_at?: string;
  commands?: any[];
}

export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'editor' | 'viewer';
  joined_at?: string;
}

export type DrawerTab = 'chat' | 'export' | 'team';

@Component({
  selector: 'app-studio-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './studio-drawer.component.html',
})
export class StudioDrawerComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  public diagram = inject(DiagramService);
  private ws = inject(WebsocketService);
  public auth = inject(AuthService);
  public boardService = inject(BoardService);
  private exportSvc = inject(ExportService);
  private toast = inject(ToastService);

  @Input({ required: true }) boardId!: string;
  @Input() flowHost: HTMLElement | null = null;
  @Input() isOpen = signal(false);
  @Input() activeTab = signal<DrawerTab>('chat');
  @Output() closed = new EventEmitter<void>();
  @ViewChild('chatScrollContainer') private chatScrollContainer!: ElementRef;

  // AI Chat States
  messages = signal<ChatMsg[]>([]);
  inputText = '';
  aiLoading = signal(false);
  aiStatus = signal('Generando con Vertex AI...');
  selectedImage = signal<File | null>(null);
  pendingConfirmation = signal<{
    title?: string;
    description: string;
    commands: any[];
    isVision?: boolean;
    detectedEntities?: string[];
  } | null>(null);

  // Web Speech API (Dictado por voz)
  isSpeechSupported = signal(
    typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition)
  );
  isRecording = signal(false);
  private recognition: any = null;

  // Export States
  copiedSql = signal(false);
  copiedJson = signal(false);
  exportingPng = signal(false);

  // Codegen States
  basePackage = 'com.dgram.generated';
  codegenLoading = signal(false);
  codegenFiles = signal<Record<string, string>>({});
  codegenFileList = signal<string[]>([]);
  selectedFile = signal<string | null>(null);
  copiedCode = signal(false);

  // Team States
  members = signal<ProjectMember[]>([]);
  loadingMembers = signal(false);
  invitingMember = signal(false);
  inviteEmail = '';
  inviteRole: 'editor' | 'viewer' = 'editor';

  ngOnInit() {
    this.loadChatHistory();
    this.loadMembers();
  }

  ngOnDestroy() {
    this.stopVoiceRecognition();
  }

  setTab(tab: DrawerTab) {
    this.activeTab.set(tab);
    if (tab === 'team') this.loadMembers();
  }

  close() {
    this.stopVoiceRecognition();
    this.closed.emit();
  }

  // --- Web Speech API Logic ---
  toggleVoiceRecognition() {
    if (this.isRecording()) {
      this.stopVoiceRecognition();
      return;
    }
    this.startVoiceRecognition();
  }

  private startVoiceRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.toast.error('Tu navegador no soporta reconocimiento de voz (Web Speech API).');
      return;
    }

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
        console.warn('Error en reconocimiento de voz:', err);
        this.isRecording.set(false);
      };

      this.recognition.onend = () => {
        this.isRecording.set(false);
      };

      this.recognition.start();
    } catch (e) {
      console.error('Error al iniciar Web Speech:', e);
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

  // --- AI Chat Logic ---
  loadChatHistory() {
    this.http.get<ChatMsg[]>(`${environment.apiUrl}/chat/boards/${this.boardId}/messages`).subscribe({
      next: (msgs) => {
        this.messages.set(msgs || []);
        this.scrollToBottom();
      },
      error: () => {},
    });
  }

  sendQuickPrompt(prompt: string) {
    this.inputText = prompt;
    this.sendChatMessage();
  }

  onEnterPress(e: Event) {
    const ke = e as KeyboardEvent;
    if (!ke.shiftKey) {
      e.preventDefault();
      this.sendChatMessage();
    }
  }

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedImage.set(input.files[0]);
    }
  }

  removeSelectedImage() {
    this.selectedImage.set(null);
  }

  sendChatMessage() {
    const text = this.inputText.trim();
    const image = this.selectedImage();
    if (!text && !image) return;

    this.aiLoading.set(true);

    if (image) {
      this.aiStatus.set('Analizando boceto con Vertex AI Vision...');
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

      const payload = {
        text,
        user_id: this.auth.currentUser()?.id || this.ws.userId(),
      };

      this.http.post<any>(`${environment.apiUrl}/chat/boards/${this.boardId}/message`, payload).subscribe({
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

    this.executeCommandsDirectly(commands, replyText);
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

  private executeCommandsDirectly(commands: any[], replyText: string) {
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
      },
    ]);
    this.scrollToBottom();
  }

  formatMessage(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  // --- Export Logic ---
  copySql() {
    const sql = this.exportSvc.toSql();
    navigator.clipboard.writeText(sql).then(() => {
      this.copiedSql.set(true);
      this.toast.success('SQL DDL copiado al portapapeles');
      setTimeout(() => this.copiedSql.set(false), 2000);
    });
  }

  downloadSql() {
    this.exportSvc.downloadSql();
    this.toast.success('Descargando schema.sql');
  }

  copyJson() {
    const json = this.exportSvc.toJson();
    navigator.clipboard.writeText(json).then(() => {
      this.copiedJson.set(true);
      this.toast.success('JSON Schema copiado');
      setTimeout(() => this.copiedJson.set(false), 2000);
    });
  }

  downloadJson() {
    this.exportSvc.downloadJson();
    this.toast.success('Descargando diagram.json');
  }

  async downloadPng() {
    if (!this.flowHost) return;
    this.exportingPng.set(true);
    try {
      await this.exportSvc.toPng(this.flowHost, 'schema.png');
      this.toast.success('Captura PNG guardada');
    } catch {
      this.toast.error('Error al generar PNG');
    } finally {
      this.exportingPng.set(false);
    }
  }

  // --- Codegen Logic ---
  generateSpringCode() {
    this.codegenLoading.set(true);
    this.boardService.generateCode(this.boardId, this.basePackage).subscribe({
      next: (res) => {
        this.codegenLoading.set(false);
        this.codegenFiles.set(res.files || {});
        const keys = Object.keys(res.files || {});
        this.codegenFileList.set(keys);
        if (keys.length > 0) {
          this.selectedFile.set(keys[0]);
        }
        this.toast.success('Proyecto Spring Boot generado');
      },
      error: (err) => {
        this.codegenLoading.set(false);
        this.toast.error(err.error?.detail || 'Error al generar código');
      },
    });
  }

  currentCode(): string {
    const sel = this.selectedFile();
    return sel ? this.codegenFiles()[sel] || '' : '';
  }

  copyCode() {
    const code = this.currentCode();
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.copiedCode.set(true);
      this.toast.success('Código copiado');
      setTimeout(() => this.copiedCode.set(false), 2000);
    });
  }

  getFileBaseName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  // --- Members / Team Logic ---
  loadMembers() {
    this.loadingMembers.set(true);
    this.http.get<ProjectMember[]>(`${environment.apiUrl}/boards/${this.boardId}/members`).subscribe({
      next: (list) => {
        this.members.set(list || []);
        this.loadingMembers.set(false);
      },
      error: () => {
        this.loadingMembers.set(false);
      },
    });
  }

  handleInviteMember() {
    if (!this.inviteEmail.trim()) return;
    this.invitingMember.set(true);

    const payload = {
      email: this.inviteEmail.trim(),
      role: this.inviteRole,
    };

    const url = `${environment.apiUrl}/boards/${this.boardId}/members/invite`;

    this.http.post<ProjectMember>(url, payload).subscribe({
      next: () => {
        this.invitingMember.set(false);
        this.inviteEmail = '';
        this.toast.success('Invitación enviada');
        this.loadMembers();
      },
      error: (err) => {
        this.invitingMember.set(false);
        this.toast.error(err.error?.detail || 'Error al invitar al usuario');
      },
    });
  }

  removeMember(userId: string) {
    this.http.delete(`${environment.apiUrl}/boards/${this.boardId}/members/${userId}`).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.user_id !== userId));
        this.toast.success('Colaborador eliminado');
      },
      error: () => {
        this.loadMembers();
      },
    });
  }
}
