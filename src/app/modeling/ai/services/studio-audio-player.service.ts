import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StudioAudioPlayerService {
  private audioElement: HTMLAudioElement | null = null;
  readonly isPlayingAudio = signal<boolean>(false);
  readonly audioCurrentTime = signal<number>(0);
  readonly audioDuration = signal<number>(0);
  readonly selectedAudio = signal<File | null>(null);

  setupAudioPreview(file: File): void {
    this.stopAudioPlayback();
    this.selectedAudio.set(file);
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

  cleanup(): void {
    this.stopAudioPlayback();
    this.selectedAudio.set(null);
  }
}
