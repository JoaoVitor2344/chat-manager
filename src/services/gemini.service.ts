import { Injectable } from '@angular/core';
// FIX: Import GenerateImagesResponse to correctly type the response from the generateImages API call.
import { GoogleGenAI, Type, GenerateContentResponse, GenerateImagesResponse } from '@google/genai';
import { Conversation, Message } from '../models/chat.model';

async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries = 2, 
  delay = 1000,
  backoffFactor = 2
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries) {
        await new Promise(res => setTimeout(res, delay));
        delay *= backoffFactor;
      }
    }
  }
  throw lastError;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = (process.env as any).API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      console.error('API_KEY environment variable not set.');
    }
  }
  
  private parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }

  async generateImage(prompt: string): Promise<string> {
    if (!this.ai) {
      throw new Error('AI service not available. API key might be missing.');
    }
    
    try {
      // FIX: Explicitly type the response to ensure type safety after 'retryWithBackoff'.
      const response: GenerateImagesResponse = await retryWithBackoff(() => this.ai!.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
      }));
      if (response.generatedImages.length === 0) {
        throw new Error("No image was generated.");
      }
      return response.generatedImages[0].image.imageBytes;
    } catch(error) {
       console.error('Error generating image after retries:', error);
       throw error;
    }
  }

  async summarizeConversation(conversation: Conversation): Promise<string> {
     if (!this.ai) {
      throw new Error('AI service not available. API key might be missing.');
    }
    
    const history = conversation.messages
      .filter(m => m.sender !== 'system') // Exclude system messages from summary
      .slice(-20) // Get last 20 messages for context
      .map(m => `${m.sender === 'me' ? 'User' : conversation.name}: ${m.imageUrl ? '[Sent an image]' : m.text}`)
      .join('\n');
      
    const prompt = `Please provide a concise, one-paragraph summary of the following conversation:\n\n${history}`;
    
    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => this.ai!.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        }));
        return response.text.trim();
    } catch (error) {
        console.error('Error generating summary after retries:', error);
        throw error;
    }
  }

  async generateReplySuggestions(lastMessage: string): Promise<string[]> {
    if (!this.ai) {
      throw new Error('AI service not available. API key might be missing.');
    }

    try {
      const prompt = `Generate 3 short, casual, and friendly reply suggestions for this message. Each suggestion should be a single sentence and not enclosed in quotes. Message: "${lastMessage}"`;
      
      const response = await retryWithBackoff<GenerateContentResponse>(() => this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                  description: 'A reply suggestion'
                }
              }
            }
          }
        }
      }));

      const jsonString = response.text.trim();
      const result = JSON.parse(jsonString);
      return result.suggestions || [];

    } catch (error) {
      console.error('Error generating reply suggestion after retries:', error);
      throw error;
    }
  }

  async rewriteMessage(message: string, tone: string): Promise<string> {
    if (!this.ai) {
      throw new Error('AI service not available. API key might be missing.');
    }

    try {
      const prompt = `Rewrite the following message in a ${tone} tone. Return only the rewritten message, without any extra text or quotes. Original message: "${message}"`;
      
      const response = await retryWithBackoff<GenerateContentResponse>(() => this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      }));

      return response.text.trim();

    } catch (error) {
      console.error('Error rewriting message after retries:', error);
      throw error;
    }
  }

  async * generateChatResponseStream(
    conversation: Conversation, 
    useGoogleSearch: boolean
  ): AsyncGenerator<GenerateContentResponse> {
    if (!this.ai) {
      throw new Error('AI service not available.');
    }

    const lastMessage = conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1] : null;

    // Handle multimodal case
    if (lastMessage?.sender === 'me' && lastMessage.imageUrl) {
        const imageParts = this.parseDataUrl(lastMessage.imageUrl);
        if (!imageParts) throw new Error('Invalid image format.');

        const prompt = `The user just sent this image. Describe it or react to it.`;
        
        const stream = await this.ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, { inlineData: { mimeType: imageParts.mimeType, data: imageParts.data } }] },
            config: {
                systemInstruction: conversation.personality || `You are acting as ${conversation.name}. Your personality is friendly and a bit witty. Keep your response to 1-2 short sentences.`
            }
        });

        for await (const chunk of stream) {
            yield chunk;
        }
        return;
    }
    
    // Standard text-based case
    const history = conversation.messages
      .slice(-10) 
      .map(m => `${m.sender === 'me' ? 'You' : conversation.name}: ${m.imageUrl ? '[Sent an image]' : m.text}`)
      .join('\n');

    let replyContext = '';
    if (lastMessage?.replyToMessageId) {
      const repliedToText = lastMessage.replyToText ? `"${lastMessage.replyToText}"` : 'a previous message';
      replyContext = `Context: You are replying to a message from ${lastMessage.replyToSender} that said: ${repliedToText}.\n\n`;
    }

    const prompt = `${replyContext}Based on the last few messages, continue the conversation naturally. Do not repeat what was just said.

Recent conversation:
${history}

Your turn to reply as ${conversation.name}:`;

    const config: any = {
      systemInstruction: conversation.personality || `You are ${conversation.name}, having a casual chat. Your personality is friendly and a bit witty. Keep your response to 1-2 short sentences.`
    };

    if (useGoogleSearch) {
        config.tools = [{googleSearch: {}}];
    }
      
    const stream = await this.ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: config
    });

    for await (const chunk of stream) {
        yield chunk;
    }
  }
}
