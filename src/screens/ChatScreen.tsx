import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
let Tts: any = null;
let Voice: any = null;
let DocumentPicker: any = null;
try { Tts = require('react-native-tts').default; } catch {}
try { Voice = require('@react-native-voice/voice').default; } catch {}
try { DocumentPicker = require('react-native-document-picker').default; } catch {}
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { api, apiStream, apiUpload, NetworkError } from '../lib/api';
let Config: any = {};
try { Config = require('react-native-config').default || {}; } catch {}
import { ENDPOINTS } from '../lib/endpoints';
import {
  loadStore, saveStore, newConversation,
  type ChatMessage, type Conversation, type StructuredAnswer, type AnswerItem,
} from '../lib/conversations';
import Loader from '../components/Loader';
import { Markdown } from '../components/Markdown';
import CheckIn from '../components/CheckIn';
import Imagine from '../components/Imagine';
import DataPage, { StatusPill, s as ds } from '../components/DataPage';
import TopPriorityActions from '../components/TopPriorityActions';
import TasksPage from '../components/TasksPage';
import InboxPage from '../components/InboxPage';
import DraftsPage from '../components/DraftsPage';
import HistoryScreen from './HistoryScreen';
import SettingsScreen from './SettingsScreen';
import AgentPicker, { type AgentKey } from '../components/AgentPicker';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', lineSoft: '#222F44',
  brass: '#2563EB', brassDeep: '#1D4ED8', brassLight: '#60A5FA',
  nav: '#0B1220', good: '#4ADE80', crit: '#F87171', olive: '#A78BFA', warn: '#FBBF24',
};

interface AssistantTurn {
  reply: string;
  answer?: { lead?: string; items?: AnswerItem[]; speech?: string; suggestions?: string[]; sources?: string[]; caveat?: string; more?: number; document?: string; documentTitle?: string };
  proposed?: Array<{ key: string; tool: string; summary: string; input: Record<string, unknown> }>;
}
interface BriefingItem {
  kind: string; id?: string; title: string;
  fields?: Array<{ label: string; value: string }>; meta?: string; tone?: string;
}
interface Briefing { lead: string; items: BriefingItem[]; suggestions?: string[] }

const TONE_COLORS: Record<string, string> = { warn: C.warn, crit: C.crit, good: C.good, olive: C.olive, neutral: C.inkFaint };

/** Meta badge background style based on tone/urgency. */
function metaBgStyle(item: { tone?: string; meta?: string }) {
  const m = (item.meta ?? '').toLowerCase();
  if (item.tone === 'crit' || /late|overdue|blocked/.test(m)) return { backgroundColor: 'rgba(248,113,113,0.15)' };
  if (item.tone === 'warn' || /due today|today/.test(m)) return { backgroundColor: 'rgba(251,191,36,0.15)' };
  return {};
}
function metaTextStyle(item: { tone?: string; meta?: string }) {
  const m = (item.meta ?? '').toLowerCase();
  if (item.tone === 'crit' || /late|overdue|blocked/.test(m)) return { color: C.crit };
  if (item.tone === 'warn' || /due today|today/.test(m)) return { color: C.warn };
  return {};
}

const KIND_LABELS: Record<string, string> = {
  task: 'Task', project: 'Project', purchase_order: 'PO', vendor: 'Vendor',
  email: 'Email', document: 'Document', draft: 'Draft', follow_up: 'Follow-up',
  person: 'Person', report: 'Report', file: 'File', link: 'Link', note: '',
};

