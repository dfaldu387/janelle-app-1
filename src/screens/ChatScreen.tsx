import { showAlert } from '../components/DarkAlert';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
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
try {
  const { NativeModules, NativeEventEmitter } = require('react-native');
  if (NativeModules.JanelleTts) {
    const mod = NativeModules.JanelleTts;
    const emitter = new NativeEventEmitter(mod);
    Tts = {
      speak: (text: string) => {
        return new Promise<void>((resolve) => {
          const sub = emitter.addListener('tts-finish', () => {
            sub.remove();
            resolve();
          });
          mod.speak(text);
        });
      },
      stop: () => mod.stop(),
      addEventListener: (event: string, cb: () => void) => {
        const sub = emitter.addListener('tts-finish', cb);
        return { remove: () => sub.remove() };
      },
      setDefaultLanguage: () => {},
      setIgnoreSilentSwitch: () => {},
    };
  }
} catch {}
try {
  const _Voice = require('@react-native-voice/voice').default;
  // Verify the native module is actually linked (not just the JS wrapper)
  const { NativeModules } = require('react-native');
  if (NativeModules.Voice) Voice = _Voice;
} catch {}
try { DocumentPicker = require('@react-native-documents/picker'); } catch {}
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { api, apiStream, apiUpload, apiImageSource, NetworkError } from '../lib/api';
import { supabase } from '../lib/supabase';
let Config: any = {};
try { Config = require('react-native-config').default || {}; } catch {}
import { ENDPOINTS } from '../lib/endpoints';
import {
  loadStore, saveStore, newConversation,
  type ChatMessage, type Conversation, type StructuredAnswer, type AnswerItem,
  type CheckinTask, type CheckinOutcome, type AttachedFile,
} from '../lib/conversations';
import Loader from '../components/Loader';
import { Markdown } from '../components/Markdown';
import DataPage, { StatusPill, s as ds } from '../components/DataPage';
import TopPriorityActions from '../components/TopPriorityActions';
import TasksPage from '../components/TasksPage';
import InboxPage from '../components/InboxPage';
import DraftsPage from '../components/DraftsPage';
import HistoryScreen from './HistoryScreen';
import SettingsScreen from './SettingsScreen';
import AgentPicker, { type AgentKey } from '../components/AgentPicker';
import CheckIn from '../components/CheckIn';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', lineSoft: '#222F44',
  brass: '#2563EB', brassDeep: '#60A5FA', brassLight: '#60A5FA',
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

