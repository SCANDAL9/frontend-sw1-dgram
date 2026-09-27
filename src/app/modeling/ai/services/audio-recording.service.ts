import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioRecordingService {
  readonly isRecording = signal<boolean>(false);
  readonly recordingSeconds = signal<number>(0);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private timerInterval: any = null;

  async startRecording(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      this.cancelRecording();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250); // Emit data every 250ms
      this.isRecording.set(true);
      this.recordingSeconds.set(0);

      this.timerInterval = setInterval(() => {
        this.recordingSeconds.update((s) => s + 1);
      }, 1000);

      return true;
    } catch (err) {
      console.error('Error starting audio recording:', err);
      this.cleanup();
      return false;
    }
  }

  stopRecording(): Promise<File | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
          const blob = new Blob(this.audioChunks, { type: mimeType });
          const filename = `nota_de_voz_${Date.now()}.${ext}`;
          const file = new File([blob], filename, { type: mimeType });
          this.cleanup();
          resolve(file);
        } catch (err) {
          console.error('Error creating recorded audio file:', err);
          this.cleanup();
          resolve(null);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch {
        this.cleanup();
        resolve(null);
      }
    });
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording.set(false);
    this.recordingSeconds.set(0);
  }

  private getSupportedMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
  }
}
