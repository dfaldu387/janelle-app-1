import { showAlert } from '../components/DarkAlert';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { ENDPOINTS } from '../lib/endpoints';
import Loader from './Loader';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', lineSoft: '#222F44',
  brass: '#2563EB', brassDeep: '#60A5FA', good: '#4ADE80', crit: '#F87171',
};

interface Draft {
  id: string;
  subject?: string;
  body_preview?: string;
  to?: string;
  created_at: string;
  owner_id?: string;
  created_by?: string;
  gmail_message_id?: string;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseDraft(text: string) {
  const to = text.match(/^To:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const cc = text.match(/^Cc:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const body = text.replace(/^To:.*$/im, '').replace(/^Cc:.*$/im, '').replace(/^\s+/, '');
  const plain = htmlToPlainText(body);
  return { to, cc, body, plain };
}

function ageFrom(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'today' : `${days}d ago`;
}

function gmailComposeUrl(d: { to: string; cc: string; subject: string; body: string }) {
  const q = new URLSearchParams({ view: 'cm', fs: '1' });
  if (d.to) q.set('to', d.to);
  if (d.cc) q.set('cc', d.cc);
  if (d.subject) q.set('su', d.subject);
  if (d.body) q.set('body', d.body.replace(/<[^>]+>/g, ''));
  return `https://mail.google.com/mail/?${q.toString()}`;
}

function gmailMessageUrl(id: string) {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}

async function openInGmail(gmailId: string) {
  if (Platform.OS === 'ios') {
    const gmailAppUrl = `googlegmail:///mail/u/0/#all/${gmailId}`;
    const canOpen = await Linking.canOpenURL(gmailAppUrl).catch(() => false);
    if (canOpen) {
      Linking.openURL(gmailAppUrl);
      return;
    }
  }
  Linking.openURL(gmailMessageUrl(gmailId));
}

function mailtoUrl(d: { to: string; cc: string; subject: string; body: string }) {
  const params: string[] = [];
  if (d.cc) params.push(`cc=${encodeURIComponent(d.cc)}`);
  if (d.subject) params.push(`subject=${encodeURIComponent(d.subject)}`);
  if (d.body) params.push(`body=${encodeURIComponent(d.body.replace(/<[^>]+>/g, ''))}`);
  const query = params.length ? `?${params.join('&')}` : '';
  return `mailto:${encodeURIComponent(d.to)}${query}`;
}

function openMailOptions(draft: { to: string; cc: string; subject: string; body: string }, gmailUrl: string) {
  const mailto = mailtoUrl(draft);
  showAlert('Open draft in…', undefined, [
    { text: 'Gmail', onPress: () => Linking.openURL(gmailUrl) },
    { text: 'Mail App', onPress: () => Linking.openURL(mailto) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

interface Props { onClose: () => void }

export default function DraftsPage({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTo, setEditTo] = useState('');
  const [editCc, setEditCc] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Draft[]>(ENDPOINTS.DRAFTS)
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const isMine = (d: Draft) => {
    const owner = d.owner_id ?? d.created_by ?? null;
    return !owner || owner === user?.id;
  };

  const drafts = useMemo(() =>
    scope === 'mine' ? data.filter(isMine) : data,
  [data, scope, user]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (d: Draft) => {
    const parsed = parseDraft(d.body_preview ?? '');
    setEditTo(d.to || parsed.to);
    setEditCc(parsed.cc);
    setEditSubject(d.subject || '');
    setEditBody(parsed.body);
    setEditingId(d.id);
    setExpandedIds(prev => new Set(prev).add(d.id));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const bodyText = `To: ${editTo}\n${editCc ? `Cc: ${editCc}\n` : ''}${editBody}`;
      await api(ENDPOINTS.DRAFTS + `/${editingId}`, { method: 'PATCH', body: JSON.stringify({ to: editTo, cc: editCc, subject: editSubject, body: bodyText }) });
      setData(prev => prev.map(d => d.id === editingId ? { ...d, subject: editSubject, to: editTo, body_preview: bodyText } : d));
      setEditingId(null);
    } catch (e) {
      showAlert('Error', (e as Error).message);
    } finally { setSaving(false); }
  };

  const deleteDraft = (id: string) => {
    showAlert('Delete draft', 'Are you sure you want to delete this draft?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api(ENDPOINTS.DRAFTS + `/${id}`, { method: 'DELETE' });
          setData(prev => prev.filter(d => d.id !== id));
        } catch (e) { showAlert('Error', (e as Error).message); }
      }},
    ]);
  };

  const copyBody = (text: string) => {
    try {
      const Clip = require('@react-native-clipboard/clipboard').default;
      Clip.setString(text.replace(/<[^>]+>/g, ''));
    } catch {
      try { const { Clipboard } = require('react-native'); Clipboard.setString(text.replace(/<[^>]+>/g, '')); } catch {}
    }
  };

  const mineCount = data.filter(isMine).length;

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Drafts</Text>
        <View style={st.headerRight}>
          <View style={st.scopeToggle}>
            <Pressable style={[st.scopeBtn, scope === 'mine' && st.scopeBtnActive]} onPress={() => setScope('mine')}>
              <Text style={[st.scopeBtnText, scope === 'mine' && st.scopeBtnTextActive]}>Mine {mineCount}</Text>
            </Pressable>
            <Pressable style={[st.scopeBtn, scope === 'all' && st.scopeBtnActive]} onPress={() => setScope('all')}>
              <Text style={[st.scopeBtnText, scope === 'all' && st.scopeBtnTextActive]}>All {data.length}</Text>
            </Pressable>
          </View>
          <Pressable style={st.closeBtn} onPress={onClose}>
            <Icon name="close" size={16} color={C.inkSoft} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={st.center}><Loader message="Loading drafts..." /></View>
      ) : error ? (
        <View style={st.center}><Text style={st.errorText}>{error}</Text></View>
      ) : drafts.length === 0 ? (
        <View style={st.center}>
          <Text style={st.emptyText}>No drafts yet. They appear here as the system reads email and raises follow-ups.</Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={d => d.id}
          contentContainerStyle={[st.list, { paddingBottom: Math.max(insets.bottom, 20) }]}
          renderItem={({ item: d }) => {
            const parsed = parseDraft(d.body_preview ?? '');
            const subject = d.subject || '';
            const isOpen = expandedIds.has(d.id);
            const isEditing = editingId === d.id;
            const isRealDraft = Boolean(d.gmail_message_id);
            const gmailUrl = isRealDraft
              ? gmailMessageUrl(d.gmail_message_id!)
              : gmailComposeUrl({ to: d.to || parsed.to, cc: parsed.cc, subject, body: parsed.body });

            return (
              <View style={st.card}>
                {/* Header row */}
                <Pressable style={st.cardHeader} onPress={() => toggleExpand(d.id)}>
                  <View style={st.draftBadge}><Text style={st.draftBadgeText}>draft</Text></View>
                  <View style={st.cardContent}>
                    <Text style={st.cardSubject} numberOfLines={isOpen ? undefined : 1}>{subject || '(no subject)'}</Text>
                    {!isOpen && parsed.plain ? <Text style={st.cardPreview} numberOfLines={1}>{parsed.plain.slice(0, 110)}</Text> : null}
                    {(d.to || parsed.to) ? <Text style={st.cardTo}>to {d.to || parsed.to}</Text> : null}
                  </View>
                  <View style={st.cardRight}>
                    <Text style={st.cardAge}>{ageFrom(d.created_at)}</Text>
                    {!isEditing && (
                      <View style={st.cardActions}>
                        <Pressable style={st.editBtn} onPress={() => startEdit(d)}>
                          <Icon name="create-outline" size={14} color={C.inkSoft} />
                          <Text style={st.editBtnText}>Edit</Text>
                        </Pressable>
                        <Pressable style={st.gmailBtn} onPress={() => openMailOptions({ to: d.to || parsed.to, cc: parsed.cc, subject, body: parsed.body }, gmailUrl)}>
                          <Icon name="mail-outline" size={14} color="#fff" />
                          <Text style={st.gmailBtnText}>Mail</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </Pressable>

                {/* Expanded: editing mode */}
                {isOpen && isEditing && (
                  <View style={st.editPanel}>
                    <View style={st.editField}>
                      <Text style={st.editLabel}>To</Text>
                      <TextInput style={st.editInput} value={editTo} onChangeText={setEditTo} placeholder="recipient@email.com" placeholderTextColor={C.inkFaint} />
                    </View>
                    <View style={st.editField}>
                      <Text style={st.editLabel}>Cc</Text>
                      <TextInput style={st.editInput} value={editCc} onChangeText={setEditCc} placeholder="cc@email.com" placeholderTextColor={C.inkFaint} />
                    </View>
                    <View style={st.editField}>
                      <Text style={st.editLabel}>Subject</Text>
                      <TextInput style={st.editInput} value={editSubject} onChangeText={setEditSubject} placeholder="Subject" placeholderTextColor={C.inkFaint} />
                    </View>
                    <TextInput
                      style={st.editBodyInput}
                      value={editBody.replace(/<[^>]+>/g, '')}
                      onChangeText={setEditBody}
                      multiline
                      placeholder="Write the reply…"
                      placeholderTextColor={C.inkFaint}
                    />
                    <View style={st.editActions}>
                      <Pressable style={st.saveBtn} onPress={saveEdit} disabled={saving}>
                        <Text style={st.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
                      </Pressable>
                      <Pressable style={st.cancelEditBtn} onPress={() => setEditingId(null)}>
                        <Text style={st.cancelEditText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Expanded: read-only */}
                {isOpen && !isEditing && (
                  <View style={st.expandedPanel}>
                    {(parsed.to || parsed.cc) && (
                      <View style={st.expandedHeaders}>
                        {parsed.to ? <View style={st.headerField}><Text style={st.headerLabel}>To</Text><Text style={st.headerValue}>{parsed.to}</Text></View> : null}
                        {parsed.cc ? <View style={st.headerField}><Text style={st.headerLabel}>Cc</Text><Text style={st.headerValue}>{parsed.cc}</Text></View> : null}
                      </View>
                    )}
                    <Text style={st.bodyText}>{parsed.plain || parsed.body}</Text>
                    <View style={st.expandedActions}>
                      <Pressable style={st.actionBtn} onPress={() => startEdit(d)}>
                        <Icon name="create-outline" size={14} color="#fff" />
                        <Text style={st.actionBtnText}>Edit draft</Text>
                      </Pressable>
                      <Pressable style={st.actionBtnSecondary} onPress={() => openMailOptions({ to: d.to || parsed.to, cc: parsed.cc, subject, body: parsed.body }, gmailUrl)}>
                        <Icon name="mail-outline" size={14} color={C.inkSoft} />
                        <Text style={st.actionBtnSecondaryText}>Open in Mail</Text>
                      </Pressable>
                      <Pressable style={st.actionBtnSecondary} onPress={() => copyBody(parsed.body)}>
                        <Icon name="copy-outline" size={14} color={C.inkSoft} />
                        <Text style={st.actionBtnSecondaryText}>Copy</Text>
                      </Pressable>
                      <Pressable style={st.deleteBtn} onPress={() => deleteDraft(d.id)}>
                        <Icon name="trash-outline" size={14} color={C.crit} />
                        <Text style={st.deleteBtnText}>Delete</Text>
                      </Pressable>
                    </View>
                    <Text style={st.expandedHint}>
                      {isRealDraft ? 'Opens the actual draft in your mail app. Review, then send from there.' : 'Opens a prefilled compose window in Gmail or your default mail app.'}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#0B1220' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scopeToggle: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  scopeBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.surface },
  scopeBtnActive: { backgroundColor: C.brass },
  scopeBtnText: { fontSize: 12, fontWeight: '600', color: C.inkFaint },
  scopeBtnTextActive: { color: '#fff' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: C.crit, fontSize: 14, textAlign: 'center' },
  emptyText: { color: C.inkFaint, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  list: { padding: 16 },

  // Card
  card: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  draftBadge: { backgroundColor: 'rgba(74,222,128,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 2 },
  draftBadgeText: { fontSize: 12, fontWeight: '600', color: C.good },
  cardContent: { flex: 1, minWidth: 0 },
  cardSubject: { fontSize: 14, fontWeight: '500', color: C.ink },
  cardPreview: { fontSize: 13, color: C.inkSoft, marginTop: 2 },
  cardTo: { fontSize: 11, color: C.inkFaint, marginTop: 3 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardAge: { fontSize: 11, color: C.inkFaint },
  cardActions: { flexDirection: 'row', gap: 6 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  editBtnText: { fontSize: 11, fontWeight: '600', color: C.inkSoft },
  gmailBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: C.brass },
  gmailBtnText: { fontSize: 11, fontWeight: '600', color: '#fff' },

  // Expanded read-only
  expandedPanel: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingHorizontal: 14, paddingVertical: 14 },
  expandedHeaders: { marginBottom: 10 },
  headerField: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  headerLabel: { width: 24, fontSize: 13, color: C.inkFaint },
  headerValue: { flex: 1, fontSize: 13, color: C.ink },
  bodyText: { fontSize: 14, color: C.ink, lineHeight: 22 },
  expandedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.brass },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  actionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  actionBtnSecondaryText: { fontSize: 12, fontWeight: '600', color: C.inkSoft },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: C.crit },
  expandedHint: { fontSize: 12, color: C.inkFaint, marginTop: 10 },

  // Edit panel
  editPanel: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingHorizontal: 14, paddingVertical: 14 },
  editField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft, paddingVertical: 8 },
  editLabel: { width: 50, fontSize: 12.5, fontWeight: '500', color: C.inkFaint },
  editInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  editBodyInput: { marginTop: 10, minHeight: 120, fontSize: 14, color: C.ink, lineHeight: 22, textAlignVertical: 'top', backgroundColor: C.sunk, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.line },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: C.brass },
  saveBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  cancelEditBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  cancelEditText: { fontSize: 12, fontWeight: '600', color: C.inkFaint },
});