/** Clean text for TTS — strip URLs, emoji, markdown, symbols. Matches web's speakable(). */
function speakable(text: string): string {
  let s = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ');
  s = s.split(/\r?\n+/)
    .map(line => line.replace(/^\s*(?:[-*•·>]|#{1,6}|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .reduce((said, line) => (said ? `${said}${/[.!?:;,]$/.test(said) ? ' ' : '. '}${line}` : line), '');
  s = s
    .replace(/\*\*|__|`+/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|$|[.,!?])/g, '$1')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s*[·•|]\s*/g, ', ')
    .replace(/([\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, '$1 ')
    .replace(/(\p{L})\s*\/\s*(?=\p{L})/gu, '$1 or ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/#(?=\d)/g, 'number ')
    .replace(/[""„‟"«»]/g, '')
    .replace(/(?<!\p{L})[''']|['''](?!\p{L})/gu, '')
    .replace(/'/g, "'")
    .replace(/\s*[([{]\s*/g, ', ')
    .replace(/\s*[)\]}]\s*/g, ', ')
    .replace(/…|\.{3,}/g, '.')
    .replace(/[→←↑↓⇒⇐↗↘✓✔✗✘*_~^=<>\\]/g, ' ')
    .replace(/\$(?!\d)/g, ' ');
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/([.!?;:]),/g, '$1')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/([.!?])(\s*\.)+/g, '$1')
    .replace(/^[\s,.;:]+/, '')
    .replace(/[\s,;:]+$/, '')
    .trim();
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
      {/* Document block first — matches web order */}
      {!!answer.document && (
        <AnswerDocumentBlock title={answer.documentTitle} body={answer.document} />
      )}

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
            ) : item.preview ? (
              <ImagePreview key={i} item={item} />
            ) : (
              <AnswerItemRow key={i} item={item} />
            ),
          )}
        </View>
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

/**
 * Preview for image file items.
 * Fetches image bytes with auth in RN context (avoids CORS),
 * converts to base64 data URI, renders in WebView (handles SVG/PNG/JPEG).
 */
function ImagePreview({ item }: { item: AnswerItem }) {
  const { ActivityIndicator } = require('react-native');
  let WebView: any = null;
  try { WebView = require('react-native-webview').WebView; } catch {}
  const [dataUri, setDataUri] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let fetchUrl: string | null = null;
        let needsAuth = false;

        if (item.file?.token) {
          const src = await apiImageSource(`/assistant/file?token=${encodeURIComponent(item.file.token)}`);
          fetchUrl = src.uri;
          needsAuth = true;
        } else if (item.url) {
          fetchUrl = item.url;
        }
        if (!fetchUrl) { if (!cancelled) setError('No image source'); return; }

        // Fetch image bytes with auth in RN context
        const headers: Record<string, string> = {};
        if (needsAuth) {
          const { data: sd } = await supabase.auth.getSession();
          if (sd.session?.access_token) headers.Authorization = `Bearer ${sd.session.access_token}`;
        }

        const resp = await fetch(fetchUrl, { headers });
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => '');
          let errMsg = `HTTP ${resp.status}`;
          try { const j = JSON.parse(errBody); if (j.error) errMsg = j.error; } catch {}
          if (!cancelled) setError(errMsg);
          return;
        }

        const contentType = resp.headers.get('content-type') || 'image/png';
        const isSvg = contentType.includes('svg');

        if (isSvg) {
          // SVG: fetch as text, embed directly — no blob/base64 needed
          const svgText = await resp.text();
          if (!cancelled) setDataUri('SVG:' + svgText);
        } else {
          // Raster (PNG/JPEG/WebP): convert to base64 data URI
          const blob = await resp.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') resolve(reader.result);
              else reject(new Error('FileReader returned non-string'));
            };
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(blob);
          });
          if (!cancelled) setDataUri(base64);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load image');
      }
    })();
    return () => { cancelled = true; };
  }, [item.file?.token, item.url]);

  if (error) {
    return (
      <View style={s.imagePreview}>
        <Text style={{ fontSize: 13, color: C.inkFaint, textAlign: 'center', padding: 16 }}>{error}</Text>
      </View>
    );
  }
  if (!dataUri) {
    return (
      <View style={s.imagePreview}>
        <View style={[s.imagePreviewImg, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={C.brassLight} />
          <Text style={{ fontSize: 12, color: C.inkFaint, marginTop: 8 }}>Loading image…</Text>
        </View>
      </View>
    );
  }

  const isSvgContent = dataUri.startsWith('SVG:');
  const svgMarkup = isSvgContent ? dataUri.slice(4) : null;

  // SVG: render directly in WebView with the raw SVG markup
  if (isSvgContent && WebView) {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0F1724;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:auto}svg{max-width:100%;height:auto}</style></head><body>${svgMarkup}</body></html>`;
    return (
      <View style={s.imagePreview}>
        {item.title ? <Text style={s.imagePreviewTitle}>{item.title}</Text> : null}
        <WebView
          style={[s.imagePreviewImg, { height: 400 }]}
          originWhitelist={['*']}
          source={{ html }}
          scrollEnabled={true}
          javaScriptEnabled={false}
          onError={() => setError('Failed to render SVG')}
        />
      </View>
    );
  }

  // Raster image: use WebView with base64 data URI, or fallback to RN Image
  if (WebView) {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#0F1724;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${dataUri}" /></body></html>`;
    return (
      <View style={s.imagePreview}>
        {item.title ? <Text style={s.imagePreviewTitle}>{item.title}</Text> : null}
        <WebView
          style={s.imagePreviewImg}
          originWhitelist={['*']}
          source={{ html }}
          scrollEnabled={false}
          javaScriptEnabled={false}
          onError={() => setError('Failed to render image')}
        />
      </View>
    );
  }

  // Last fallback: plain RN Image (JPEG/PNG only, no SVG)
  const { Image: RNImage } = require('react-native');
  return (
    <View style={s.imagePreview}>
      {item.title ? <Text style={s.imagePreviewTitle}>{item.title}</Text> : null}
      <RNImage
        source={{ uri: dataUri }}
        style={s.imagePreviewImg}
        resizeMode="contain"
        onError={(e: any) => setError(e?.nativeEvent?.error || 'Cannot display this format')}
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
  const [micStatus, setMicStatus] = useState<'starting' | 'listening' | 'hearing'>('starting');
  const [handsFree, setHandsFree] = useState(false);
  const [interim, setInterim] = useState<string | null>(null);
  const [voicePhase, setVoicePhase] = useState<'listening' | 'thinking' | 'speaking'>('listening');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ token: string; name: string; size?: number; mimeType?: string; uri?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speechLang, setSpeechLangState] = useState('en-US');
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const voiceAlternativesRef = useRef<string[]>([]);

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
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'ask' | 'image'>('ask');
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

  // Load conversations — match web: reset on a new day so Jenny always opens clean
  useEffect(() => {
    if (!userId) return;
    const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;
    loadStore(userId).then(async store => {
      const today = new Date().toDateString();
      let savedDay: string | null = null;
      try { savedDay = await AsyncStorageMod.getItem('janelle.activeDay'); } catch {}
      if (savedDay && savedDay !== today) {
        // New day — start fresh (match web's forToday), keep agent choices only
        const first = newConversation();
        setConversations([first]);
        setActiveId(first.id);
        AsyncStorageMod.setItem('janelle.activeDay', today).catch(() => {});
      } else if (store.conversations.length) {
        setConversations(store.conversations);
        setActiveId(store.activeId || store.conversations[0].id);
        if (!savedDay) AsyncStorageMod.setItem('janelle.activeDay', today).catch(() => {});
      } else {
        const first = newConversation();
        setConversations([first]);
        setActiveId(first.id);
        AsyncStorageMod.setItem('janelle.activeDay', today).catch(() => {});
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
      // Persist today marker for day-reset logic
      const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;
      AsyncStorageMod.setItem('janelle.activeDay', new Date().toDateString()).catch(() => {});
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [userId, conversations, activeId, loaded]);

  // Load briefing with timeout — once per calendar day, re-checks on foreground
  const briefingFetched = useRef(false);
  /** Cached briefing reused across new conversations while fresh (matching web's 15-min TTL). */
  const briefingCacheRef = useRef<{ day: string; hour: number; at: number; data: Briefing } | null>(null);
  const BRIEFING_TTL_MS = 15 * 60_000;
  const fetchBriefing = useCallback((isRefresh = false) => {
    const today = new Date().toDateString();
    const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;
    if (!isRefresh) setBriefingLoading(true);
    AsyncStorageMod.getItem('janelle.briefedOn').then((last: string | null) => {
      if (last === today) { setBriefingLoading(false); briefingFetched.current = true; return; }
      const timeout = setTimeout(() => setBriefingLoading(false), 8000);
      const hour = new Date().getHours();
      api<Briefing & { more?: number }>(`${ENDPOINTS.ASSISTANT_BRIEFING}?hour=${hour}`)
        .then(data => {
          if (data?.lead) {
            const briefingData = { lead: data.lead, items: data.items || [], suggestions: data.suggestions || [] };
            setBriefing(briefingData);
            setSuggestions(data.suggestions || []);
            // Cache for reuse by new conversations (matching web)
            briefingCacheRef.current = { day: today, hour, at: Date.now(), data: briefingData };
            const briefingMsg: ChatMessage = { id: 'briefing', role: 'assistant' as const, content: data.lead, timestamp: Date.now(), isBriefing: true };
            setConversations(prev => {
              // If active conversation is empty, inject briefing there
              const activeCov = prev.find(c => c.id === activeId);
              if (activeCov && activeCov.messages.length === 0) {
                return prev.map(c => c.id !== activeId ? c : { ...c, updatedAt: Date.now(), messages: [briefingMsg] });
              }
              // Otherwise create a new conversation for today's briefing
              const fresh = newConversation();
              fresh.messages = [briefingMsg];
              fresh.updatedAt = Date.now();
              setActiveId(fresh.id);
              return [fresh, ...prev];
            });
            AsyncStorageMod.setItem('janelle.briefedOn', today).catch(() => {});
          }
        })
        .catch(() => {})
        .finally(() => { clearTimeout(timeout); setBriefingLoading(false); briefingFetched.current = true; });
    }).catch(() => setBriefingLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    fetchBriefing();
    // Load studio vocabulary for voice disambiguation (matches web)
    api<{ words: string[] }>(ENDPOINTS.ASSISTANT_VOCABULARY)
      .then(data => { if (data?.words?.length) setVocabulary(data.words); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check briefing when app returns to foreground on a new day
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && briefingFetched.current) {
        const today = new Date().toDateString();
        const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;
        AsyncStorageMod.getItem('janelle.briefedOn').then((last: string | null) => {
          if (last !== today) fetchBriefing(true);
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [fetchBriefing]);

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

  // Match web: auto check-in after 4pm, once per day, poll every 5 minutes — inline, silent when empty
  const checkedInRef = useRef<string | null>(null);
  const checkedInLoaded = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;
    AsyncStorageMod.getItem('janelle.checkedInOn').then((v: string | null) => { checkedInRef.current = v; checkedInLoaded.current = true; }).catch(() => { checkedInLoaded.current = true; });
    const tick = () => {
      if (!checkedInLoaded.current) return;
      const today = new Date().toDateString();
      if (new Date().getHours() < 16 || checkedInRef.current === today) return;
      checkedInRef.current = today;
      AsyncStorageMod.setItem('janelle.checkedInOn', today).catch(() => {});
      api<{ answer?: StructuredAnswer; tasks?: CheckinTask[] } | null>(`${ENDPOINTS.ASSISTANT_CHECKIN}?hour=${new Date().getHours()}`)
        .then(view => {
          if (view?.tasks?.length) {
            updateActive(msgs => [...msgs, {
              id: `ci-${Date.now()}`, role: 'assistant' as const, content: view.answer?.lead || 'Time to check in.',
              timestamp: Date.now(), kind: 'checkin' as const, answer: view.answer, checkin: view.tasks,
            }]);
          }
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 5 * 60_000);
    return () => clearInterval(timer);
  }, [userId, updateActive]);

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
      if (Tts) Tts.stop();
    } catch {}
  };

  const listenText = async (id: string, text: string) => {
    if (!Tts) {
      showAlert('Text-to-Speech', 'Speech is not available on this device.');
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
      await Tts.speak(speakable(text));
    } catch (e) {
      setSpeakingId(null);
    }
  };

  const startListening = async () => {
    if (!Voice) {
      showAlert('Voice input', 'Voice recognition is not available on this device.');
      return;
    }
    try {
      // Request mic permission on Android
      if (Platform.OS === 'android') {
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showAlert('Microphone', 'Microphone permission is required for voice input.');
          return;
        }
      }
      setListening(true);
      setMicStatus('starting');
      setInterim(null);
      Voice.onSpeechStart = () => setMicStatus('listening');
      Voice.onSpeechPartialResults = (e: { value?: string[] }) => {
        if (e.value?.[0]) { setInput(e.value[0]); setInterim(e.value[0]); setMicStatus('hearing'); }
      };
      Voice.onSpeechResults = (e: { value?: string[] }) => {
        if (e.value?.[0]) {
          // Echo detection: skip if mic picked up the speaker
          if (soundsLikeEcho(e.value[0])) { setInterim(null); return; }
          setInput(e.value[0]);
          // Store all alternatives for API disambiguation (matches web)
          voiceAlternativesRef.current = (e.value ?? []).slice(0, 5);
          // In hands-free mode, auto-send when speech ends
          if (handsFree && e.value[0].trim()) {
            setVoicePhase('thinking');
            setTimeout(() => sendMessageRef.current(e.value![0]), 300);
          }
        }
        setMicStatus('listening');
        setInterim(null);
      };
      Voice.onSpeechEnd = () => {
        setListening(false);
        // In hands-free mode, restart listening after response
        // (handled by the effect below)
      };
      Voice.onSpeechError = () => { setListening(false); setInterim(null); };
      await Voice.start(speechLang);
    } catch (e) {
      showAlert('Voice input', 'Voice recognition is not available on this device.');
      setListening(false);
    }
  };

  const stopListening = async () => {
    try { await Voice?.stop(); } catch {}
    setListening(false);
    setInterim(null);
  };

  // Hands-free: send interim text immediately
  const doneTalking = () => {
    if (interim?.trim()) {
      stopListening();
      setVoicePhase('thinking');
      sendMessageRef.current(interim);
    }
  };

  // Hands-free: after assistant responds, speak it and restart listening
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const spokenMsgRef = useRef<string | null>(null);

  // Echo detection: track what was last spoken so mic doesn't repeat it
  const lastSpokenRef = useRef<{ text: string; endedAt: number | null }>({ text: '', endedAt: null });
  const soundsLikeEcho = (heard: string): boolean => {
    const { text, endedAt } = lastSpokenRef.current;
    if (!text) return false;
    if (endedAt !== null && Date.now() - endedAt > 2500) return false;
    const wordsOf = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
    const pairs = (words: string[]) => words.slice(1).map((w, i) => `${words[i]} ${w}`);
    const heardPairs = pairs(wordsOf(heard));
    if (heardPairs.length < 3) return false;
    const saidPairs = new Set(pairs(wordsOf(text)));
    return heardPairs.filter(p => saidPairs.has(p)).length / heardPairs.length >= 0.85;
  };

  useEffect(() => {
    if (!handsFree || sending || voicePhase !== 'thinking') return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    // Don't speak the same message twice
    if (last.id === spokenMsgRef.current) return;
    const speakText = last.answer?.speech || last.answer?.lead || last.content;
    if (!speakText) return;

    spokenMsgRef.current = last.id;
    setVoicePhase('speaking');

    (async () => {
      if (Tts) {
        lastSpokenRef.current = { text: speakText, endedAt: null };
        try { await Tts.speak(speakable(speakText)); } catch {}
        lastSpokenRef.current.endedAt = Date.now();
      }
      // After speaking, restart listening if still in hands-free
      if (handsFreeRef.current) {
        setVoicePhase('listening');
        if (Voice) {
          try {
            setListening(true);
            setMicStatus('starting');
            setInterim(null);
            await Voice.start(speechLang);
          } catch { setListening(false); }
        }
      }
    })();
  }, [handsFree, sending, voicePhase, messages.length, speechLang]);

  // Match web: speakReplies — auto-speak every reply even outside hands-free mode
  const speakRepliesRef = useRef(speakReplies);
  speakRepliesRef.current = speakReplies;
  useEffect(() => {
    if (handsFree || sending) return; // hands-free handles its own speaking
    if (!speakReplies || !Tts) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (last.id === spokenMsgRef.current) return;
    const text = last.answer?.speech || last.answer?.lead || last.content;
    if (!text) return;
    spokenMsgRef.current = last.id;
    Tts.speak(speakable(text));
  }, [handsFree, sending, speakReplies, messages.length]);

  // Turn off hands-free mode cleanly
  const endHandsFree = () => {
    setHandsFree(false);
    setVoicePhase('listening');
    setInterim(null);
    stopListening();
    if (Tts) try { Tts.stop(); } catch {}
  };

  const pickFile = async () => {
    if (!DocumentPicker?.pick) {
      showAlert('Not available', 'File picker is not available on this device.');
      return;
    }
    try {
      const [result] = await DocumentPicker.pick({
        mode: 'open',
        type: ['application/pdf', 'image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', 'text/plain'],
      });
      if (!result) return;
      setUploading(true);
      const resp = await fetch(result.uri);
      const blob = await resp.blob();
      const uploaded = await apiUpload<{ token: string }>(ENDPOINTS.ASSISTANT_UPLOAD, blob);
      const isImage = (result.type || '').startsWith('image/');
      setAttachedFiles(prev => [...prev, {
        token: uploaded.token,
        name: result.name || 'file',
        size: result.size || blob.size,
        mimeType: result.type || blob.type,
        uri: isImage ? result.uri : undefined,
      }]);
    } catch (err) {
      if (!DocumentPicker.isCancel?.(err)) {
        showAlert('Upload failed', (err as Error).message);
      }
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (token: string) => {
    setAttachedFiles(prev => prev.filter(f => f.token !== token));
    // Match web: tell the server to forget the unused upload
    api('/assistant/uploads/forget', { method: 'POST', body: JSON.stringify({ tokens: [token] }) }).catch(() => {});
  };

  const imagineRequest = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now(), made: 'image' };
    updateActive(msgs => [...msgs, userMsg]);
    setInput('');
    setSending(true);
    setSuggestions([]);
    setStatusMsg('Drawing it…');
    setComposeMode('ask');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const bodyPayload: Record<string, unknown> = { kind: 'image', prompt: trimmed };
      if (attachedFiles.length) {
        bodyPayload.attachments = attachedFiles.map(f => ({ token: f.token }));
        setAttachedFiles([]);
      }
      const data = await api<{ answer: { lead: string; items: AnswerItem[]; speech?: string; sources: string[]; suggestions?: string[]; caveat?: string; more?: number }; startedJobs?: string[] }>(
        ENDPOINTS.ASSISTANT_IMAGINE,
        { method: 'POST', body: JSON.stringify(bodyPayload), signal: controller.signal },
      );
      const answer: StructuredAnswer = {
        lead: data.answer.lead || '',
        items: data.answer.items || [],
        speech: data.answer.speech,
        sources: data.answer.sources,
        suggestions: data.answer.suggestions,
        caveat: data.answer.caveat,
        more: data.answer.more,
      };
      const msgId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: msgId, role: 'assistant',
        content: data.answer.lead || '',
        timestamp: Date.now(),
        answer,
        ...(data.startedJobs?.length ? { jobs: data.startedJobs } : {}),
      };
      updateActive(msgs => [...msgs, assistantMsg]);
      if (data.answer.suggestions?.length) setSuggestions(data.answer.suggestions);

      // Release sending so user can type while image renders
      setSending(false);
      setStatusMsg(null);
      setAbortController(null);

      // Poll for async jobs (image/video generation) — same as web
      if (data.startedJobs?.length) {
        const remainingJobs = new Set(data.startedJobs);
        const settleJob = (jobId: string, item: AnswerItem | null, failure: string | null) => {
          remainingJobs.delete(jobId);
          updateActive(msgs => msgs.map(m => {
            if (m.id !== msgId || !m.jobs?.includes(jobId)) return m;
            const left = m.jobs.filter(j => j !== jobId);
            return {
              ...m,
              jobs: left.length ? left : undefined,
              answer: m.answer
                ? { ...m.answer, items: item ? [...m.answer.items, item] : m.answer.items, caveat: failure ?? m.answer.caveat }
                : m.answer,
            };
          }));
        };
        const poll = async () => {
          let attempts = 0;
          while (remainingJobs.size > 0 && attempts < 60 && !controller.signal.aborted) {
            await new Promise<void>(r => setTimeout(r, 5000));
            if (controller.signal.aborted) return;
            for (const jobId of [...remainingJobs]) {
              try {
                const job = await api<{ status: string; item?: AnswerItem; error?: string }>(
                  `${ENDPOINTS.ASSISTANT_MEDIA}/${jobId}`,
                );
                if (job.status === 'done' && job.item) settleJob(jobId, job.item, null);
                else if (job.status !== 'pending') settleJob(jobId, null, job.error || 'The image could not be made.');
              } catch {}
            }
            attempts++;
          }
        };
        poll().catch(() => {});
      }
      return; // skip the finally block's setSending
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const imgFiles = attachedFiles.length ? attachedFiles.map(f => ({ name: f.name, token: f.token })) : undefined;
        updateActive(msgs => [...msgs, {
          id: `e-${Date.now()}`, role: 'assistant', content: (err as Error).message || 'That could not be made.',
          timestamp: Date.now(), kind: 'error' as const,
          retry: trimmed, retryKind: 'image' as const,
          ...(imgFiles ? { retryFiles: imgFiles } : {}),
        }]);
      }
    }
    setSending(false);
    setStatusMsg(null);
    setAbortController(null);
  }, [sending, updateActive, attachedFiles]);

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
    if (composeMode === 'image') return imagineRequest(text);
    const trimmed = text.trim();
    const currentFiles = [...attachedFiles];

    // Match web: allow file-only sends with auto-generated message
    if (!trimmed && !currentFiles.length) return;
    if (sending) return;

    // Match web: intercept check-in and digest prompts to avoid a model turn
    if (!currentFiles.length && trimmed) {
      const asked = trimmed.replace(/[.!?]+$/, '').toLowerCase();
      if (asked === 'do my end-of-day check-in') {
        const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() };
        updateActive(msgs => [...msgs, userMsg]);
        setInput('');
        setSending(true);
        setStatusMsg('Loading check-in…');
        api<{ answer?: StructuredAnswer; tasks?: CheckinTask[] } | null>(`${ENDPOINTS.ASSISTANT_CHECKIN}?hour=${new Date().getHours()}`)
          .then(view => {
            if (!view || !view.tasks?.length) {
              const lead = 'Nothing to check in about today — nothing of yours was due, and nothing is blocked. Have a good evening.';
              updateActive(msgs => [...msgs, { id: `a-${Date.now()}`, role: 'assistant', content: lead, timestamp: Date.now(), answer: { lead, items: [], more: 0, speech: lead, sources: [], suggestions: [] } }]);
            } else {
              updateActive(msgs => [...msgs, {
                id: `ci-${Date.now()}`, role: 'assistant', content: view.answer?.lead || 'How did today go?',
                timestamp: Date.now(), kind: 'checkin' as const, answer: view.answer, checkin: view.tasks,
              }]);
            }
          })
          .catch(err => {
            updateActive(msgs => [...msgs, { id: `e-${Date.now()}`, role: 'assistant', content: (err as Error).message, timestamp: Date.now(), kind: 'error' as const, retry: trimmed }]);
          })
          .finally(() => { setSending(false); setStatusMsg(null); });
        return;
      }
      if (asked === "read me this morning's digest") {
        const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() };
        updateActive(msgs => [...msgs, userMsg]);
        setInput('');
        setSending(true);
        setStatusMsg('Loading digest…');
        try {
          const digest = await api<StructuredAnswer | null>('/assistant/digest');
          if (digest) {
            updateActive(msgs => [...msgs, { id: `a-${Date.now()}`, role: 'assistant', content: digest.lead, timestamp: Date.now(), answer: digest, isBriefing: true }]);
          } else {
            updateActive(msgs => [...msgs, { id: `a-${Date.now()}`, role: 'assistant', content: 'No digest is available yet today.', timestamp: Date.now() }]);
          }
        } catch (err) {
          updateActive(msgs => [...msgs, { id: `e-${Date.now()}`, role: 'assistant', content: `Sorry: ${(err as Error).message}`, timestamp: Date.now() }]);
        } finally { setSending(false); setStatusMsg(null); }
        return;
      }
    }

    // Match web: file-only sends auto-generate a message
    const message = trimmed || (currentFiles.length === 1 ? `Take a look at ${currentFiles[0].name}.` : `Take a look at these ${currentFiles.length} files.`);

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: message, timestamp: Date.now() };
    updateActive(msgs => [...msgs, userMsg]);
    setInput('');
    setSending(true);
    setSuggestions([]);
    setStatusMsg('Thinking...');

    const controller = new AbortController();
    setAbortController(controller);

    if (currentFiles.length) setAttachedFiles([]);

    try {
      // Match web: 8 messages, embed proposal states, filter errors
      // Include files from each message (not just currently attached)
      const history = messages
        .filter(m => m.kind !== 'error')
        .slice(-8)
        .map(m => {
          const fileNames = (m as any).files?.length ? `\n[Attached: ${(m as any).files.map((f: any) => f.name).join(', ')}]` : '';
          if (!m.proposed?.length) return { role: m.role, content: `${m.content}${fileNames}`.trim() || '[Attached a file]' };
          const states = m.proposed.map(p => {
            if (p.status === 'saved') return `[Saved — the person confirmed it: ${p.summary}]`;
            if (p.status === 'dismissed') return `[Not saved — the person turned it down: ${p.summary}]`;
            return `[NOT saved yet — waiting for the person to confirm: ${p.summary}]`;
          });
          return { role: m.role, content: `${m.content}\n\n${states.join('\n')}` };
        });
      // Match web: send pending proposals as { key, tool, summary, input }
      const pending = messages
        .flatMap(m => (m.proposed ?? []).filter(p => p.status === 'waiting').map(p => ({ key: p.key, tool: p.tool, summary: p.summary, input: p.input })))
        .slice(-5);
      // Match web: send recent file tokens from both user uploads and answers
      const fileTokens: string[] = [];
      for (const m of messages.slice(-12)) {
        const handed = [...((m as any).files ?? []).map((f: any) => f.token), ...(m.answer?.items ?? []).map((item: any) => item.file?.token)];
        for (const token of handed) {
          if (!token) continue;
          const at = fileTokens.indexOf(token);
          if (at >= 0) fileTokens.splice(at, 1);
          fileTokens.push(token);
        }
      }
      const body: Record<string, unknown> = { message, history, page: { path: '/assistant' }, pending };
      if (fileTokens.length) body.files = fileTokens.slice(-8).map(token => ({ token }));
      if (agents.length) body.agents = agents;
      if (currentFiles.length) {
        body.attachments = currentFiles.map(f => ({ token: f.token }));
      }
      // Match web: send voice recognition alternatives for disambiguation
      if (voiceAlternativesRef.current.length > 1) {
        body.spoken = { alternatives: voiceAlternativesRef.current };
        voiceAlternativesRef.current = [];
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

      // Match web: handle settled proposals (verbal "yes" confirming earlier proposals)
      if ((r as any).settled?.length) {
        const settled = (r as any).settled as Array<{ key: string; decision: 'confirmed' | 'cancelled' }>;
        updateActive(msgs => msgs.map(m => {
          const mine = settled.filter(x => x.key.startsWith(`${m.id}-`));
          if (!mine.length) return m;
          return {
            ...m,
            proposed: m.proposed?.map(p => {
              const s = mine.find(x => x.key === p.key);
              if (!s) return p;
              return { ...p, status: (s.decision === 'confirmed' ? 'saved' : 'dismissed') as 'saved' | 'dismissed' };
            }),
          };
        }));
      }

      const answer: StructuredAnswer | undefined = r.answer
        ? { lead: r.answer.lead || '', items: r.answer.items || [], speech: r.answer.speech, suggestions: r.answer.suggestions, sources: r.answer.sources, caveat: r.answer.caveat, more: r.answer.more, document: r.answer.document, documentTitle: r.answer.documentTitle }
        : undefined;
      const msgId = `a-${Date.now()}`;
      const jobs = (r as any).startedJobs as string[] | undefined;
      const assistantMsg: ChatMessage = {
        id: msgId, role: 'assistant',
        content: r.reply || r.answer?.lead || '',
        timestamp: Date.now(),
        proposed: r.proposed?.map(p => ({ ...p, status: 'waiting' as const })),
        answer,
        ...(jobs?.length ? { jobs } : {}),
      };
      updateActive(msgs => [...msgs, assistantMsg]);
      if (r.answer?.suggestions?.length) setSuggestions(r.answer.suggestions);

      // Poll for async jobs (image/video generation) — same as web
      if (jobs?.length) {
        const remainingJobs = new Set(jobs);
        const settleJob = (jobId: string, item: AnswerItem | null, failure: string | null) => {
          remainingJobs.delete(jobId);
          updateActive(msgs => msgs.map(m => {
            if (m.id !== msgId || !m.jobs?.includes(jobId)) return m;
            const left = m.jobs.filter(j => j !== jobId);
            return {
              ...m,
              jobs: left.length ? left : undefined,
              answer: m.answer
                ? { ...m.answer, items: item ? [...m.answer.items, item] : m.answer.items, caveat: failure ?? m.answer.caveat }
                : m.answer,
            };
          }));
        };
        const poll = async () => {
          let attempts = 0;
          while (remainingJobs.size > 0 && attempts < 60 && !controller.signal.aborted) {
            await new Promise<void>(resolve => setTimeout(resolve, 5000));
            if (controller.signal.aborted) return;
            for (const jobId of [...remainingJobs]) {
              try {
                const job = await api<{ status: string; item?: AnswerItem; error?: string }>(
                  `${ENDPOINTS.ASSISTANT_MEDIA}/${jobId}`,
                );
                if (job.status === 'done' && job.item) settleJob(jobId, job.item, null);
                else if (job.status !== 'pending') settleJob(jobId, null, job.error || 'The image could not be made.');
              } catch {}
            }
            attempts++;
          }
        };
        poll().catch(() => {});
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errFiles = currentFiles.length ? currentFiles.map(f => ({ name: f.name, token: f.token })) : undefined;
        updateActive(msgs => [...msgs, {
          id: `e-${Date.now()}`, role: 'assistant',
          content: (err as Error).message || 'Something went wrong',
          timestamp: Date.now(), kind: 'error' as const,
          retry: message, ...(errFiles ? { retryFiles: errFiles } : {}),
        }]);
      }
    } finally { setSending(false); setStatusMsg(null); setAbortController(null); }
  }, [messages, sending, updateActive, agents, attachedFiles, composeMode, imagineRequest]);

  // Keep a ref to the latest sendMessage so voice callbacks never go stale
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Edit & re-ask a user message
  const editMessage = (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.role !== 'user') return;
    setEditingId(msgId);
    setEditText(msg.content);
  };

  const submitEdit = () => {
    if (!editingId || !editText.trim()) { setEditingId(null); return; }
    const original = messages.find(m => m.id === editingId);
    // Match web: the files it carried go again — the edit is to the words
    const originalFiles = (original?.files ?? []).map(f => ({ token: f.token, name: f.name }));
    if (originalFiles.length) setAttachedFiles(originalFiles);
    // Remove this message and everything after, then re-send
    updateActive(msgs => {
      const idx = msgs.findIndex(m => m.id === editingId);
      return idx >= 0 ? msgs.slice(0, idx) : msgs;
    });
    setEditingId(null);
    // Match web: if the original was made in image mode, re-imagine instead of asking
    // Defer to next tick so React flushes the sliced messages before sendMessage reads them
    const text = editText;
    const made = original?.made;
    setTimeout(() => {
      if (made) imagineRequest(text);
      else sendMessageRef.current(text);
    }, 0);
  };

  const confirmProposal = useCallback(async (messageId: string, proposalKey: string) => {
    const proposal = messages.find(m => m.id === messageId)?.proposed?.find(p => p.key === proposalKey);
    if (!proposal) return;
    updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'saving' as const } : p) }));
    try {
      const saved = await api<Record<string, any>>(ENDPOINTS.ASSISTANT_CONFIRM, { method: 'POST', body: JSON.stringify({ key: proposal.key, tool: proposal.tool, input: proposal.input }) });
      updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'saved' as const, result: { label: saved?.label } } : p) }));
      // Match web: append acknowledgement message so the conversation records what was saved
      if (saved) {
        const isDraft = proposal.tool === 'propose_draft';
        const isUpdate = proposal.tool === 'propose_task_update';
        const dueStr = saved.due_date
          ? new Date(`${saved.due_date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
          : null;
        let lead: string;
        let ackItems: AnswerItem[];
        if (isDraft) {
          lead = `Saved to Drafts${saved.to ? ` — ready to send to ${saved.to}` : ''}.`;
          ackItems = [{ kind: 'draft', id: saved.id, title: saved.subject || proposal.summary, tone: 'good' }];
        } else if (isUpdate) {
          lead = `Updated${saved.assignee ? ` — it's with ${saved.assignee}` : ''}${dueStr ? `, due ${dueStr}` : ''}.`;
          ackItems = [{ kind: 'task', id: saved.id, title: saved.title || proposal.summary, tone: 'good', fields: [{ label: 'Owner', value: saved.assignee ?? 'Unassigned' }, { label: 'Due', value: dueStr ?? '—' }, { label: 'Status', value: (saved.status || '').replace(/_/g, ' ') }] }];
        } else {
          lead = `Done — it's on the task board${saved.assignee ? ` for ${saved.assignee}` : ''}${dueStr ? `, due ${dueStr}` : ''}.`;
          ackItems = [{ kind: 'task', id: saved.id, title: saved.title || proposal.summary, tone: 'good', fields: [{ label: 'Owner', value: saved.assignee ?? 'Unassigned' }, { label: 'Project', value: saved.project ?? '—' }, { label: 'Due', value: dueStr ?? '—' }] }];
        }
        const ackAnswer: StructuredAnswer = { lead, items: ackItems, speech: lead, sources: [], suggestions: [] };
        updateActive(msgs => [...msgs, { id: `ack-${Date.now()}`, role: 'assistant', content: lead, timestamp: Date.now(), answer: ackAnswer }]);
      }
    } catch (err) {
      updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'dismissed' as const, result: { label: (err as Error).message } } : p) }));
    }
  }, [messages, updateActive]);

  const dismissProposal = useCallback((messageId: string, proposalKey: string) => {
    updateActive(msgs => msgs.map(m => m.id !== messageId ? m : { ...m, proposed: m.proposed?.map(p => p.key === proposalKey ? { ...p, status: 'dismissed' as const } : p) }));
  }, [updateActive]);

  // ── Conversation management ──
  const handleNewConversation = () => {
    // Match web: abort pending, stop speaking
    abortController?.abort();
    setAbortController(null);
    setSending(false);
    setStatusMsg(null);
    if (Tts) try { Tts.stop(); } catch {}

    const c = newConversation();
    setConversations(prev => [c, ...prev]);
    setActiveId(c.id);
    setSuggestions([]);
    setComposeMode('ask');
    // Match web: every new conversation opens with the briefing
    const now = new Date();
    const today = now.toDateString();
    const cached = briefingCacheRef.current;
    if (cached && cached.day === today && cached.hour === now.getHours() && Date.now() - cached.at < BRIEFING_TTL_MS) {
      // Reuse cached briefing
      const briefingMsg: ChatMessage = { id: 'briefing', role: 'assistant', content: cached.data.lead, timestamp: Date.now(), isBriefing: true };
      setBriefing(cached.data);
      setSuggestions(cached.data.suggestions || []);
      setConversations(prev => prev.map(cv => cv.id !== c.id ? cv : { ...cv, updatedAt: Date.now(), messages: [briefingMsg] }));
    } else {
      // Fetch fresh briefing for this conversation
      api<Briefing & { more?: number }>(`${ENDPOINTS.ASSISTANT_BRIEFING}?hour=${now.getHours()}`)
        .then(data => {
          if (data?.lead) {
            briefingCacheRef.current = { day: today, hour: now.getHours(), at: Date.now(), data: { lead: data.lead, items: data.items || [], suggestions: data.suggestions || [] } };
            setBriefing({ lead: data.lead, items: data.items || [], suggestions: data.suggestions || [] });
            setSuggestions(data.suggestions || []);
            const briefingMsg: ChatMessage = { id: 'briefing', role: 'assistant', content: data.lead, timestamp: Date.now(), isBriefing: true };
            setConversations(prev => prev.map(cv => cv.id !== c.id ? cv : { ...cv, updatedAt: Date.now(), messages: [briefingMsg] }));
          }
        })
        .catch(() => {});
    }
  };
  const handleSelectConversation = (id: string) => {
    if (id === activeId) return;
    // Match web: abort pending, stop speaking
    abortController?.abort();
    setAbortController(null);
    setSending(false);
    setStatusMsg(null);
    if (Tts) try { Tts.stop(); } catch {}
    // Match web: remove empty conversation when switching away from it
    setConversations(prev => {
      const leaving = prev.find(c => c.id === activeId);
      return leaving && leaving.messages.length === 0 ? prev.filter(c => c.id !== activeId) : prev;
    });
    setActiveId(id);
    setSuggestions([]);
  };
  const handlePinConversation = (id: string) => { setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c)); };
  const handleRenameConversation = (id: string, title: string) => {
    // Match web: sanitize whitespace, cap at 80 chars, null if empty
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80) || null;
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: clean } : c));
  };
  const handleDeleteConversation = (id: string) => {
    // Match web: abort if deleting active, stop speaking
    if (id === activeId) {
      abortController?.abort();
      setAbortController(null);
      setSending(false);
      setStatusMsg(null);
      if (Tts) try { Tts.stop(); } catch {}
    }
    // Match web: delete attached files from storage
    const doomed = conversations.find(c => c.id === id);
    if (doomed) {
      const tokens = doomed.messages.flatMap(m => ((m as any).files ?? []).map((f: any) => f.token));
      if (tokens.length) {
        api('/assistant/uploads/forget', { method: 'POST', body: JSON.stringify({ tokens }) }).catch(() => {});
      }
    }
    setConversations(prev => {
      const f = prev.filter(c => c.id !== id);
      if (id === activeId) { if (f.length) setActiveId(f[0].id); else { const c = newConversation(); f.push(c); setActiveId(c.id); } }
      return f;
    });
  };

  // ── Renderers ──
  const MessageFooter = ({ item }: { item: ChatMessage }) => {
    const speakText = item.answer?.speech || item.answer?.lead || item.content;
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

  // ── Inline check-in (matches web's CheckinAnswerView) ──
  const [checkinBusy, setCheckinBusy] = useState<string | null>(null);
  const [checkinAsking, setCheckinAsking] = useState<string | null>(null);
  const [checkinWhy, setCheckinWhy] = useState('');

  const recordCheckinOutcome = async (messageId: string, task: CheckinTask, outcome: CheckinOutcome, note?: string) => {
    setCheckinBusy(task.id);
    try {
      await api(ENDPOINTS.ASSISTANT_CHECKIN, { method: 'POST', body: JSON.stringify({ task_id: task.id, outcome, note: note?.trim() || null }) });
      updateActive(msgs => msgs.map(m =>
        m.id !== messageId || !m.checkin ? m
          : { ...m, checkin: m.checkin.map(t => t.id === task.id ? { ...t, outcome, outcomeNote: note?.trim() || null } : t) },
      ));
      setCheckinAsking(null);
      setCheckinWhy('');
    } catch (err) {
      showAlert('Error', (err as Error).message);
    } finally { setCheckinBusy(null); }
  };

  const renderCheckinTasks = (message: ChatMessage) => {
    const tasks = message.checkin ?? [];
    if (!tasks.length) return null;
    const OUTCOME_LABEL: Record<string, string> = { done: 'Done', blocked: 'Blocked', tomorrow: 'Rolls to tomorrow' };
    const OUTCOME_COLOR: Record<string, string> = { done: C.good, blocked: C.crit, tomorrow: C.warn };
    const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

    const groups: { key: string; label: string; hint?: string }[] = [
      { key: 'open', label: 'Still open', hint: 'Done, blocked, or tomorrow?' },
      { key: 'blocked', label: 'Blocked', hint: 'Still stuck?' },
      { key: 'tomorrow', label: 'Due tomorrow' },
      { key: 'done', label: 'Finished today' },
    ];

    return (
      <View style={{ marginTop: 12, gap: 10 }}>
        {groups.map(g => {
          const rows = tasks.filter(t => (t.bucket || 'open') === g.key);
          if (!rows.length) return null;
          return (
            <View key={g.key}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: C.inkFaint, textTransform: 'uppercase' }}>{g.label} ({rows.length})</Text>
                {g.hint && <Text style={{ fontSize: 11.5, color: C.inkFaint }}>{g.hint}</Text>}
              </View>
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' }}>
                {rows.map((t, ti) => {
                  const meta = [t.project, t.due ? `due ${shortDay(t.due)}` : null].filter(Boolean).join(' · ');
                  const settled = t.outcome ?? null;
                  const isAsking = checkinAsking === t.id;
                  return (
                    <View key={t.id} style={[{ paddingHorizontal: 14, paddingVertical: 10 }, ti > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
                      <Pressable onPress={() => setDataPage('tasks')}>
                        <Text style={[{ fontSize: 13.5, fontWeight: '600', color: C.ink, lineHeight: 20, textDecorationLine: 'underline' }, (settled === 'done' || g.key === 'done') && { textDecorationLine: 'line-through', color: C.inkSoft }]}>{t.title}</Text>
                      </Pressable>
                      {meta ? <Text style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>{meta}</Text> : null}
                      {t.note && !settled && <Text style={{ fontSize: 12, color: C.inkSoft, marginTop: 4, borderLeftWidth: 2, borderLeftColor: C.crit + '99', paddingLeft: 8 }}>{t.note}</Text>}
                      {settled && t.outcomeNote ? <Text style={{ fontSize: 12, color: C.inkSoft, marginTop: 4, borderLeftWidth: 2, borderLeftColor: C.brass + '99', paddingLeft: 8 }}>{t.outcomeNote}</Text> : null}
                      {g.key === 'done' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                          <Icon name="checkmark-circle" size={14} color={C.good} />
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.good }}>Done</Text>
                        </View>
                      ) : settled ? (
                        <View style={{ marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: (OUTCOME_COLOR[settled] || C.inkFaint) + '1A' }}>
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: OUTCOME_COLOR[settled] || C.inkFaint }}>{OUTCOME_LABEL[settled] || settled}</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.sunk }} disabled={checkinBusy === t.id} onPress={() => recordCheckinOutcome(message.id, t, 'done')}>
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: C.inkSoft }}>Done</Text>
                          </Pressable>
                          <Pressable style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.sunk }, isAsking && { borderColor: C.crit + '80' }]} disabled={checkinBusy === t.id} onPress={() => { setCheckinAsking(isAsking ? null : t.id); setCheckinWhy(''); }}>
                            <Text style={[{ fontSize: 12.5, fontWeight: '600', color: C.inkSoft }, isAsking && { color: C.crit }]}>{g.key === 'blocked' ? 'Still blocked' : 'Blocked'}</Text>
                          </Pressable>
                          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }} disabled={checkinBusy === t.id} onPress={() => recordCheckinOutcome(message.id, t, 'tomorrow')}>
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: C.inkFaint }}>Tomorrow</Text>
                          </Pressable>
                        </View>
                      )}
                      {isAsking && !settled && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
                          <TextInput
                            autoFocus
                            style={{ flex: 1, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.sunk, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: C.ink }}
                            placeholder="What is in the way? Who are you waiting on?"
                            placeholderTextColor={C.inkFaint}
                            value={checkinWhy}
                            onChangeText={setCheckinWhy}
                            multiline
                          />
                          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: C.brass }} disabled={checkinBusy === t.id} onPress={() => recordCheckinOutcome(message.id, t, 'blocked', checkinWhy)}>
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#fff' }}>{checkinBusy === t.id ? 'Saving…' : 'Save'}</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
        {tasks.some(t => !t.outcome && t.bucket !== 'done') && (
          <Text style={{ fontSize: 12.5, color: C.inkFaint }}>Anything not answered stays as it is. Something else in your way? Just say so here.</Text>
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
          const confirmLabel = isDraft ? 'Save to Drafts' : 'Confirm';
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
                  <Text style={{ fontSize: 11.5, color: C.inkFaint }}>or just say "yes"</Text>
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
              <Pressable style={s.userActionBtn} disabled={sending} onPress={() => editMessage(item.id)}>
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
              <View style={[s.assistantContentBubble, isBriefing && s.briefingContentBubble, item.kind === 'error' && s.errorContentBubble]}>
                {isBriefing && <Text style={s.briefingLabel}>YOUR BRIEFING</Text>}
                {item.kind === 'checkin' && <Text style={s.briefingLabel}>END-OF-DAY CHECK-IN</Text>}
                <Text style={[s.messageText, s.assistantText]}>{item.kind === 'error' ? `That didn't work: ${item.content}` : (item.answer?.lead || item.content)}</Text>
                {isBriefing && !item.answer?.items?.length && renderBriefingItems()}
                {item.answer && item.answer.items?.length > 0 && (
                  isBriefing ? renderBriefingFromAnswer(item.answer) : <AnswerItems answer={item.answer} />
                )}
                {item.kind === 'checkin' && item.checkin?.length ? renderCheckinTasks(item) : null}
                {renderProposals(item)}
                {(item.jobs?.length ?? 0) > 0 && (
                  <View style={s.renderingBar}>
                    <Loader dotsOnly message={item.jobs!.length > 1 ? `${item.jobs!.length} clips are rendering` : 'The clip is rendering — it appears here when it is ready.'} />
                  </View>
                )}
              </View>
              {item.kind === 'error' && (
                <Pressable style={s.retryBtn} onPress={() => {
                  updateActive(msgs => msgs.filter(m => m.id !== item.id));
                  if (item.retryKind) {
                    // Re-imagine with original files
                    if (item.retryFiles?.length) setAttachedFiles(item.retryFiles.map(f => ({ token: f.token, name: f.name })));
                    imagineRequest(item.retry || '');
                  } else if (item.retry) {
                    if (item.retryFiles?.length) setAttachedFiles(item.retryFiles.map(f => ({ token: f.token, name: f.name })));
                    sendMessage(item.retry);
                  } else {
                    const lastUser = messages.slice(0, messages.indexOf(item)).reverse().find(m => m.role === 'user');
                    if (lastUser) sendMessage(lastUser.content);
                  }
                }}>
                  <Text style={s.retryBtnText}>{item.retryKind === 'image' ? 'Draw it again' : item.retryKind === 'video' ? 'Make it again' : 'Try again'}</Text>
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
            <Icon name="time-outline" size={14} color={C.inkSoft} />
            <Text style={s.headerChipText}>Conversations</Text>
            {convCount > 0 && (
              <View style={s.headerBadge}>
                <Text style={s.headerBadgeText}>{convCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={[s.headerChip, agents.length > 0 && s.headerChipActive]} onPress={() => setAgentsOpen(true)}>
            <Icon name="people-outline" size={14} color={agents.length > 0 ? C.brassLight : C.inkSoft} />
            <Text style={[s.headerChipText, agents.length > 0 && s.headerChipTextActive]}>Agents</Text>
            {agents.length > 0 && (
              <View style={s.headerBadgeActive}>
                <Text style={s.headerBadgeActiveText}>{agents.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={s.settingsBtn} onPress={() => {
            showAlert('Logout', 'Are you sure you want to logout?', [
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
              const isImage = f.uri || (f.mimeType || '').startsWith('image/');
              const sizeStr = f.size ? (f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(0)} KB` : `${(f.size / 1048576).toFixed(1)} MB`) : '';
              const { Image: RNImage } = require('react-native');
              return (
                <View key={f.token} style={s.attachChip}>
                  {f.uri && isImage ? (
                    <RNImage source={{ uri: f.uri }} style={{ width: 32, height: 32, borderRadius: 4 }} />
                  ) : (
                    <View style={[s.attachBadge, isPdf ? s.attachBadgePdf : s.attachBadgeImg]}>
                      <Text style={[s.attachBadgeText, isPdf ? s.attachBadgePdfText : s.attachBadgeImgText]}>{isPdf ? 'PDF' : 'IMG'}</Text>
                    </View>
                  )}
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={s.attachText} numberOfLines={1}>{f.name}</Text>
                    {sizeStr ? <Text style={{ fontSize: 11, color: C.inkFaint }}>{sizeStr}</Text> : null}
                  </View>
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
                <Text style={s.plusMenuHint}>PDF, image, spreadsheet, document</Text>
              </View>
            </Pressable>
            <View style={s.plusMenuDivider} />
            <Pressable style={s.plusMenuItem} onPress={() => { setPlusMenuOpen(false); setComposeMode(composeMode === 'image' ? 'ask' : 'image'); }}>
              <Icon name="image-outline" size={18} color={composeMode === 'image' ? C.brassLight : C.inkSoft} />
              <View style={{ flex: 1 }}>
                <Text style={s.plusMenuLabel}>{composeMode === 'image' ? 'Back to asking' : 'Make an image'}</Text>
                <Text style={s.plusMenuHint}>
                  {composeMode === 'image'
                    ? 'Jenny answers from the studio\'s records, mail and Drive'
                    : 'Drawn from your words · no tokens spent'}
                </Text>
              </View>
              {composeMode === 'image' && <Icon name="checkmark" size={16} color={C.brassLight} />}
            </Pressable>
            <View style={s.plusMenuDivider} />
            <Pressable style={s.plusMenuItem} onPress={() => { setPlusMenuOpen(false); setCheckinOpen(true); }}>
              <Icon name="checkbox-outline" size={18} color={C.inkSoft} />
              <View style={{ flex: 1 }}>
                <Text style={s.plusMenuLabel}>End-of-day check-in</Text>
                <Text style={s.plusMenuHint}>Review today's tasks and report progress</Text>
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

        {/* Image mode indicator */}
        {composeMode === 'image' && (
          <Pressable style={s.imageModeBar} onPress={() => setComposeMode('ask')}>
            <Icon name="image-outline" size={14} color={C.brassLight} />
            <Text style={s.imageModeText}>Making an image — tap to go back to asking</Text>
          </Pressable>
        )}

        {/* Voice bar — hands-free mode (same as web's VoiceBar) */}
        {handsFree && (
          <View style={s.voiceBar}>
            <View style={[s.voiceOrb, voicePhase === 'listening' && s.voiceOrbListening, voicePhase === 'speaking' && s.voiceOrbSpeaking, voicePhase === 'thinking' && s.voiceOrbThinking]}>
              {voicePhase === 'listening' ? (
                <Icon name="mic" size={24} color="#fff" />
              ) : voicePhase === 'speaking' ? (
                <Text style={s.voiceOrbText}>J</Text>
              ) : (
                <Icon name="ellipsis-horizontal" size={24} color="#fff" />
              )}
            </View>
            <Text style={s.voiceBarLabel}>
              {voicePhase === 'listening'
                ? (micStatus === 'hearing' ? 'Hearing you — keep going' : micStatus === 'starting' ? 'Starting the microphone…' : 'Listening — go ahead')
                : voicePhase === 'speaking'
                  ? 'Speaking'
                  : `${statusMsg || 'Thinking'}…`}
            </Text>
            {voicePhase === 'listening' && interim && (
              <Text style={s.voiceBarInterim} numberOfLines={3}>"{interim}"</Text>
            )}
            <View style={s.voiceBarActions}>
              {voicePhase === 'listening' && interim && (
                <Pressable style={s.voiceBarPrimary} onPress={doneTalking}>
                  <Text style={s.voiceBarPrimaryText}>Send now</Text>
                </Pressable>
              )}
              {voicePhase === 'speaking' && Tts && (
                <Pressable style={s.voiceBarSecondary} onPress={() => { try { Tts.stop(); } catch {} }}>
                  <Text style={s.voiceBarSecondaryText}>Skip</Text>
                </Pressable>
              )}
              <Pressable style={s.voiceBarSecondary} onPress={endHandsFree}>
                <Text style={s.voiceBarSecondaryText}>Type instead</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Listening indicator — matches web's mic meter */}
        {listening && !handsFree && (
          <View style={s.listeningBar}>
            <View style={s.listeningMeter}>
              <View style={[s.listeningMeterFill, micStatus === 'hearing' ? s.listeningMeterHearing : micStatus === 'listening' ? s.listeningMeterActive : s.listeningMeterStarting]} />
            </View>
            <Text style={[s.listeningText, micStatus === 'hearing' && { color: C.good }]}>
              {micStatus === 'starting' ? 'Starting the microphone…' : micStatus === 'hearing' ? 'Hearing you' : 'Listening…'}
            </Text>
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
              placeholder={listening ? (micStatus === 'hearing' ? 'Hearing you…' : 'Listening…') : composeMode === 'image' ? 'Describe the picture — the room, the materials, the light' : 'Ask Jenny anything…'}
              placeholderTextColor={listening ? C.crit : C.inkFaint}
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
                style={[s.sendBtn, (!input.trim() && !attachedFiles.length) && s.sendBtnDisabled]}
                onPress={() => sendMessage(input)}
                disabled={!input.trim() && !attachedFiles.length}>
                <Icon name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
          {/* Talk mode button — right of input pill, same as web */}
          {Voice && (
            <Pressable
              style={[s.talkBtn, handsFree && s.talkBtnActive]}
              onPress={async () => {
                if (handsFree) { endHandsFree(); return; }
                if (!Voice) { showAlert('Voice', 'Voice recognition is not available.'); return; }
                try {
                  if (Platform.OS === 'android') {
                    const { PermissionsAndroid } = require('react-native');
                    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
                    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                      showAlert('Microphone', 'Microphone permission is required for talk mode.');
                      return;
                    }
                  }
                  setHandsFree(true);
                  setVoicePhase('listening');
                  setListening(true);
                  setMicStatus('starting');
                  setInterim(null);
                  Voice.onSpeechStart = () => setMicStatus('listening');
                  Voice.onSpeechPartialResults = (e: { value?: string[] }) => {
                    if (e.value?.[0]) { setInput(e.value[0]); setInterim(e.value[0]); setMicStatus('hearing'); }
                  };
                  Voice.onSpeechResults = (e: { value?: string[] }) => {
                    if (e.value?.[0]) {
                      if (soundsLikeEcho(e.value[0])) { setInterim(null); return; }
                      setInput(e.value[0]);
                      voiceAlternativesRef.current = (e.value ?? []).slice(0, 5);
                      setVoicePhase('thinking');
                      setTimeout(() => sendMessageRef.current(e.value![0]), 300);
                    }
                    setInterim(null);
                  };
                  Voice.onSpeechEnd = () => { setListening(false); setInterim(null); };
                  Voice.onSpeechError = () => { setListening(false); setInterim(null); };
                  await Voice.start(speechLang);
                } catch (e) {
                  showAlert('Talk mode', 'Voice recognition is not available on this device.');
                  setHandsFree(false);
                  setListening(false);
                }
              }}>
              <Icon name="pulse-outline" size={20} color={handsFree ? C.brassLight : C.inkSoft} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Upload/Generate loader overlay */}
      {(uploading || (sending && statusMsg === 'Drawing it…')) && (
        <View style={s.uploadOverlay}>
          <View style={s.uploadBox}>
            <Loader dotsOnly message={uploading ? 'Uploading file…' : 'Generating image…'} />
          </View>
        </View>
      )}

      {/* Modals */}
      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet">
        <HistoryScreen
          conversations={conversations.filter(c => c.messages.length > 0)}
          activeId={activeId}
          speechLang={speechLang}
          onSpeechLangChange={setSpeechLang}
          speakReplies={speakReplies}
          onSpeakRepliesChange={setSpeakReplies}
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

      <CheckIn visible={checkinOpen} onClose={() => setCheckinOpen(false)} />

      <AgentPicker
        visible={agentsOpen}
        selected={agents}
        onToggle={toggleAgent}
        onSelectAll={() => setAgents(['inbox', 'vendors', 'projects', 'george', 'chief'])}
        onClearAll={() => setAgents([])}
        onClose={() => setAgentsOpen(false)}
      />


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
              { label: 'Sign Out', icon: 'log-out-outline', action: () => { setMenuOpen(false); showAlert('Sign out', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }]); } },
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
  headerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  headerChipActive: { borderColor: 'rgba(37,99,235,0.4)', backgroundColor: 'rgba(37,99,235,0.12)' },
  headerChipText: { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  headerChipTextActive: { color: C.brassLight },
  headerBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.sunk, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  headerBadgeText: { fontSize: 10.5, fontWeight: '700', color: C.inkFaint },
  headerBadgeActive: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.brass, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  headerBadgeActiveText: { fontSize: 10.5, fontWeight: '700', color: '#fff' },
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
  imageModeBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 8, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.10)' },
  imageModeText: { fontSize: 12, fontWeight: '500', color: C.brassLight },
  listeningBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 7 },
  listeningMeter: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.sunk, overflow: 'hidden' },
  listeningMeterFill: { height: '100%', borderRadius: 2, width: '30%' },
  listeningMeterStarting: { backgroundColor: C.inkFaint, width: '15%' },
  listeningMeterActive: { backgroundColor: C.crit, width: '40%' },
  listeningMeterHearing: { backgroundColor: C.good, width: '80%' },
  listeningText: { fontSize: 11, color: C.inkFaint, flexShrink: 0 },
  talkBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  talkBtnActive: { borderColor: 'rgba(37,99,235,0.4)', backgroundColor: 'rgba(37,99,235,0.15)' },
  voiceBar: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.line, gap: 12 },
  voiceOrb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: C.inkFaint },
  voiceOrbListening: { backgroundColor: C.crit },
  voiceOrbSpeaking: { backgroundColor: C.brass },
  voiceOrbThinking: { backgroundColor: C.inkFaint },
  voiceOrbText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  voiceBarLabel: { fontSize: 14, fontWeight: '500', color: C.ink, textAlign: 'center' },
  voiceBarInterim: { fontSize: 13, fontStyle: 'italic', color: C.inkSoft, textAlign: 'center', paddingHorizontal: 16 },
  voiceBarActions: { flexDirection: 'row', gap: 8 },
  voiceBarPrimary: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.brass },
  voiceBarPrimaryText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  voiceBarSecondary: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  voiceBarSecondaryText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  uploadOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  uploadBox: { paddingHorizontal: 32, paddingVertical: 24, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
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
  renderingBar: { marginTop: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 10 },
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
