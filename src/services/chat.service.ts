import { Injectable, signal, inject, effect } from '@angular/core';
import { Conversation, Message } from '../models/chat.model';
import { GeminiService } from './gemini.service';
import { GenerateContentResponse } from '@google/genai';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly CONVERSATIONS_KEY = 'gemini-chat-conversations';
  private geminiService = inject(GeminiService);

  conversations = signal<Conversation[]>(this.loadConversations());

  constructor() {
    effect(() => {
      localStorage.setItem(this.CONVERSATIONS_KEY, JSON.stringify(this.conversations()));
    });
  }

  private loadConversations(): Conversation[] {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem(this.CONVERSATIONS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    }
    return [
      {
        id: 1,
        name: 'Alice',
        avatarUrl: 'https://picsum.photos/seed/alice/100/100',
        lastMessage: 'Hey, are we still on for tonight?',
        lastMessageTimestamp: '10:42 AM',
        isTyping: false,
        isPinned: true,
        personality: 'You are Alice, a friendly and slightly sarcastic friend. You enjoy witty banter.',
        messages: [
          { id: 1, text: 'Hey, how is it going?', timestamp: '10:40 AM', sender: 'other' },
          { id: 2, text: 'Pretty good! Just finishing up some work. You?', timestamp: '10:41 AM', sender: 'me', status: 'read' },
          { id: 3, text: 'Hey, are we still on for tonight?', timestamp: '10:42 AM', sender: 'other' },
        ],
      },
      {
        id: 2,
        name: 'Bob',
        avatarUrl: 'https://picsum.photos/seed/bob/100/100',
        lastMessage: 'Sounds good, see you then.',
        lastMessageTimestamp: 'Yesterday',
        isTyping: false,
        personality: 'You are Bob, a helpful and professional colleague. You are direct and to the point.',
        messages: [
          { id: 1, text: 'Meeting is at 3 PM tomorrow.', timestamp: 'Yesterday', sender: 'other' },
          { id: 2, text: 'Sounds good, see you then.', timestamp: 'Yesterday', sender: 'me', status: 'read' },
        ],
      },
      {
        id: 3,
        name: 'Design Team',
        avatarUrl: 'https://picsum.photos/seed/design/100/100',
        lastMessage: 'I pushed the latest mockups to Figma.',
        lastMessageTimestamp: 'Yesterday',
        isTyping: false,
        personality: 'You are a creative assistant for a design team. You are enthusiastic and encouraging.',
        messages: [
          { id: 1, text: 'I pushed the latest mockups to Figma.', timestamp: 'Yesterday', sender: 'other' },
        ],
      },
      {
        id: 4,
        name: 'Charlie',
        avatarUrl: 'https://picsum.photos/seed/charlie/100/100',
        lastMessage: 'You too!',
        lastMessageTimestamp: '2 days ago',
        isTyping: false,
        personality: 'You are Charlie, a casual and easy-going acquaintance.',
        messages: [
          { id: 1, text: 'Have a great weekend!', timestamp: '2 days ago', sender: 'me', status: 'read' },
          { id: 2, text: 'You too!', timestamp: '2 days ago', sender: 'other' },
        ],
      }
    ];
  }

  addMessage(conversationId: number, text: string, options?: { useGoogleSearch?: boolean, replyTo?: Message | null }) {
    this.addMessageAndHandleReply(conversationId, { text, useGoogleSearch: options?.useGoogleSearch, replyTo: options?.replyTo });
  }

  addImageMessage(conversationId: number, imageUrl: string) {
    this.addMessageAndHandleReply(conversationId, { text: '', imageUrl, lastMessageOverride: '📷 Image' });
  }

  deleteMessage(conversationId: number, messageId: number) {
    this.conversations.update(convos => {
      const convoIndex = convos.findIndex(c => c.id === conversationId);
      if (convoIndex === -1) return convos;

      const newConvos = [...convos];
      const convoToUpdate = { ...newConvos[convoIndex] };
      
      const originalMessages = convoToUpdate.messages;
      convoToUpdate.messages = convoToUpdate.messages.filter(m => m.id !== messageId);
      
      const wasLastMessage = originalMessages[originalMessages.length - 1]?.id === messageId;

      if (wasLastMessage && convoToUpdate.messages.length > 0) {
        const newLastMessage = convoToUpdate.messages[convoToUpdate.messages.length - 1];
        convoToUpdate.lastMessage = newLastMessage.imageUrl ? '📷 Image' : (newLastMessage.text.substring(0, 30) + (newLastMessage.text.length > 30 ? '...' : ''));
        convoToUpdate.lastMessageTimestamp = newLastMessage.timestamp;
      } else if (convoToUpdate.messages.length === 0) {
        convoToUpdate.lastMessage = 'Say hi to start the conversation!';
        convoToUpdate.lastMessageTimestamp = 'Just now';
      }
      
      newConvos[convoIndex] = convoToUpdate;
      return newConvos;
    });
  }

  editMessage(conversationId: number, messageId: number, newText: string) {
    this.conversations.update(convos => {
      const convoIndex = convos.findIndex(c => c.id === conversationId);
      if (convoIndex === -1) return convos;

      const newConvos = [...convos];
      const convoToUpdate = { ...newConvos[convoIndex] };
      
      const messageIndex = convoToUpdate.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return convos;

      const updatedMessages = [...convoToUpdate.messages];
      updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], text: newText };
      convoToUpdate.messages = updatedMessages;

      if (messageIndex === convoToUpdate.messages.length - 1) {
        convoToUpdate.lastMessage = newText.substring(0, 30) + (newText.length > 30 ? '...' : '');
      }

      newConvos[convoIndex] = convoToUpdate;
      return newConvos;
    });
  }

  togglePinConversation(conversationId: number) {
    this.conversations.update(convos => {
      const convoIndex = convos.findIndex(c => c.id === conversationId);
      if (convoIndex === -1) return convos;
      
      const newConvos = [...convos];
      const convoToUpdate = { ...newConvos[convoIndex] };
      
      convoToUpdate.isPinned = !convoToUpdate.isPinned;
      
      newConvos[convoIndex] = convoToUpdate;
      return newConvos;
    });
  }

  toggleArchiveConversation(conversationId: number) {
    this.conversations.update(convos => {
      const convoIndex = convos.findIndex(c => c.id === conversationId);
      if (convoIndex === -1) return convos;
      
      const newConvos = [...convos];
      const convoToUpdate = { ...newConvos[convoIndex] };
      
      convoToUpdate.isArchived = !convoToUpdate.isArchived;
      
      newConvos[convoIndex] = convoToUpdate;
      return newConvos;
    });
  }

  generateImageForPrompt(conversationId: number, prompt: string) {
    // Add a placeholder message
    const placeholderMessageId = Date.now();
    this.conversations.update(convos => {
      const convoIndex = convos.findIndex(c => c.id === conversationId);
      if (convoIndex === -1) return convos;
      
      const newConvos = [...convos];
      const convoToUpdate = { ...newConvos[convoIndex] };
      
      const userMessage: Message = {
        id: convoToUpdate.messages.length + 1,
        text: `/imagine ${prompt}`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        sender: 'me',
        status: 'sent'
      };
      
      const placeholderMessage: Message = {
        id: placeholderMessageId,
        text: '🎨 Generating your image...',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        sender: 'system',
        isLoading: true,
      };

      convoToUpdate.messages = [...convoToUpdate.messages, userMessage, placeholderMessage];
      newConvos[convoIndex] = convoToUpdate;
      return newConvos;
    });

    // Generate the image
    this.geminiService.generateImage(prompt).then(base64Image => {
      const imageUrl = `data:image/png;base64,${base64Image}`;
      this.conversations.update(convos => {
          const convoIndex = convos.findIndex(c => c.id === conversationId);
          if (convoIndex === -1) return convos;

          const newConvos = [...convos];
          const convoToUpdate = { ...newConvos[convoIndex] };
          
          const messageIndex = convoToUpdate.messages.findIndex(m => m.id === placeholderMessageId);
          if (messageIndex === -1) return newConvos; // Message was deleted

          const updatedMessage: Message = {
            id: placeholderMessageId,
            text: '',
            imageUrl: imageUrl,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            sender: 'other',
            isLoading: false
          };
          convoToUpdate.messages[messageIndex] = updatedMessage;
          convoToUpdate.lastMessage = "📷 Here's the image you requested!";
          convoToUpdate.lastMessageTimestamp = updatedMessage.timestamp;

          newConvos[convoIndex] = convoToUpdate;
          return newConvos;
      });
    }).catch(error => {
       console.error("Image generation failed:", error);
       this.conversations.update(convos => {
          const convoIndex = convos.findIndex(c => c.id === conversationId);
          if (convoIndex === -1) return convos;

          const newConvos = [...convos];
          const convoToUpdate = { ...newConvos[convoIndex] };
          
          const messageIndex = convoToUpdate.messages.findIndex(m => m.id === placeholderMessageId);
          if (messageIndex === -1) return newConvos;
          
          const errorMessage: Message = {
             ...convoToUpdate.messages[messageIndex],
             isLoading: false,
             text: 'Sorry, I couldn\'t create the image. Please try again.'
          };
          convoToUpdate.messages[messageIndex] = errorMessage;
          newConvos[convoIndex] = convoToUpdate;
          return newConvos;
       });
    });
  }
  
  async summarizeConversation(conversationId: number) {
    const conversation = this.conversations().find(c => c.id === conversationId);
    if (!conversation) return;

    try {
      const summary = await this.geminiService.summarizeConversation(conversation);
      this.conversations.update(convos => {
        const convoIndex = convos.findIndex(c => c.id === conversationId);
        if (convoIndex === -1) return convos;

        const newConvos = [...convos];
        const convoToUpdate = { ...newConvos[convoIndex] };
        
        const summaryMessage: Message = {
          id: convoToUpdate.messages.length + 1,
          text: summary,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          sender: 'system'
        };

        convoToUpdate.messages = [...convoToUpdate.messages, summaryMessage];
        newConvos[convoIndex] = convoToUpdate;
        return newConvos;
      });
    } catch (error) {
      console.error("Summarization failed:", error);
      // Optionally add an error message to the chat
    }
  }

  startNewConversation() {
    this.conversations.update(convos => {
        const newId = Math.max(0, ...convos.map(c => c.id)) + 1;
        const newNames = ['Eva', 'Daniel', 'Olivia', 'Leo', 'Mia', 'Noah'];
        const existingNames = convos.map(c => c.name);
        const availableName = newNames.find(n => !existingNames.includes(n)) || `New Contact ${newId}`;
        
        const newConvo: Conversation = {
            id: newId,
            name: availableName,
            avatarUrl: `https://picsum.photos/seed/${availableName.toLowerCase()}/100/100`,
            lastMessage: 'Say hi to start the conversation!',
            lastMessageTimestamp: 'Just now',
            messages: [],
            isTyping: false,
            personality: 'You are a helpful AI assistant. Introduce yourself and ask how you can help.'
        };
        return [newConvo, ...convos];
    });
  }

  private addMessageAndHandleReply(
    conversationId: number, 
    { text, imageUrl, lastMessageOverride, useGoogleSearch, replyTo }: { text: string, imageUrl?: string, lastMessageOverride?: string, useGoogleSearch?: boolean, replyTo?: Message | null }
  ) {
    this.conversations.update(convos => {
      const convoIndex = convos.findIndex(c => c.id === conversationId);
      if (convoIndex === -1) return convos;

      const newConvos = [...convos];
      const convoToUpdate = { ...newConvos[convoIndex] };
      
      const newMessage: Message = {
        id: Date.now(), // Use timestamp for more unique ID
        text,
        imageUrl,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        sender: 'me',
        status: 'sent',
        replyToMessageId: replyTo?.id,
        replyToText: replyTo?.imageUrl ? '📷 Image' : replyTo?.text,
        replyToSender: replyTo?.sender === 'me' ? 'You' : convoToUpdate.name
      };

      convoToUpdate.messages = [...convoToUpdate.messages, newMessage];
      convoToUpdate.lastMessage = lastMessageOverride ?? text;
      convoToUpdate.lastMessageTimestamp = newMessage.timestamp;
      
      // Mark user's previous messages as 'read'
      convoToUpdate.messages = convoToUpdate.messages.map(m => 
        m.sender === 'me' && m.status !== 'read' ? { ...m, status: 'read' as const } : m
      );

      newConvos[convoIndex] = convoToUpdate;

      const updatedConvo = newConvos.splice(convoIndex, 1)[0];
      newConvos.unshift(updatedConvo);
      
      return newConvos;
    });

    this.streamAiReply(conversationId, useGoogleSearch);
  }

  private async streamAiReply(conversationId: number, useGoogleSearch: boolean = false) {
    // 1. Set typing indicator
    this.conversations.update(convos => convos.map(c => 
        c.id === conversationId ? { ...c, isTyping: true } : c
    ));

    const currentConversation = this.conversations().find(c => c.id === conversationId);
    if (!currentConversation) {
        this.conversations.update(convos => convos.map(c => c.id === conversationId ? { ...c, isTyping: false } : c));
        return;
    }
    
    // 2. Add an empty message for the AI response
    const replyMessageId = Date.now();
    this.conversations.update(convos => {
       const convoIndex = convos.findIndex(c => c.id === conversationId);
       if (convoIndex === -1) return convos;
       const newConvos = [...convos];
       const convoToUpdate = {...newConvos[convoIndex]};
       convoToUpdate.messages = [...convoToUpdate.messages, {
         id: replyMessageId,
         text: '',
         sender: 'other',
         timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
       }];
       newConvos[convoIndex] = convoToUpdate;
       return newConvos;
    });

    // 3. Generate AI response via streaming
    try {
      const stream = this.geminiService.generateChatResponseStream(currentConversation, useGoogleSearch);

      for await (const chunk of stream) {
        const chunkText = chunk.text;
        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
        
        this.conversations.update(convos => {
          const convoIndex = convos.findIndex(c => c.id === conversationId);
          if (convoIndex === -1) return convos;
          
          const newConvos = [...convos];
          const convoToUpdate = {...newConvos[convoIndex]};
          const messageIndex = convoToUpdate.messages.findIndex(m => m.id === replyMessageId);
          if (messageIndex === -1) return newConvos;
          
          const updatedMessage = {...convoToUpdate.messages[messageIndex]};
          updatedMessage.text += chunkText;
          
          if (groundingMetadata?.groundingChunks) {
            const newSources = groundingMetadata.groundingChunks
              .map((c: any) => c.web)
              .filter(Boolean); // Filter out any non-web chunks
            if(newSources.length > 0) {
              updatedMessage.sources = [...(updatedMessage.sources || []), ...newSources];
            }
          }
          
          convoToUpdate.messages[messageIndex] = updatedMessage;
          convoToUpdate.lastMessage = updatedMessage.text.length > 30 ? updatedMessage.text.substring(0, 30) + '...' : updatedMessage.text;
          convoToUpdate.lastMessageTimestamp = updatedMessage.timestamp;
          
          newConvos[convoIndex] = convoToUpdate;
          return newConvos;
        });
      }
    } catch (error) {
      console.error('Failed to generate chat response:', error);
       this.conversations.update(convos => {
          const convoIndex = convos.findIndex(c => c.id === conversationId);
          if (convoIndex === -1) return convos;
          
          const newConvos = [...convos];
          const convoToUpdate = {...newConvos[convoIndex]};
          const messageIndex = convoToUpdate.messages.findIndex(m => m.id === replyMessageId);
          if (messageIndex === -1) return newConvos;
          
          const updatedMessage = {...convoToUpdate.messages[messageIndex]};
          updatedMessage.text = "Sorry, I'm having trouble connecting. Please try again in a moment.";
          convoToUpdate.messages[messageIndex] = updatedMessage;
          newConvos[convoIndex] = convoToUpdate;
          return newConvos;
       });
    } finally {
        // 4. Turn off typing indicator
        this.conversations.update(convos => {
            const convoIndex = convos.findIndex(c => c.id === conversationId);
            if (convoIndex === -1) return convos;
            
            const newConvos = [...convos];
            const convoToUpdate = { ...newConvos[convoIndex], isTyping: false };
            newConvos[convoIndex] = convoToUpdate;
            
            // Move conversation to top after reply is complete
            const finalConvo = newConvos.splice(convoIndex, 1)[0];
            newConvos.unshift(finalConvo);

            return newConvos;
        });
    }
  }
}