function AnswerItemRow({ item }: { item: AnswerItem }) {
  const dotColor = TONE_COLORS[item.tone ?? 'neutral'] || C.inkFaint;
  const label = KIND_LABELS[item.kind] || '';
  const fields = (item.fields ?? []).filter(f => f.value !== '—');
  return (
    <View style={s.answerRow}>
      <View style={[s.answerDot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
          {!!label && <Text style={s.answerKind}>{label.toUpperCase()}</Text>}
          <Text style={s.answerItemTitle}>{item.title}</Text>
        </View>
        {!!item.detail && <Text style={s.answerDetail}>{item.detail}</Text>}
        {fields.length > 0 && (
          <View style={s.answerFields}>
            {fields.map((f, i) => (
              <Text key={f.label} style={s.answerField}>
                {i > 0 && <Text style={{ color: C.inkFaint }}> · </Text>}
                <Text style={{ color: C.inkFaint }}>{f.label}</Text> {f.value}
              </Text>
            ))}
          </View>
        )}
      </View>
      {!!item.meta && <Text style={s.answerMeta}>{item.meta}</Text>}
    </View>
  );
}

function AnswerItems({ answer }: { answer: StructuredAnswer }) {
  const files = answer.items.filter(i => i.kind === 'file');
  const records = answer.items.filter(i => i.kind !== 'file');
  const columns = sharedColumns(records);
  return (
    <>
      {records.length > 0 && (
        columns ? (
          <RecordTable items={records} columns={columns} />
        ) : (
          <View style={s.answerItemsContainer}>
            {records.map((item, i) => <AnswerItemRow key={i} item={item} />)}
          </View>
        )
      )}

      {files.length > 0 && (
        <View style={s.filePreviewContainer}>
          {files.map((item, i) =>
            item.preview === 'video' ? (
              <VideoPreview key={i} item={item} />
            ) : item.preview === 'image' ? (
              <ImagePreview key={i} item={item} />
            ) : (
              <AnswerItemRow key={i} item={item} />
            ),
          )}
        </View>
      )}

      {!!answer.document && (
        <AnswerDocumentBlock title={answer.documentTitle} body={answer.document} />
      )}
      {(answer.more ?? 0) > 0 && (
        <Text style={s.answerMore}>…and {answer.more} more{answer.items.length > 0 ? ' not shown' : ''}.</Text>
      )}
      {!!answer.caveat && (
        <View style={s.answerCaveat}>
          <Text style={s.answerCaveatText}>{answer.caveat}</Text>
        </View>
      )}
      {(answer.sources?.length ?? 0) > 0 && (
        <Text style={s.answerSources}>Checked {answer.sources!.join(', ')}.</Text>
      )}
    </>
  );
}

function AnswerDocumentBlock({ title, body }: { title?: string | null; body: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      const Clip = require('@react-native-clipboard/clipboard').default;
      Clip.setString(body);
    } catch {
      try { const { Clipboard } = require('react-native'); Clipboard.setString(body); } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={s.answerDocument}>
      <View style={s.answerDocHeader}>
        <Text style={s.answerDocTitle}>{title || 'Draft work'}</Text>
        <Pressable onPress={copy} style={s.answerDocCopyBtn}>
          <Text style={s.answerDocCopyText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <Markdown text={body} style={s.answerDocBodyWrap} />
    </View>
  );
}

/** Whether this answer needs the full width (has a table or files). */
function answerIsWide(answer?: StructuredAnswer): boolean {
  if (!answer?.items?.length) return false;
  const records = answer.items.filter(i => i.kind !== 'file');
  return Boolean(sharedColumns(records)) || answer.items.some(i => i.kind === 'file');
}

/** Whether a value looks numeric (for right-alignment in tables). */
const numeric = (v: string) => /^[-$]?\d[\d,.]*\s*(%|[KMB]B?|d late)?$/i.test(v.trim());

/** Shared column labels across items, or null if they don't align. */
function sharedColumns(items: AnswerItem[]): string[] | null {
  if (items.length < 2) return null;
  const first = items[0].fields?.map(f => f.label);
  if (!first?.length) return null;
  const key = first.join('|');
  return items.every(i => i.kind === items[0].kind && i.fields?.map(f => f.label).join('|') === key) ? first : null;
}

function RecordTable({ items, columns }: { items: AnswerItem[]; columns: string[] }) {
  const hasMeta = items.some(i => i.meta);
  const heading = KIND_LABELS[items[0].kind] || 'Name';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={s.recordTable}>
      <View style={s.recordTableInner}>
        {/* Header */}
        <View style={s.tableHeaderRow}>
          <Text style={[s.tableHeaderCell, s.tableTitleCol]}>{heading}</Text>
          {columns.map((c, ci) => {
            const right = items.every(i => {
              const v = i.fields?.[ci]?.value ?? '\u2014';
              return v === '\u2014' || numeric(v);
            });
            return (
              <Text key={c} style={[s.tableHeaderCell, s.tableFieldCol, right && { textAlign: 'right' }]}>{c}</Text>
            );
          })}
          {hasMeta && <Text style={[s.tableHeaderCell, s.tableMetaCol]} />}
        </View>
        {/* Rows */}
        {items.map((item, r) => (
          <View key={r} style={[s.tableRow, r < items.length - 1 && s.tableRowBorder]}>
            <View style={[s.tableCell, s.tableTitleCol, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <View style={[s.answerDot, { backgroundColor: TONE_COLORS[item.tone ?? 'neutral'] || C.inkFaint }]} />
              <Text style={s.tableTitleText} numberOfLines={2}>{item.title}</Text>
            </View>
            {columns.map((c, ci) => {
              const v = item.fields?.[ci]?.value ?? '\u2014';
              const right = items.every(i => {
                const x = i.fields?.[ci]?.value ?? '\u2014';
                return x === '\u2014' || numeric(x);
              });
              return (
                <Text
                  key={c}
                  style={[
                    s.tableCell, s.tableFieldCol, s.tableCellText,
                    right && { textAlign: 'right', fontVariant: ['tabular-nums'] },
                    v === '\u2014' && { color: C.inkFaint },
                  ]}
                  numberOfLines={1}
                >
                  {v}
                </Text>
              );
            })}
            {hasMeta && (
              <Text style={[s.tableCell, s.tableMetaCol, s.tableCellText, { textAlign: 'right' }]} numberOfLines={1}>
                {item.meta || ''}
              </Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** Preview for image file items. */
function ImagePreview({ item }: { item: AnswerItem }) {
  const Image = require('react-native').Image;
  const [error, setError] = React.useState(false);
  const fileUrl = item.file?.token
    ? `https://janelle.dev-build.in/api/assistant/file?token=${encodeURIComponent(item.file.token)}`
    : item.url || null;
  if (!fileUrl || error) return null;
  return (
    <View style={s.imagePreview}>
      {item.title ? <Text style={s.imagePreviewTitle}>{item.title}</Text> : null}
      <Image
        source={{ uri: fileUrl }}
        style={s.imagePreviewImg}
        resizeMode="contain"
        onError={() => setError(true)}
      />
    </View>
  );
}

/** Preview for video file items. */
function VideoPreview({ item }: { item: AnswerItem }) {
  const src = item.file?.streamUrl ?? null;
  if (!src) {
    return (
      <View style={s.videoExpired}>
        <Text style={s.videoExpiredText}>This clip's link has expired — ask again and a fresh one is made.</Text>
      </View>
    );
  }
  // React Native doesn't have a built-in video player; show a link to open externally
  const { Linking: RNLinking } = require('react-native');
  return (
    <View style={s.imagePreview}>
      {item.title ? <Text style={s.imagePreviewTitle}>{item.title}</Text> : null}
      <Pressable style={s.videoPlayBtn} onPress={() => RNLinking.openURL(src)}>
        <Icon name="play-circle-outline" size={24} color={C.brassLight} />
        <Text style={s.videoPlayText}>Play video</Text>
      </Pressable>
    </View>
  );
}

function timeOf(ts: number) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function dateDividerLabel(ts: number) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function DateDivider({ ts }: { ts: number }) {
  return (
    <View style={s.dateDivider}>
      <View style={s.dateDividerLine} />
      <Text style={s.dateDividerText}>{dateDividerLabel(ts)}</Text>
      <View style={s.dateDividerLine} />
    </View>
  );
}

function conversationToMarkdown(c: Conversation): string {
  const lines = [`# ${c.title || 'Conversation'}`, `Created: ${new Date(c.createdAt).toLocaleString()}`, ''];
  for (const m of c.messages) {
    const time = new Date(m.timestamp).toLocaleString();
    if (m.role === 'user') {
      lines.push(`**You** (${time}):`, m.content, '');
    } else {
      lines.push(`**Jenny** (${time}):`, m.content, '');
    }
  }
  return lines.join('\n');
}

// ── Init TTS ──
try {
  Tts?.setDefaultLanguage?.('en-US');
  Tts?.setIgnoreSilentSwitch?.('ignore');
} catch {}

const keyExtractor = (item: ChatMessage) => item.id;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const userId = user?.id || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [sending, setSending] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [agents, setAgents] = useState<AgentKey[]>([]);
  const [listening, setListening] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ token: string; name: string }>>([]);
  const [speechLang, setSpeechLangState] = useState('en-US');

  // Persist speech language
  useEffect(() => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.getItem('janelle.speechLang').then((v: string | null) => {
      if (v) setSpeechLangState(v);
    }).catch(() => {});
  }, []);

  const setSpeechLang = (code: string) => {
    setSpeechLangState(code);
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.setItem('janelle.speechLang', code).catch(() => {});
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [imagineOpen, setImagineOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataPage, setDataPage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const prevMsgCount = useRef(0);

  const active = conversations.find(c => c.id === activeId);
  const messages = active?.messages || [];

  // Scroll to end only when message count changes (not on every layout)
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  // Load conversations
  useEffect(() => {
    if (!userId) return;
    loadStore(userId).then(store => {
      if (store.conversations.length) {
        setConversations(store.conversations);
        setActiveId(store.activeId || store.conversations[0].id);
      } else {
        const first = newConversation();
        setConversations([first]);
        setActiveId(first.id);
      }
      setLoaded(true);
    });
  }, [userId]);

  // Save (debounced to avoid excessive writes)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveStore(userId, { v: 3, conversations, activeId });
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [userId, conversations, activeId, loaded]);

  // Load briefing with timeout
  useEffect(() => {
    const timeout = setTimeout(() => setBriefingLoading(false), 8000);
    api<Briefing & { more?: number }>(ENDPOINTS.ASSISTANT_BRIEFING)
      .then(data => {
        if (data?.lead) {
          setBriefing({ lead: data.lead, items: data.items || [], suggestions: data.suggestions || [] });
          setSuggestions(data.suggestions || []);
          setConversations(prev => prev.map(c => {
            if (c.id !== activeId || c.messages.length > 0) return c;
            return { ...c, updatedAt: Date.now(), messages: [{ id: 'briefing', role: 'assistant' as const, content: data.lead, timestamp: Date.now(), isBriefing: true }] };
          }));
        }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setBriefingLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TTS events
  useEffect(() => {
    if (!Tts) return;
    try {
      const sub = Tts.addEventListener('tts-finish', () => setSpeakingId(null));
      return () => { try { sub?.remove(); } catch {} };
    } catch { return; }
  }, []);

  const updateActive = useCallback((fn: (msgs: ChatMessage[]) => ChatMessage[]) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== activeId) return c;
      const updated = fn(c.messages);
      let title = c.title;
      if (!title) { const f = updated.find(m => m.role === 'user'); if (f) title = f.content.slice(0, 60); }
      return { ...c, messages: updated, updatedAt: Date.now(), title };
    }));
  }, [activeId]);

  // ── Actions ──

  const copyText = (id: string, text: string) => {
    try {
      const Clip = require('@react-native-clipboard/clipboard').default;
      Clip.setString(text);
    } catch {
      // Fallback to deprecated RN Clipboard
      try { const { Clipboard } = require('react-native'); Clipboard.setString(text); } catch {}
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const ttsStop = () => {
    try {
      const { NativeModules } = require('react-native');
      NativeModules.TextToSpeech?.stop(false);
    } catch {}
  };

  const listenText = async (id: string, text: string) => {
    if (!Tts) {
      Alert.alert('Text-to-Speech', 'Speech is not available on this device.');
      return;
    }
    if (speakingId === id) {
      ttsStop();
      setSpeakingId(null);
      return;
    }
    ttsStop();
    setSpeakingId(id);
    try {
      await Tts.speak(text, {});
    } catch (e) {
      setSpeakingId(null);
    }
  };

  const startListening = async () => {
    if (!Voice) return;
    try {
      setListening(true);
      Voice.onSpeechResults = (e: { value?: string[] }) => {
        if (e.value?.[0]) setInput(e.value[0]);
      };
      Voice.onSpeechEnd = () => setListening(false);
      Voice.onSpeechError = () => setListening(false);
      await Voice.start(speechLang);
    } catch {
      setListening(false);
    }
  };

  const stopListening = async () => {
    try { await Voice?.stop(); } catch {}
    setListening(false);
  };

  const pickFile = async () => {
    if (!DocumentPicker) return;
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
      });
      const file = result[0];
      if (!file) return;
      const blob = await fetch(file.uri).then(r => r.blob());
      const uploaded = await apiUpload<{ token: string }>(ENDPOINTS.ASSISTANT_UPLOAD, blob);
      setAttachedFiles(prev => [...prev, { token: uploaded.token, name: file.name || 'file' }]);
    } catch (err) {
      if (!DocumentPicker?.isCancel?.(err)) {
        // silently ignore non-cancel errors
      }
    }
  };

  const removeAttachment = (token: string) => {
    setAttachedFiles(prev => prev.filter(f => f.token !== token));
  };

  const downloadConversation = () => {
    if (!active) return;
    const md = conversationToMarkdown(active);
    Share.share({ message: md, title: active.title || 'Conversation' });
  };

  const toggleAgent = (key: AgentKey) => {
    setAgents(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const stopRequest = () => {
    abortController?.abort();
    setAbortController(null);
    setSending(false);
    setStatusMsg(null);
  };

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() };
    updateActive(msgs => [...msgs, userMsg]);
    setInput('');
    setSending(true);
    setSuggestions([]);
    setStatusMsg('Thinking...');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const history = messages.slice(-4).map(m => ({ role: m.role, content: m.content }));
      const pending = messages.filter(m => m.proposed?.some(p => p.status === 'waiting')).flatMap(m => m.proposed!.filter(p => p.status === 'waiting').map(p => p.key));
      const body: Record<string, unknown> = { message: trimmed, history, page: { path: '/assistant' }, pending };
      if (agents.length) body.agents = agents;
      if (attachedFiles.length) {
        body.attachments = attachedFiles.map(f => ({ token: f.token }));
        setAttachedFiles([]);
      }

      let result: AssistantTurn | null = null;
      let failure: string | null = null;
      let answered = false;

      const onEvent = (event: Record<string, unknown>) => {
        answered = true;
        if (event.type === 'status') setStatusMsg(String(event.text ?? ''));
        else if (event.type === 'result') result = event.data as AssistantTurn;
        else if (event.type === 'error') failure = String(event.error ?? 'Something went wrong');
      };

      const attempt = async (tries: number): Promise<void> => {
        try {
          await apiStream('/assistant/ask?stream=1', body, onEvent, controller.signal);
        } catch (err) {
          if (!(err instanceof NetworkError) || answered || tries >= 3 || controller.signal.aborted) throw err;
          setStatusMsg('Reconnecting…');
          await new Promise<void>(r => setTimeout(r, 1500 * tries));
          if (controller.signal.aborted) throw err;
          return attempt(tries + 1);
        }
      };

      await attempt(1);

      if (failure) throw new Error(failure);
      if (!result) throw new Error('No response received');

      const r = result as AssistantTurn;
      const answer: StructuredAnswer | undefined = r.answer
        ? { lead: r.answer.lead || '', items: r.answer.items || [], suggestions: r.answer.suggestions, sources: r.answer.sources, caveat: r.answer.caveat, more: r.answer.more, document: r.answer.document, documentTitle: r.answer.documentTitle }
        : undefined;
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`, role: 'assistant',
        content: r.reply || r.answer?.lead || '',
        timestamp: Date.now(),
        proposed: r.proposed?.map(p => ({ ...p, status: 'waiting' as const })),
        answer,
      };
      updateActive(msgs => [...msgs, assistantMsg]);
      if (r.answer?.suggestions?.length) setSuggestions(r.answer.suggestions);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        updateActive(msgs => [...msgs, { id: `e-${Date.now()}`, role: 'assistant', content: `Sorry: ${(err as Error).message}`, timestamp: Date.now() }]);
      }
    } finally { setSending(false); setStatusMsg(null); setAbortController(null); }
  }, [messages, sending, updateActive, agents, attachedFiles]);

  // Edit & re-ask a user message
  const editMessage = (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.role !== 'user') return;
    setEditingId(msgId);
    setEditText(msg.content);
  };

  const submitEdit = () => {
    if (!editingId || !editText.trim()) { setEditingId(null); return; }
    // Remove this message and everything after, then re-send
    updateActive(msgs => {
      const idx = msgs.findIndex(m => m.id === editingId);
      return idx >= 0 ? msgs.slice(0, idx) : msgs;
    });
    setEditingId(null);
    sendMessage(editText);
  };

  const confirmProposal = useCallback(async (messageId: string, proposalKey: string) => {
    const proposal = messages.find(m => m.id === messageId)?.proposed?.find(p => p.key === proposalKey);
    if (!proposal) return;
    updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'saving' as const } : p) }));
    try {
      const result = await api<{ label?: string }>(ENDPOINTS.ASSISTANT_CONFIRM, { method: 'POST', body: JSON.stringify({ key: proposal.key, tool: proposal.tool, input: proposal.input }) });
      updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'saved' as const, result } : p) }));
    } catch (err) {
      updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'dismissed' as const, result: { label: (err as Error).message } } : p) }));
    }
  }, [messages, updateActive]);

  const dismissProposal = useCallback((messageId: string, proposalKey: string) => {
    updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'dismissed' as const } : p) }));
  }, [updateActive]);

  // ── Conversation management ──
  const handleNewConversation = () => { const c = newConversation(); setConversations(prev => [c, ...prev]); setActiveId(c.id); setSuggestions([]); };
  const handleSelectConversation = (id: string) => { setActiveId(id); setSuggestions([]); };
  const handlePinConversation = (id: string) => { setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c)); };
  const handleRenameConversation = (id: string, title: string) => { setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c)); };
  const handleDeleteConversation = (id: string) => {
    setConversations(prev => {
      const f = prev.filter(c => c.id !== id);
      if (id === activeId) { if (f.length) setActiveId(f[0].id); else { const c = newConversation(); f.push(c); setActiveId(c.id); } }
      return f;
    });
  };

  // ── Renderers ──
  const MessageFooter = ({ item }: { item: ChatMessage }) => {
    const speakText = item.answer?.lead || item.content;
    return (
      <View style={s.messageFooter}>
        <Pressable style={s.footerBtn} onPress={() => copyText(item.id, item.content)}>
          <Icon name={copiedId === item.id ? 'checkmark' : 'copy-outline'} size={13} color={C.inkFaint} />
          <Text style={s.footerBtnText}>{copiedId === item.id ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable style={s.footerBtn} onPress={() => listenText(item.id, speakText)}>
          <Icon name={speakingId === item.id ? 'stop-circle-outline' : 'volume-medium-outline'} size={13} color={C.inkFaint} />
          <Text style={s.footerBtnText}>{speakingId === item.id ? 'Stop' : 'Listen'}</Text>
        </Pressable>
        <Text style={s.footerTime}>{timeOf(item.timestamp)}</Text>
      </View>
    );
  };

  const renderBriefingItems = () => {
    if (!briefing?.items?.length) return null;
    return (
      <View style={s.briefingItems}>
        {briefing.items.map((item, i) => (
          <View key={item.id || i} style={s.briefingCard}>
            <View style={s.briefingCardHeader}>
              <View style={[s.briefingDot, { backgroundColor: TONE_COLORS[item.tone || ''] || C.inkFaint }]} />
              <Text style={s.briefingKind}>{item.kind?.toUpperCase()}</Text>
            </View>
            <Text style={s.briefingTitle}>{item.title}</Text>
            {item.fields?.map((f, fi) => (
              <View key={fi} style={s.briefingField}>
                <Text style={s.briefingFieldLabel}>{f.label}</Text>
                <Text style={s.briefingFieldValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderBriefingFromAnswer = (answer: StructuredAnswer) => {
    if (!answer.items?.length) return null;
    return (
      <View style={s.briefingItems}>
        {answer.items.map((item, i) => (
          <View key={i} style={[s.briefingCard, item.tone === 'crit' && s.briefingCardCrit, item.tone === 'warn' && s.briefingCardWarn]}>
            <View style={s.briefingCardHeader}>
              <View style={[s.briefingDot, { backgroundColor: TONE_COLORS[item.tone || ''] || C.inkFaint }]} />
              <Text style={s.briefingKind}>{(item.kind || '').toUpperCase()}</Text>
              {item.meta && <View style={[s.briefingMeta, metaBgStyle(item)]}><Text style={[s.briefingMetaText, metaTextStyle(item)]}>{item.meta}</Text></View>}
            </View>
            <Text style={s.briefingTitle}>{item.title}</Text>
            {item.detail && <Text style={{ fontSize: 12, color: C.inkSoft, marginBottom: 4 }}>{item.detail}</Text>}
            {item.fields?.filter(f => f.value !== '—').map((f, fi) => (
              <View key={fi} style={s.briefingField}>
                <Text style={s.briefingFieldLabel}>{f.label}</Text>
                <Text style={s.briefingFieldValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        ))}
        {answer.caveat && (
          <View style={{ borderLeftWidth: 2, borderLeftColor: C.warn, paddingLeft: 10, marginTop: 4 }}>
            <Text style={{ fontSize: 12.5, color: C.inkSoft }}>{answer.caveat}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderProposals = (message: ChatMessage) => {
    if (!message.proposed?.length) return null;
    return (
      <View style={s.proposalsWrap}>
        {message.proposed.map(p => {
          const isDraft = p.tool === 'propose_draft';
          const isUpdate = p.tool === 'propose_task_update';
          const confirmLabel = isDraft ? 'Save to Drafts' : isUpdate ? 'Update Task' : 'Add Task';
          const savedLabel = isDraft ? 'Saved to Drafts' : isUpdate ? 'Updated' : 'Added to Tasks';
          const dismissedLabel = isUpdate ? 'Not changed' : 'Not added';
          return (
            <View key={p.key} style={s.proposalCard}>
              <Text style={[s.proposalText, p.status === 'dismissed' && { textDecorationLine: 'line-through', color: C.inkFaint }]}>{p.summary}</Text>
              {isDraft && p.input && p.status !== 'dismissed' && (() => {
                const raw = p.input as Record<string, unknown>;
                const str = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
                const to = str(raw.to), cc = str(raw.cc), subject = str(raw.subject), body = str(raw.body);
                return (
                  <View style={s.draftPreview}>
                    {to ? <Text style={s.draftField}>To: {to}</Text> : null}
                    {cc ? <Text style={s.draftField}>Cc: {cc}</Text> : null}
                    {subject ? <Text style={s.draftField}>Subject: {subject}</Text> : null}
                    {body ? <Text style={s.draftBody} numberOfLines={6}>{body}</Text> : null}
                  </View>
                );
              })()}
              {p.status === 'waiting' && (
                <View style={s.proposalActions}>
                  <Pressable style={s.confirmBtn} onPress={() => confirmProposal(message.id, p.key)}><Text style={s.confirmBtnText}>{confirmLabel}</Text></Pressable>
                  <Pressable style={s.dismissBtn} onPress={() => dismissProposal(message.id, p.key)}><Text style={s.dismissBtnText}>Dismiss</Text></Pressable>
                </View>
              )}
              {p.status === 'saving' && <Text style={s.savingText}>Saving…</Text>}
              {p.status === 'saved' && <Text style={s.savedText}>{p.result?.label || savedLabel}</Text>}
              {p.status === 'dismissed' && <Text style={s.dismissedText}>{p.result?.label || dismissedLabel}</Text>}
            </View>
          );
        })}
      </View>
    );
  };

  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    const isBriefing = item.isBriefing;
    const prev = index > 0 ? messages[index - 1] : null;
    const showDate = !prev || new Date(prev.timestamp).toDateString() !== new Date(item.timestamp).toDateString();
    // Editing mode for user messages
    if (isUser && editingId === item.id) {
      return (
        <View style={[s.messageBubble, s.userBubble, { maxWidth: '95%' }]}>
          <TextInput style={[s.messageText, s.userText, { padding: 0, minHeight: 40 }]}
            value={editText} onChangeText={setEditText} multiline autoFocus />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={[s.stopBtn, { backgroundColor: '#2563EB' }]} onPress={submitEdit}>
              <Text style={s.stopBtnText}>Re-ask</Text>
            </Pressable>
            <Pressable style={s.stopBtn} onPress={() => setEditingId(null)}>
              <Text style={s.stopBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <>
        {showDate && <DateDivider ts={item.timestamp} />}
        {isUser ? (
          <View style={s.userBubbleWrap}>
            <View style={[s.messageBubble, s.userBubble]}>
              <Text style={[s.messageText, s.userText]}>{item.content}</Text>
            </View>
            <View style={s.userActions}>
              <Pressable style={s.userActionBtn} onPress={() => copyText(item.id, item.content)}>
                <Icon name={copiedId === item.id ? 'checkmark' : 'copy-outline'} size={13} color={C.inkFaint} />
                <Text style={s.userActionText}>{copiedId === item.id ? 'Copied' : 'Copy'}</Text>
              </Pressable>
              <Pressable style={s.userActionBtn} onPress={() => editMessage(item.id)}>
                <Icon name="create-outline" size={13} color={C.inkFaint} />
                <Text style={s.userActionText}>Edit</Text>
              </Pressable>
              <Text style={s.userActionTime}>{timeOf(item.timestamp)}</Text>
            </View>
          </View>
        ) : (
          <View style={s.assistantWrap}>
            <View style={s.avatar}><Text style={s.avatarText}>J</Text></View>
            <View style={s.assistantRight}>
              <View style={[s.assistantContentBubble, isBriefing && s.briefingContentBubble, item.content.startsWith('Sorry:') && s.errorContentBubble]}>
                {isBriefing && <Text style={s.briefingLabel}>YOUR BRIEFING</Text>}
                <Text style={[s.messageText, s.assistantText]}>{item.answer?.lead || item.content}</Text>
                {isBriefing && !item.answer?.items?.length && renderBriefingItems()}
                {item.answer && item.answer.items?.length > 0 && (
                  isBriefing ? renderBriefingFromAnswer(item.answer) : <AnswerItems answer={item.answer} />
                )}
                {renderProposals(item)}
              </View>
              {item.content.startsWith('Sorry:') && (
                <Pressable style={s.retryBtn} onPress={() => {
                  const lastUser = messages.slice(0, messages.indexOf(item)).reverse().find(m => m.role === 'user');
                  if (lastUser) { updateActive(msgs => msgs.filter(m => m.id !== item.id)); sendMessage(lastUser.content); }
                }}>
                  <Text style={s.retryBtnText}>Try again</Text>
                </Pressable>
              )}
              <MessageFooter item={item} />
            </View>
          </View>
        )}
      </>
    );
  }, [messages, copiedId, speakingId, editingId, editText, briefing, sendMessage, updateActive, confirmProposal, dismissProposal]);

  const QUICK_CARDS = [
    { icon: 'search-outline' as const, label: 'What is late', question: 'What tasks are overdue right now?' },
    { icon: 'calendar-outline' as const, label: 'This week', question: 'What did the team work on this week?' },
    { icon: 'trending-up-outline' as const, label: 'Across projects', question: 'Which projects have the most open tasks?' },
    { icon: 'mail-unread-outline' as const, label: 'Chase vendors', question: 'Show me pending vendor follow-ups' },
  ];

  const renderEmpty = () => {
    if (briefingLoading) return (
      <View style={s.emptyWrap}>
        <Loader message="Loading your briefing..." />
      </View>
    );
    return (
      <View style={s.emptyWrap}>
        <View style={s.emptySparkle}>
          <Icon name="sparkles" size={26} color={C.brassDeep} />
        </View>
        <Text style={s.emptyTitle}>What would you like to know about the studio?</Text>
        <Text style={s.emptySubtitle}>Ask a question in plain English. Jenny searches the studio's tasks, mail, projects and Drive and explains what she finds, naming where each answer came from.</Text>
        <View style={s.quickCards}>
          {QUICK_CARDS.map(c => (
            <Pressable key={c.question} style={s.quickCard} onPress={() => sendMessage(c.question)}>
              <View style={s.quickCardIcon}><Icon name={c.icon} size={16} color={C.brassDeep} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.quickCardLabel}>{c.label.toUpperCase()}</Text>
                <Text style={s.quickCardQuestion}>{c.question}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const listFooter = React.useMemo(() => (
    <>
      {sending && (
        <View style={s.thinkingRow}>
          <View style={s.avatar}><Text style={s.avatarText}>J</Text></View>
          <View style={s.thinkingBubble}>
            <Loader dotsOnly message={statusMsg || 'Thinking…'} />
          </View>
        </View>
      )}
      {suggestions.length > 0 && !sending && (
        <View style={s.suggestionsWrap}>
          {suggestions.map((sg, i) => (
            <Pressable key={i} style={s.suggestionChip} onPress={() => sendMessage(sg)}>
              <Text style={s.suggestionText}>{sg}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  ), [sending, statusMsg, suggestions, sendMessage]);

  const convCount = conversations.filter(c => c.messages.length > 0).length;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Text style={s.headerTitle}>Jenny</Text>
        <View style={s.headerRight}>
          <Pressable style={s.headerChip} onPress={() => setHistoryOpen(true)}>
            <Text style={s.headerChipText}>Conversations{convCount > 0 ? ` ${convCount}` : ''}</Text>
          </Pressable>
          <Pressable style={[s.headerChip, agents.length > 0 && s.headerChipActive]} onPress={() => setAgentsOpen(true)}>
            <Text style={[s.headerChipText, agents.length > 0 && s.headerChipTextActive]}>Agents{agents.length > 0 ? ` ${agents.length}` : ''}</Text>
          </Pressable>
          <Pressable style={s.settingsBtn} onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: () => signOut() },
            ]);
          }}>
            <Icon name="log-out-outline" size={20} color={C.inkSoft} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={s.chatArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          ref={flatListRef} data={messages} renderItem={renderMessage} keyExtractor={keyExtractor}
          contentContainerStyle={[s.messageList, messages.length === 0 && s.messageListEmpty]}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={listFooter}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'ios'}
        />

        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <View style={s.attachBar}>
            {attachedFiles.map(f => {
              const isPdf = f.name.toLowerCase().endsWith('.pdf');
              return (
                <View key={f.token} style={s.attachChip}>
                  <View style={[s.attachBadge, isPdf ? s.attachBadgePdf : s.attachBadgeImg]}>
                    <Text style={[s.attachBadgeText, isPdf ? s.attachBadgePdfText : s.attachBadgeImgText]}>{isPdf ? 'PDF' : 'IMG'}</Text>
                  </View>
                  <Text style={s.attachText} numberOfLines={1}>{f.name}</Text>
                  <Pressable onPress={() => removeAttachment(f.token)}>
                    <Icon name="close" size={12} color={C.inkFaint} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* Plus menu */}
        {plusMenuOpen && (
          <View style={s.plusMenu}>
            <Pressable style={s.plusMenuItem} onPress={() => { setPlusMenuOpen(false); pickFile(); }}>
              <Icon name="attach-outline" size={18} color={C.inkSoft} />
              <View style={{ flex: 1 }}>
                <Text style={s.plusMenuLabel}>Attach a file</Text>
                <Text style={s.plusMenuHint}>PDF or image</Text>
              </View>
            </Pressable>
            <View style={s.plusMenuDivider} />
            <Pressable style={s.plusMenuItem} onPress={() => { setPlusMenuOpen(false); handleNewConversation(); }}>
              <Icon name="chatbubble-outline" size={18} color={C.inkSoft} />
              <View style={{ flex: 1 }}>
                <Text style={s.plusMenuLabel}>New conversation</Text>
                {messages.length === 0 && <Text style={s.plusMenuHint}>This one has not started yet</Text>}
              </View>
            </Pressable>
          </View>
        )}

        {/* Input bar */}
        <View style={[s.inputWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={s.inputPill}>
            <Pressable style={s.plusBtn} onPress={() => setPlusMenuOpen(v => !v)}>
              <Icon name={plusMenuOpen ? 'close' : 'add'} size={22} color={C.inkFaint} />
            </Pressable>
            <TextInput
              style={s.textInput}
              placeholder={`Ask Jenny anything…`}
              placeholderTextColor={C.inkFaint}
              value={input} onChangeText={setInput}
              multiline maxLength={2000} editable={!sending}
              onSubmitEditing={() => sendMessage(input)} blurOnSubmit={false}
            />
            <Pressable
              style={[s.micBtn, listening && s.micBtnActive]}
              onPress={listening ? stopListening : startListening}>
              <Icon name={listening ? 'stop' : 'mic-outline'} size={18} color={listening ? C.crit : C.inkSoft} />
            </Pressable>
            {sending ? (
              <Pressable style={[s.sendBtn, { backgroundColor: C.ink }]} onPress={stopRequest}>
                <Icon name="stop" size={16} color={C.crit} />
              </Pressable>
            ) : (
              <Pressable
                style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]}
                onPress={() => sendMessage(input)}
                disabled={!input.trim()}>
                <Icon name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modals */}
      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet">
        <HistoryScreen
          conversations={conversations.filter(c => c.messages.length > 0)}
          activeId={activeId}
          speechLang={speechLang}
          onSpeechLangChange={setSpeechLang}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onPin={handlePinConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          onClose={() => setHistoryOpen(false)}
        />
      </Modal>

      <Modal visible={settingsOpen} animationType="slide" presentationStyle="pageSheet">
        <SettingsScreen visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Modal>

      <AgentPicker
        visible={agentsOpen}
        selected={agents}
        onToggle={toggleAgent}
        onSelectAll={() => setAgents(['inbox', 'vendors', 'projects', 'george', 'chief'])}
        onClearAll={() => setAgents([])}
        onClose={() => setAgentsOpen(false)}
      />

      {/* {checkinOpen && <CheckIn visible={checkinOpen} onClose={() => setCheckinOpen(false)} />}
      {imagineOpen && <Imagine visible={imagineOpen} onClose={() => setImagineOpen(false)} />}
      {priorityOpen && <TopPriorityActions visible={priorityOpen} onClose={() => setPriorityOpen(false)} />} */}

      {/* Data page modals */}
      {dataPage && (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          {dataPage === 'projects' && <DataPage title="Projects" endpoint={ENDPOINTS.PROJECTS} onClose={() => setDataPage(null)}
            renderRow={(item: any) => (
              <View style={ds.row}><Text style={ds.rowTitle}>{item.name || item.title}</Text>
              <View style={ds.rowMeta}><Text style={ds.rowMetaText}>{item.client || ''}</Text><StatusPill status={item.status} /></View></View>
            )} />}
          {dataPage === 'tasks' && <TasksPage visible onClose={() => setDataPage(null)} />}
          {dataPage === 'vendors' && <DataPage title="Vendors" endpoint={ENDPOINTS.VENDORS} onClose={() => setDataPage(null)}
            renderRow={(item: any) => (
              <View style={ds.row}><Text style={ds.rowTitle}>{item.name}</Text>
              <Text style={ds.rowSub}>{item.email || item.contact || ''}</Text></View>
            )} />}
          {dataPage === 'inbox' && <InboxPage onClose={() => setDataPage(null)} />}
          {dataPage === 'drafts' && <DraftsPage onClose={() => setDataPage(null)} />}
          {dataPage === 'documents' && <DataPage title="Documents" endpoint={ENDPOINTS.DOCUMENTS} onClose={() => setDataPage(null)}
            renderRow={(item: any) => (
              <View style={ds.row}><Text style={ds.rowTitle}>{item.name || item.title}</Text>
              <Text style={ds.rowSub}>{item.type || ''}</Text></View>
            )} />}
          {dataPage === 'activity' && <DataPage title="Activity" endpoint={ENDPOINTS.ACTIVITY} onClose={() => setDataPage(null)}
            renderRow={(item: any) => (
              <View style={ds.row}><Text style={ds.rowTitle}>{item.action || item.type}</Text>
              <Text style={ds.rowSub}>{item.detail || item.message || ''}</Text>
              <Text style={ds.rowMetaText}>{item.at || item.created_at || ''}</Text></View>
            )} />}
          {dataPage === 'dashboard' && <DataPage title="Dashboard" endpoint={ENDPOINTS.DASHBOARD} onClose={() => setDataPage(null)}
            renderRow={(item: any) => (
              <View style={ds.row}><Text style={ds.rowTitle}>{item.label || item.title}</Text>
              <Text style={ds.rowSub}>{String(item.value ?? item.count ?? '')}</Text></View>
            )} />}
        </Modal>
      )}

      {/* Menu dropdown */}
      {menuOpen && (
        <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={[s.menuDropdown, { top: insets.top + 52 }]}>
            {/* User info */}
            <View style={s.menuUserInfo}>
              <View style={s.menuUserAvatar}>
                <Text style={s.menuUserInitial}>{(user?.name || user?.email || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuUserName}>{user?.name || 'User'}</Text>
                <Text style={s.menuUserRole}>{user?.role || 'member'}</Text>
              </View>
            </View>
            <View style={s.menuDivider} />
            {[
              { label: 'Jenny', icon: 'chatbubble-ellipses-outline', action: () => { setMenuOpen(false); setPriorityOpen(false); setDataPage(null); } },
              { label: 'Tasks', icon: 'checkmark-circle-outline', action: () => { setMenuOpen(false); setDataPage('tasks'); } },
              { label: 'Inbox', icon: 'mail-outline', action: () => { setMenuOpen(false); setDataPage('inbox'); } },
              { label: 'Drafts', icon: 'create-outline', action: () => { setMenuOpen(false); setDataPage('drafts'); } },
              { label: 'Open in Web', icon: 'open-outline', action: () => { setMenuOpen(false); const url = Config.API_BASE_URL || ''; if (url) require('react-native').Linking.openURL(url); } },
              { label: 'Sign Out', icon: 'log-out-outline', action: () => { setMenuOpen(false); Alert.alert('Sign out', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }]); } },
            ].map(item => (
              <Pressable key={item.label} style={s.menuItem} onPress={item.action}>
                <Icon name={item.icon} size={18} color={C.inkSoft} style={{ marginRight: 10 }} />
                <Text style={s.menuItemText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.ink },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  headerChipActive: { borderColor: C.brass, backgroundColor: 'rgba(37,99,235,0.12)' },
  headerChipText: { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  headerChipTextActive: { color: C.brassLight },
  settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  hamburger: { width: 16, height: 12, justifyContent: 'space-between' },
  hamburgerLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: C.inkSoft },
  dateDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 8 },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  dateDividerText: { fontSize: 11, fontWeight: '500', color: C.inkFaint, letterSpacing: 0.5, marginHorizontal: 12, textTransform: 'uppercase' },
  chatArea: { flex: 1 },
  messageList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  messageListEmpty: { flex: 1, justifyContent: 'center' },
  messageBubble: { marginBottom: 4 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: 'rgba(37,99,235,0.10)', borderRadius: 16, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 10 },
  assistantWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  assistantRight: { flex: 1, minWidth: 0 },
  assistantContentBubble: { backgroundColor: C.sunk, borderRadius: 16, borderTopLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 12 },
  briefingContentBubble: { borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)', backgroundColor: 'rgba(37,99,235,0.06)' },
  errorContentBubble: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.05)' },
  briefingLabel: { fontSize: 11, fontWeight: '600', color: C.brassDeep, letterSpacing: 0.5, marginBottom: 6 },
  retryBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  retryBtnText: { fontSize: 12, fontWeight: '600', color: C.inkSoft },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.brass, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  assistantName: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  messageText: { fontSize: 14, lineHeight: 23 },
  userText: { color: C.ink },
  assistantText: { color: C.ink },
  messageFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 2, opacity: 0.7 },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  footerBtnText: { fontSize: 11.5, color: C.inkFaint, fontWeight: '500' },
  footerTime: { fontSize: 11, color: C.inkFaint, marginLeft: 4 },
  briefingBadge: { marginLeft: 8, backgroundColor: 'rgba(37,99,235,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  briefingBadgeText: { fontSize: 10, fontWeight: '700', color: C.brassLight, letterSpacing: 0.5 },
  briefingItems: { marginTop: 12, gap: 8 },
  briefingCard: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 14 },
  briefingCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  briefingDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  briefingKind: { fontSize: 10, fontWeight: '700', color: C.inkFaint, letterSpacing: 0.5 },
  briefingMeta: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: C.sunk },
  briefingMetaText: { fontSize: 10.5, fontWeight: '600', color: C.inkSoft },
  briefingTitle: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 6 },
  briefingField: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  briefingFieldLabel: { fontSize: 12.5, color: C.inkFaint },
  briefingFieldValue: { fontSize: 12.5, color: C.inkSoft, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  suggestionsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingLeft: 36, paddingRight: 16, paddingTop: 4, paddingBottom: 8, gap: 6 },
  suggestionChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  suggestionText: { fontSize: 12.5, color: C.inkSoft },
  plusMenu: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, marginHorizontal: 8, marginBottom: 8, paddingVertical: 4, overflow: 'hidden' },
  plusMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  plusMenuIcon: { fontSize: 16 },
  plusMenuLabel: { fontSize: 13.5, color: C.ink, fontWeight: '500' },
  plusMenuHint: { fontSize: 11.5, color: C.inkFaint },
  plusMenuDivider: { height: 1, backgroundColor: C.lineSoft, marginHorizontal: 12 },
  attachBar: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 6, gap: 6 },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  attachBadge: { width: 32, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  attachBadgePdf: { backgroundColor: 'rgba(248,113,113,0.1)' },
  attachBadgeImg: { backgroundColor: 'rgba(167,139,250,0.1)' },
  attachBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  attachBadgePdfText: { color: C.crit },
  attachBadgeImgText: { color: C.olive },
  attachText: { fontSize: 12, color: C.inkSoft, maxWidth: 100 },
  attachRemove: { fontSize: 12, color: C.inkFaint, fontWeight: '600', padding: 2 },
  proposalsWrap: { marginTop: 10, gap: 8 },
  proposalCard: { backgroundColor: C.sunk, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 14 },
  proposalText: { fontSize: 13, color: C.inkSoft, marginBottom: 8 },
  proposalActions: { flexDirection: 'row', gap: 8 },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, backgroundColor: C.brass },
  confirmBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  dismissBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  dismissBtnText: { fontSize: 12, fontWeight: '600', color: C.inkFaint },
  savingText: { fontSize: 12, color: C.brassLight, fontWeight: '500', marginTop: 6 },
  savedText: { fontSize: 12, color: C.good, fontWeight: '600', marginTop: 6 },
  dismissedText: { fontSize: 12, color: C.inkFaint, marginTop: 6 },
  emptyWrap: { alignItems: 'center', paddingHorizontal: 24, maxWidth: 480 },
  emptySparkle: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(37,99,235,0.10)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: C.ink, marginBottom: 10, textAlign: 'center', letterSpacing: -0.3 },
  emptySubtitle: { fontSize: 13.5, lineHeight: 21, color: C.inkSoft, textAlign: 'center', marginBottom: 24, maxWidth: 340 },
  quickCards: { width: '100%', gap: 10, marginTop: 0 },
  quickCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  quickCardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' },
  quickCardLabel: { fontSize: 10.5, fontWeight: '600', color: C.inkFaint, letterSpacing: 1, marginBottom: 2 },
  quickCardQuestion: { fontSize: 13.5, color: C.ink, lineHeight: 19 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  thinkingBubble: { backgroundColor: C.sunk, borderRadius: 16, borderTopLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 0, backgroundColor: C.page, gap: 0 },
  inputPill: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 26, paddingVertical: 6, paddingLeft: 8, paddingRight: 6, gap: 4 },
  plusBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plusIcon: { fontSize: 20, fontWeight: '400', color: C.inkFaint },
  micBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(248,113,113,0.4)' },
  // Lucide Mic icon
  micIcon: { alignItems: 'center', width: 18, height: 20 },
  micCapsule: { width: 8, height: 12, borderRadius: 4, borderWidth: 1.8, borderColor: C.inkFaint, backgroundColor: 'transparent' },
  micArc: { width: 14, height: 8, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, borderWidth: 1.8, borderTopWidth: 0, borderColor: C.inkFaint, marginTop: -2 },
  micStem: { width: 1.8, height: 4, backgroundColor: C.inkFaint, marginTop: 0 },
  // Lucide Square (stop) icon
  stopIcon: { width: 14, height: 14, borderRadius: 2, backgroundColor: C.crit },
  textInput: { flex: 1, minHeight: 36, maxHeight: 144, backgroundColor: 'transparent', paddingHorizontal: 6, paddingVertical: 8, fontSize: 14, lineHeight: 20, color: C.ink },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.brass, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  // Lucide SendHorizontal icon (arrow pointing right)
  sendHorizontal: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  sendLine: { width: 14, height: 1.8, backgroundColor: '#fff', borderRadius: 1, position: 'absolute' },
  sendChevron: { width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', position: 'absolute', right: 1 },
  stopBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: C.crit, marginTop: 8, alignSelf: 'center' },
  stopBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  userBubbleWrap: { alignSelf: 'flex-end', maxWidth: '85%', marginBottom: 16 },
  userActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 4, opacity: 0.7 },
  userActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  userActionText: { fontSize: 11.5, color: C.inkFaint, fontWeight: '500' },
  userActionTime: { fontSize: 11, color: C.inkFaint, marginLeft: 4 },
  // Answer items
  answerItemsContainer: { marginTop: 10, marginHorizontal: -16, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.lineSoft, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  answerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.lineSoft, gap: 8 },
  answerDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  answerKind: { fontSize: 10, fontWeight: '600', color: C.inkFaint, letterSpacing: 0.5 },
  answerItemTitle: { fontSize: 13.5, fontWeight: '500', color: C.ink },
  answerDetail: { fontSize: 12.5, color: C.inkSoft, marginTop: 2 },
  answerFields: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 3 },
  answerField: { fontSize: 12, color: C.inkSoft },
  answerMeta: { fontSize: 12, color: C.inkSoft, flexShrink: 0 },
  answerDocument: { marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  answerDocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(30,42,64,0.4)', borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  answerDocTitle: { fontSize: 10, fontWeight: '600', color: C.inkFaint, letterSpacing: 0.5, textTransform: 'uppercase' },
  answerDocCopyBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  answerDocCopyText: { fontSize: 11, fontWeight: '600', color: C.inkSoft },
  answerDocBody: { fontSize: 13.5, color: C.inkSoft, lineHeight: 20, paddingHorizontal: 12, paddingVertical: 10 },
  answerDocBodyWrap: { paddingHorizontal: 12, paddingVertical: 10 },
  answerMore: { fontSize: 12.5, color: C.inkFaint, marginTop: 6 },
  answerCaveat: { marginTop: 6, borderLeftWidth: 2, borderLeftColor: C.warn },
  answerCaveatText: { fontSize: 12.5, color: C.inkSoft, paddingLeft: 8 },
  answerSources: { fontSize: 11.5, color: C.inkFaint, marginTop: 6 },
  draftPreview: { marginTop: 8, padding: 10, borderRadius: 6, backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: C.line },
  draftField: { fontSize: 12, color: C.inkSoft, marginBottom: 2 },
  draftBody: { fontSize: 12, color: C.ink, marginTop: 4, lineHeight: 18 },
  // Record table (horizontal scrollable)
  recordTable: { marginTop: 10, marginHorizontal: -0 },
  recordTableInner: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden', minWidth: '100%' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: 'rgba(30,42,64,0.4)' },
  tableHeaderCell: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 11, fontWeight: '500', color: C.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableTitleCol: { width: 220, flexShrink: 0 },
  tableFieldCol: { width: 130, flexShrink: 0 },
  tableMetaCol: { width: 70, flexShrink: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  tableCell: { paddingHorizontal: 12, paddingVertical: 10 },
  tableTitleText: { fontSize: 12.5, fontWeight: '500', color: C.ink, flex: 1 },
  tableCellText: { fontSize: 12.5, color: C.inkSoft },
  // Image / video previews
  filePreviewContainer: { marginTop: 10, gap: 8 },
  imagePreview: { borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  imagePreviewTitle: { fontSize: 13.5, fontWeight: '500', color: C.ink, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  imagePreviewImg: { width: '100%', height: 200, backgroundColor: '#000' },
  videoExpired: { borderRadius: 10, backgroundColor: C.sunk, paddingHorizontal: 12, paddingVertical: 20, alignItems: 'center' },
  videoExpiredText: { fontSize: 12.5, color: C.inkFaint, textAlign: 'center' },
  videoPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center' },
  videoPlayText: { fontSize: 14, fontWeight: '500', color: C.brassLight },
  // Briefing card urgency accents
  briefingCardCrit: { borderLeftWidth: 3, borderLeftColor: C.crit },
  briefingCardWarn: { borderLeftWidth: 3, borderLeftColor: C.warn },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100 },
  menuDropdown: { position: 'absolute', right: 16, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingVertical: 6, minWidth: 200, zIndex: 101 },
  menuUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  menuUserAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.brass, alignItems: 'center', justifyContent: 'center' },
  menuUserInitial: { fontSize: 15, fontWeight: '700', color: '#fff' },
  menuUserName: { fontSize: 14, fontWeight: '600', color: C.ink },
  menuUserRole: { fontSize: 12, color: C.inkFaint, textTransform: 'capitalize' },
  menuDivider: { height: 1, backgroundColor: C.lineSoft, marginHorizontal: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { fontSize: 14, color: C.ink, fontWeight: '500' },
});
