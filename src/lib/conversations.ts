import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AnswerField { label: string; value: string }
export interface AnswerFile {
  name: string;
  mimeType: string;
  size: number;
  source: string;
  token: string;
  downloadable: boolean;
  webUrl: string | null;
  streamUrl?: string | null;
}
export interface AnswerItem {
  kind: string;
  title: string;
  detail?: string;
  fields?: AnswerField[];
  tone?: string;
  meta?: string;
  url?: string;
  file?: AnswerFile;
  preview?: 'image' | 'video' | 'pdf' | string;
  pages?: number[];
}
export interface StructuredAnswer {
  lead: string;
  items: AnswerItem[];
  suggestions?: string[];
  sources?: string[];
  caveat?: string;
  more?: number;
  document?: string;
  documentTitle?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  proposed?: ProposedAction[];
  isBriefing?: boolean;
  answer?: StructuredAnswer;
}

export interface ProposedAction {
  key: string;
  tool: string;
  summary: string;
  input: Record<string, unknown>;
  status: 'waiting' | 'saving' | 'saved' | 'dismissed';
  result?: { label?: string };
}

export interface Conversation {
  id: string;
  title: string | null;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface Stored {
  v: 3;
  conversations: Conversation[];
  activeId: string;
}

const KEEP_CONVERSATIONS = 40;
const KEEP_MESSAGES = 60;

function storageKey(userId: string) {
  return `janelle.assistant.v1.${userId}`;
}

export async function loadStore(userId: string): Promise<Stored> {
  const empty: Stored = { v: 3, conversations: [], activeId: '' };
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.conversations)) return empty;
    return { v: 3, conversations: parsed.conversations, activeId: parsed.activeId || '' };
  } catch {
    return empty;
  }
}

export async function saveStore(userId: string, store: Stored): Promise<void> {
  const trimmed: Stored = {
    ...store,
    conversations: store.conversations
      .slice(0, KEEP_CONVERSATIONS)
      .map(c => ({
        ...c,
        messages: c.messages.slice(-KEEP_MESSAGES),
      })),
  };
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
  } catch {
    // Storage full — try smaller
    try {
      const smaller: Stored = {
        ...store,
        conversations: store.conversations.slice(0, 8).map(c => ({
          ...c,
          messages: c.messages.slice(-30),
        })),
      };
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(smaller));
    } catch {
      // Give up silently
    }
  }
}

export function newConversation(): Conversation {
  return {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

export function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;
  const month = today - 30 * 86400000;

  const groups: { label: string; items: Conversation[] }[] = [];
  const pinned = conversations.filter(c => c.pinned);
  const unpinned = conversations.filter(c => !c.pinned);

  if (pinned.length) groups.push({ label: 'Pinned', items: pinned });

  const todayItems = unpinned.filter(c => c.updatedAt >= today);
  const yesterdayItems = unpinned.filter(c => c.updatedAt >= yesterday && c.updatedAt < today);
  const weekItems = unpinned.filter(c => c.updatedAt >= week && c.updatedAt < yesterday);
  const monthItems = unpinned.filter(c => c.updatedAt >= month && c.updatedAt < week);
  const older = unpinned.filter(c => c.updatedAt < month);

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (weekItems.length) groups.push({ label: 'Previous 7 days', items: weekItems });
  if (monthItems.length) groups.push({ label: 'Previous 30 days', items: monthItems });
  if (older.length) groups.push({ label: 'Older', items: older });

  return groups;
}
