
export interface Message {
  id: number;
  text: string;
  timestamp: string;
  sender: 'me' | 'other' | 'system';
  status?: 'sent' | 'delivered' | 'read';
  imageUrl?: string;
  isLoading?: boolean; // For placeholder messages like image generation
  sources?: { title: string, uri: string }[];
  replyToMessageId?: number;
  replyToText?: string;
  replyToSender?: string;
}

export interface Conversation {
  id: number;
  name: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageTimestamp: string;
  messages: Message[];
  isTyping?: boolean;
  personality?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}
