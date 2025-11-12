import { Component, ChangeDetectionStrategy, input, output, inject, signal, ElementRef, viewChild, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Conversation, Message } from '../../models/chat.model';
import { ChatService } from '../../services/chat.service';
import { GeminiService } from '../../services/gemini.service';

declare var webkitSpeechRecognition: any;
declare var SpeechRecognition: any;

@Component({
  selector: 'app-chat-window',
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.css'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWindowComponent {
  conversation = input.required<Conversation>();
  backClicked = output<void>();

  private chatService = inject(ChatService);
  private geminiService = inject(GeminiService);

  private messageContainerEl = viewChild<ElementRef<HTMLDivElement>>('messageContainer');
  private imageInput = viewChild<ElementRef<HTMLInputElement>>('imageInput');

  newMessage = signal('');
  isSuggesting = signal(false);
  suggestions = signal<string[]>([]);
  
  isRewriting = signal(false);
  showToneChanger = signal(false);
  tones = ['Professional', 'Casual', 'Friendly', 'Excited'];
  
  showScrollButton = signal(false);
  isSummarizing = signal(false);
  useGoogleSearch = signal(false);

  activeMessageMenu = signal<number | null>(null);
  editingMessage = signal<Message | null>(null);
  replyingTo = signal<Message | null>(null);

  isRecording = signal(false);
  private recognition: any;

  constructor() {
    afterNextRender(() => {
        this.scrollToBottom(true);
        const container = this.messageContainerEl()?.nativeElement;
        if (container) {
          container.addEventListener('scroll', this.onScroll.bind(this));
        }
        this.setupSpeechRecognition();
    });
  }

  private setupSpeechRecognition() {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognitionSvc = 'SpeechRecognition' in window ? SpeechRecognition : webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionSvc();
      this.recognition.continuous = false;
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: any) => {
        const speechResult = event.results[0][0].transcript;
        this.newMessage.set(this.newMessage() + speechResult);
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access was denied. Please allow it in your browser settings.');
        }
        this.isRecording.set(false);
      };

      this.recognition.onend = () => {
        this.isRecording.set(false);
      };
    }
  }

  toggleRecording() {
    if (!this.recognition) {
        alert('Speech recognition is not supported in this browser.');
        return;
    }
    if (this.isRecording()) {
      this.recognition.stop();
    } else {
      this.recognition.start();
      this.isRecording.set(true);
    }
  }

  sendMessage() {
    const text = this.newMessage().trim();
    if (!text) return;
    
    if (this.editingMessage()) {
      this.chatService.editMessage(this.conversation().id, this.editingMessage()!.id, text);
      this.cancelEdit();
      return;
    }
    
    const options = {
      useGoogleSearch: this.useGoogleSearch(),
      replyTo: this.replyingTo(),
    };

    if (text.toLowerCase().startsWith('/imagine ')) {
      const prompt = text.substring(9).trim();
      if (prompt) {
        this.chatService.generateImageForPrompt(this.conversation().id, prompt);
      }
    } else {
      this.chatService.addMessage(this.conversation().id, text, options);
    }
    
    this.newMessage.set('');
    this.suggestions.set([]);
    this.showToneChanger.set(false);
    this.useGoogleSearch.set(false);
    this.replyingTo.set(null);
    this.scrollToBottomAfterSend();
  }

  triggerImageUpload() {
    this.imageInput()?.nativeElement.click();
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        alert('Please select an image smaller than 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result as string;
        if (result) {
          this.chatService.addImageMessage(this.conversation().id, result);
          this.scrollToBottomAfterSend();
        }
      };
      reader.readAsDataURL(file);
      input.value = '';
    }
  }

  async suggestReply() {
    const lastMessage = this.getLastReceivedMessage();
    if (!lastMessage) return;

    this.showToneChanger.set(false);
    this.isSuggesting.set(true);
    this.suggestions.set([]);
    try {
      const suggestions = await this.geminiService.generateReplySuggestions(lastMessage.text);
      this.suggestions.set(suggestions);
    } catch (e) {
      console.error('Failed to get suggestion', e);
      this.suggestions.set(['Could not generate replies.']);
    } finally {
      this.isSuggesting.set(false);
    }
  }

  selectSuggestion(suggestion: string) {
    this.newMessage.set(suggestion);
    this.suggestions.set([]);
  }

  onInput() {
    if (this.suggestions().length > 0) this.suggestions.set([]);
    if (this.showToneChanger()) this.showToneChanger.set(false);
  }

  toggleToneChanger() {
    if (this.suggestions().length > 0) this.suggestions.set([]);
    this.showToneChanger.update(v => !v);
  }
  
  async summarize() {
    this.isSummarizing.set(true);
    try {
      await this.chatService.summarizeConversation(this.conversation().id);
      this.scrollToBottomAfterSend();
    } catch (error) {
      console.error('Summarization failed in component', error);
    } finally {
      this.isSummarizing.set(false);
    }
  }

  async selectTone(tone: string) {
    const originalMessage = this.newMessage().trim();
    if (!originalMessage) return;

    this.showToneChanger.set(false);
    this.isRewriting.set(true);
    try {
      const rewrittenMessage = await this.geminiService.rewriteMessage(originalMessage, tone);
      this.newMessage.set(rewrittenMessage);
    } catch (e) {
      console.error('Failed to rewrite message', e);
    } finally {
      this.isRewriting.set(false);
    }
  }

  onScroll() {
    const el = this.messageContainerEl()?.nativeElement;
    if (el) {
      const threshold = 200;
      const isScrolledToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      this.showScrollButton.set(!isScrolledToBottom);
    }
  }

  private getLastReceivedMessage(): Message | undefined {
    const messages = this.conversation().messages;
    return [...messages].reverse().find(m => m.sender === 'other');
  }

  scrollToBottom(instant = false) {
    const container = this.messageContainerEl()?.nativeElement;
    if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    }
  }

  private scrollToBottomAfterSend() {
    setTimeout(() => this.scrollToBottom(), 0);
  }
  
  onMessageLongPress(event: MouseEvent, message: Message) {
    event.preventDefault();
    this.activeMessageMenu.set(this.activeMessageMenu() === message.id ? null : message.id);
  }

  copyMessage(text: string) {
    navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy: ', err));
    this.activeMessageMenu.set(null);
  }

  deleteMessage(messageId: number) {
    this.chatService.deleteMessage(this.conversation().id, messageId);
    this.activeMessageMenu.set(null);
  }

  startEdit(message: Message) {
    this.editingMessage.set(message);
    this.newMessage.set(message.text);
    this.activeMessageMenu.set(null);
  }

  cancelEdit() {
    this.editingMessage.set(null);
    this.newMessage.set('');
  }

  startReply(message: Message) {
    this.replyingTo.set(message);
    this.activeMessageMenu.set(null);
  }

  cancelReply() {
    this.replyingTo.set(null);
  }

  parseMarkdown(text: string): string {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-gray-300 dark:bg-gray-700/80 rounded px-1.5 py-0.5 font-mono text-sm">$1</code>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }
}
