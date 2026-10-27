import { showAlert } from '../components/DarkAlert';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { type Conversation, groupConversations } from '../lib/conversations';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', lineSoft: '#222F44',
  brass: '#2563EB', brassLight: '#60A5FA', brassDeep: '#60A5FA',
  nav: '#0F1B2D', crit: '#F87171', warn: '#FBBF24', good: '#4ADE80',
};

const SPEECH_LANGS = [
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-CA', label: 'English (Canada)' },
];

interface Props {
  conversations: Conversation[];
  loading?: boolean;
  activeId: string;
  speechLang: string;
  onSpeechLangChange: (code: string) => void;
  speakReplies: boolean;
  onSpeakRepliesChange: (on: boolean) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onPin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function timeLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function preview(c: Conversation) {
  const lastUser = [...c.messages].reverse().find(m => m.role === 'user');
  return lastUser?.content?.slice(0, 100) || '';
}

function conversationToMarkdown(c: Conversation): string {
  const lines = [`# ${c.title || 'Conversation'}`, `Created: ${new Date(c.createdAt).toLocaleString()}`, ''];
  for (const m of c.messages) {
    const time = new Date(m.timestamp).toLocaleString();
    lines.push(m.role === 'user' ? `**You** (${time}):` : `**Janelle** (${time}):`, m.content, '');
  }
  return lines.join('\n');
}

export default function HistoryScreen({
  conversations, loading, activeId, speechLang, onSpeechLangChange,
  speakReplies, onSpeakRepliesChange,
  onSelect, onNew, onPin, onRename, onDelete, onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const filtered = search.trim()
    ? conversations.filter(c => {
        const q = search.toLowerCase();
        if (c.title?.toLowerCase().includes(q)) return true;
        const prev = preview(c).toLowerCase();
        return prev.includes(q);
      })
    : conversations;

  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const groups = groupConversations(sorted);

  const startRename = (c: Conversation) => {
    setRenamingId(c.id);
    setRenameText(c.title || '');
    setMenuOpenId(null);
  };

  const confirmRename = () => {
    if (renamingId && renameText.trim()) {
      onRename(renamingId, renameText.trim().slice(0, 80));
    }
    setRenamingId(null);
  };

  const handleDownload = (c: Conversation) => {
    setMenuOpenId(null);
    Share.share({ message: conversationToMarkdown(c), title: c.title || 'Conversation' });
  };

  const handleDelete = (c: Conversation) => {
    setMenuOpenId(null);
    showAlert('Delete conversation', `Delete "${c.title || 'this conversation'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(c.id) },
    ]);
  };

  const renderRow = (c: Conversation) => {
    const isActive = c.id === activeId;
    const title = c.title || preview(c) || 'New conversation';
    const previewText = preview(c);
    const showMenu = menuOpenId === c.id;

    if (renamingId === c.id) {
      return (
        <View key={c.id} style={[s.row, s.rowActive]}>
          <TextInput
            style={s.renameInput}
            value={renameText}
            onChangeText={setRenameText}
            onSubmitEditing={confirmRename}
            onBlur={confirmRename}
            autoFocus
            maxLength={80}
            placeholder="Conversation name"
            placeholderTextColor={C.inkFaint}
            selectTextOnFocus
          />
        </View>
      );
    }

    return (
      <View key={c.id}>
        <Pressable
          style={[s.row, isActive && s.rowActive]}
          onPress={() => { onSelect(c.id); onClose(); }}>
          <View style={s.rowMain}>
            <View style={s.rowTitleRow}>
              {c.pinned && <Icon name="pin" size={12} color={C.brassLight} />}
              <Text style={[s.rowTitle, isActive && s.rowTitleActive]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            {previewText ? (
              <Text style={s.rowPreview} numberOfLines={1}>{previewText}</Text>
            ) : null}
          </View>
          <View style={s.rowRight}>
            <Text style={s.rowTime}>{timeLabel(c.updatedAt)}</Text>
            <Pressable
              style={s.menuBtn}
              onPress={(e) => { e.stopPropagation; setMenuOpenId(showMenu ? null : c.id); }}
              hitSlop={8}>
              <Text style={s.menuDots}>···</Text>
            </Pressable>
          </View>
        </Pressable>

        {/* Action menu */}
        {showMenu && (
          <View style={s.actionMenu}>
            <Pressable style={s.actionItem} onPress={() => startRename(c)}>
              <Text style={s.actionText}>Rename</Text>
            </Pressable>
            <Pressable style={s.actionItem} onPress={() => { onPin(c.id); setMenuOpenId(null); }}>
              <Text style={s.actionText}>{c.pinned ? 'Unpin' : 'Pin'}</Text>
            </Pressable>
            <Pressable style={s.actionItem} onPress={() => handleDownload(c)}>
              <Text style={s.actionText}>Download</Text>
            </Pressable>
            <Pressable style={s.actionItem} onPress={() => handleDelete(c)}>
              <Text style={[s.actionText, s.actionDelete]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Conversations</Text>
        <Pressable style={s.closeBtn} onPress={onClose}>
          <Icon name="close" size={16} color={C.inkSoft} />
        </Pressable>
      </View>

      {/* New + Search */}
      <View style={s.toolbar}>
        <Pressable style={s.newBtn} onPress={() => { onNew(); onClose(); }}>
          <Text style={s.newBtnText}>+ New conversation</Text>
        </Pressable>
        <View style={s.searchWrap}>
          <Icon name="search-outline" size={14} color={C.inkFaint} />
          <TextInput
            style={s.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={C.inkFaint}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Icon name="close-circle" size={16} color={C.inkFaint} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Your English */}
      <View style={s.langSection}>
        <Text style={s.langTitle}>Your English</Text>
        <Text style={s.langDesc}>The accent the microphone listens for.</Text>
        <View style={s.langOptions}>
          {SPEECH_LANGS.map(l => (
            <Pressable
              key={l.code}
              style={[s.langChip, speechLang === l.code && s.langChipActive]}
              onPress={() => onSpeechLangChange(l.code)}>
              <Text style={[s.langChipText, speechLang === l.code && s.langChipTextActive]}>
                {l.label.replace('English ', '').replace('(', '').replace(')', '')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Speak replies toggle */}
      <Pressable
        style={[s.langSection, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => onSpeakRepliesChange(!speakReplies)}>
        <View style={{ flex: 1 }}>
          <Text style={s.langTitle}>Read replies aloud</Text>
          <Text style={s.langDesc}>Speak every answer, even without hands-free mode.</Text>
        </View>
        <View style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: speakReplies ? C.brass : C.sunk, borderWidth: 1, borderColor: speakReplies ? C.brass : C.line, justifyContent: 'center', paddingHorizontal: 2 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: speakReplies ? 'flex-end' : 'flex-start' }} />
        </View>
      </Pressable>

      {/* Conversation list */}
      <ScrollView
        contentContainerStyle={[s.list, { paddingBottom: Math.max(insets.bottom, 20) }]}
        keyboardShouldPersistTaps="handled">
        {groups.length === 0 && (
          <View style={s.emptyWrap}>
            {loading ? (
              <ActivityIndicator size="small" color={C.brassLight} />
            ) : (
              <Text style={s.emptyText}>
                {search ? 'No conversation matches that.' : 'Your conversations will be kept here.'}
              </Text>
            )}
          </View>
        )}
        {groups.map(g => (
          <View key={g.label}>
            <Text style={s.sectionLabel}>{g.label}</Text>
            {g.items.map(c => renderRow(c))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  closeIcon: { fontSize: 14, color: C.inkSoft, fontWeight: '600' },

  // Toolbar
  toolbar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  newBtn: {
    paddingVertical: 10, borderRadius: 8,
    backgroundColor: C.brass, alignItems: 'center', marginBottom: 10,
  },
  newBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 40, borderRadius: 8, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  searchClear: { fontSize: 14, color: C.inkFaint, fontWeight: '600', paddingLeft: 8 },

  // Language picker
  langSection: {
    marginHorizontal: 16, marginTop: 10, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  langTitle: { fontSize: 13, fontWeight: '600', color: C.ink },
  langDesc: { fontSize: 11.5, color: C.inkFaint, marginTop: 2, marginBottom: 10 },
  langOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  langChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line,
  },
  langChipActive: { backgroundColor: C.brass, borderColor: C.brass },
  langChipText: { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  langChipTextActive: { color: '#fff' },

  // List
  list: { paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: C.inkFaint,
    letterSpacing: 0.5, marginTop: 18, marginBottom: 8, paddingLeft: 4,
  },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, marginBottom: 2,
  },
  rowActive: {
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)',
  },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinIcon: { fontSize: 12 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: C.ink, flex: 1 },
  rowTitleActive: { fontWeight: '600', color: C.brassLight },
  rowPreview: { fontSize: 12, color: C.inkFaint, marginTop: 4 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowTime: { fontSize: 11, color: C.inkFaint },
  menuBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  menuDots: { fontSize: 16, fontWeight: '700', color: C.inkFaint, letterSpacing: 2 },

  // Action menu
  actionMenu: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  actionItem: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line,
  },
  actionText: { fontSize: 12, fontWeight: '500', color: C.inkSoft },
  actionDelete: { color: C.crit },

  // Rename
  renameInput: {
    flex: 1, height: 40, borderRadius: 8,
    backgroundColor: C.sunk, borderWidth: 1, borderColor: C.brass,
    paddingHorizontal: 12, fontSize: 14, color: C.ink,
  },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: C.inkFaint },
});
