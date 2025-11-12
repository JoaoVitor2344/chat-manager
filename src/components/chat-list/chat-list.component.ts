
import { Component, ChangeDetectionStrategy, inject, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../services/chat.service';
import { Conversation } from '../../models/chat.model';

@Component({
  selector: 'app-chat-list',
  templateUrl: './chat-list.component.html',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatListComponent {
  private chatService = inject(ChatService);
  private conversations = this.chatService.conversations;

  searchQuery = signal('');
  activeMenuConversationId = signal<number | null>(null);
  showArchived = signal(false);

  sortedConversations = computed(() => {
    return this.conversations().slice().sort((a, b) => {
      // Pinned items come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Otherwise, maintain original order (which is likely by last message time)
      return 0;
    });
  });

  unarchivedConversations = computed(() => this.sortedConversations().filter(c => !c.isArchived));
  archivedConversations = computed(() => this.sortedConversations().filter(c => c.isArchived));

  filteredUnarchivedConversations = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.unarchivedConversations();
    }
    return this.unarchivedConversations().filter(convo =>
      convo.name.toLowerCase().includes(query)
    );
  });

  filteredArchivedConversations = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.archivedConversations();
    }
    return this.archivedConversations().filter(convo =>
      convo.name.toLowerCase().includes(query)
    );
  });

  conversationSelected = output<Conversation>();
  settingsClicked = output<void>();

  selectConversation(conversation: Conversation) {
    this.activeMenuConversationId.set(null);
    this.conversationSelected.emit(conversation);
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }
  
  onConversationLongPress(event: MouseEvent, convoId: number) {
    event.preventDefault(); // Prevent default context menu
    this.activeMenuConversationId.set(this.activeMenuConversationId() === convoId ? null : convoId);
  }
  
  togglePin(conversation: Conversation) {
    this.chatService.togglePinConversation(conversation.id);
    this.activeMenuConversationId.set(null);
  }

  toggleArchive(conversation: Conversation) {
    this.chatService.toggleArchiveConversation(conversation.id);
    this.activeMenuConversationId.set(null);
  }

  createNewConversation() {
    this.chatService.startNewConversation();
  }
}
