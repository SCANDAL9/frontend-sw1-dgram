import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService {
  readonly isSupported = signal<boolean>(
    typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition)
  );

  readonly isRecording = signal<boolean>(false);
  private recognition: any = null;

  start(onResult: (transcript: string) => void, onEnd?: () => void): boolean {
    if (!this.isSupported()) return false;

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return false;

    try {
      this.stop();
      this.recognition = new SpeechRecognitionClass();
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
          onResult(transcript);
        }
      };

      this.recognition.onerror = () => {
        this.stop();
      };

      this.recognition.onend = () => {
        this.isRecording.set(false);
        this.recognition = null;
        if (onEnd) onEnd();
      };

      this.recognition.start();
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.isRecording.set(false);
  }
}
