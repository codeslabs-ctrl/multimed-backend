import type { ChatMessage } from "./ai.ts";

export interface ConversationState {
  messages: ChatMessage[];
  createdAt: number;
}

const store = new Map<string, ConversationState>();

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hora
const MAX_MESSAGES = 50;

function prune(): void {
  const now = Date.now();
  for (const [id, state] of store.entries()) {
    if (now - state.createdAt > MAX_AGE_MS) store.delete(id);
  }
}

export function getOrCreate(conversationId: string): ConversationState {
  prune();
  let state = store.get(conversationId);
  if (!state) {
    state = {
      messages: [],
      createdAt: Date.now(),
    };
    store.set(conversationId, state);
  }
  return state;
}

export function append(conversationId: string, role: "user" | "assistant", content: string): void {
  const state = getOrCreate(conversationId);
  state.messages.push({ role, content });
  if (state.messages.length > MAX_MESSAGES) {
    state.messages = state.messages.slice(-MAX_MESSAGES);
  }
}

export function getMessages(conversationId: string): ChatMessage[] {
  return getOrCreate(conversationId).messages;
}
