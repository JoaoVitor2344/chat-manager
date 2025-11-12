import { Component, ChangeDetectionStrategy, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatListComponent } from './components/chat-list/chat-list.component';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';
import { SettingsComponent } from './components/settings/settings.component';
import { Conversation } from './models/chat.model';

type View = 'list' | 'chat' | 'settings';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [CommonModule, ChatListComponent, ChatWindowComponent, SettingsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  currentView = signal<View>('list');
  selectedConversation = signal<Conversation | null>(null);

  constructor() {
    afterNextRender(() => {
      if ('serviceWorker' in navigator) {
        // Dynamically determine the scope based on the current URL's path.
        // This makes the registration more explicit, which can resolve "not same-origin"
        // errors in specific sandboxed or complex hosting environments.
        const scope = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) || '/';
        navigator.serviceWorker.register('sw.js', { scope })
          .then(reg => console.log('Service Worker registered successfully.', reg))
          .catch(err => console.error('Service Worker registration failed:', err));
      }
    });
  }

  onConversationSelected(conversation: Conversation) {
    this.selectedConversation.set(conversation);
    this.currentView.set('chat');
  }

  onBackToList() {
    this.selectedConversation.set(null);
    this.currentView.set('list');
  }

  onShowSettings() {
    this.currentView.set('settings');
  }
}
