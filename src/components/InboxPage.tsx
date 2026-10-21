import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { api } from '../lib/api';
import { ENDPOINTS } from '../lib/endpoints';
import Loader from './Loader';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', lineSoft: '#222F44',
  brass: '#2563EB', brassDeep: '#60A5FA', good: '#4ADE80', crit: '#F87171', warn: '#FBBF24', olive: '#A78BFA',
};

const CLASS_LABEL: Record<string, string> = {
  vendor_quote: 'Quote', order_confirmation: 'Order confirm',
  client_approval: 'Client approval', houzz_notification: 'Houzz',
  general: 'General', unclassified: 'Unclassified',
};
const CLASS_TONE: Record<string, string> = {
  vendor_quote: C.brass, order_confirmation: C.good,
  client_approval: C.warn, houzz_notification: C.inkFaint,
  general: C.inkFaint, unclassified: C.inkFaint,
};
const CATEGORY_LABELS: Record<string, string> = {
  design: 'Design', procurement: 'Procurement', ff_and_e: 'FF&E',
  client_communication: 'Client Comms', admin: 'Admin', installation: 'Installation',
};

interface Email {
  id: string; subject?: string; from?: string; sender?: string;
  fromName?: string; fromEmail?: string; from_addr?: string;
  date?: string; when?: string; receivedAt?: string; received_at?: string;
  snippet?: string; summary?: string;
  cls?: string; class?: string;
  project?: string; vendor?: string; category?: string;
  gmailId?: string; gmail_id?: string;
}

function gmailMessageUrl(gmailId: string) {
  return `https://mail.google.com/mail/u/0/#all/${gmailId}`;
}

async function openInGmail(gmailId: string) {
  if (Platform.OS === 'ios') {
    // Try Gmail iOS app first
    const gmailAppUrl = `googlegmail:///mail/u/0/#all/${gmailId}`;
    const canOpen = await Linking.canOpenURL(gmailAppUrl).catch(() => false);
    if (canOpen) {
      Linking.openURL(gmailAppUrl);
      return;
    }
  }
  // Android opens Gmail app automatically; iOS falls back to browser
  Linking.openURL(gmailMessageUrl(gmailId));
}

interface Props { onClose: () => void }

export default function InboxPage({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'sender' | 'subject' | 'type' | 'project'>('date');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    api<Email[]>(ENDPOINTS.EMAILS)
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const senderName = (m: Email) => m.fromName || m.from || m.sender || m.fromEmail || m.from_addr || '';
  const getGmailId = (m: Email) => m.gmailId || m.gmail_id || '';
  const getCls = (m: Email) => m.cls || m.class || '';

  const types = useMemo(() => [...new Set(data.map(m => getCls(m)).filter(Boolean))].sort((a, b) =>
    (CLASS_LABEL[a!] ?? a!).localeCompare(CLASS_LABEL[b!] ?? b!)), [data]);
  const categories = useMemo(() => [...new Set(data.map(m => m.category).filter(Boolean))].sort(), [data]);

  const filtering = Boolean(search.trim()) || typeFilter !== null || categoryFilter !== null;

  const filtered = useMemo(() => {
    let items = data;
    if (typeFilter) items = items.filter(m => getCls(m) === typeFilter);
    if (categoryFilter === 'none') {
      items = items.filter(m => !m.category);
    } else if (categoryFilter) {
      items = items.filter(m => m.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(m =>
        (m.subject || '').toLowerCase().includes(q) ||
        (m.fromName || m.from || m.sender || m.fromEmail || '').toLowerCase().includes(q) ||
        (m.snippet || '').toLowerCase().includes(q) ||
        (m.project || '').toLowerCase().includes(q) ||
        (m.vendor || '').toLowerCase().includes(q) ||
        (m.category ? (CATEGORY_LABELS[m.category] || m.category) : '').toLowerCase().includes(q),
      );
    }
    items = [...items].sort((a, b) => {
      if (sortBy === 'date') return (b.receivedAt || b.date || '').localeCompare(a.receivedAt || a.date || '');
      if (sortBy === 'sender') return senderName(a).localeCompare(senderName(b));
      if (sortBy === 'type') return (CLASS_LABEL[a.cls || ''] || '').localeCompare(CLASS_LABEL[b.cls || ''] || '');
      if (sortBy === 'project') return (a.project || '').localeCompare(b.project || '');
      return (a.subject || '').localeCompare(b.subject || '');
    });
    return items;
  }, [data, search, typeFilter, categoryFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => { setPage(1); }, [search, typeFilter, categoryFilter, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter(null);
    setCategoryFilter(null);
  };

  const senderInitial = (m: Email) => {
    const name = senderName(m);
    return name ? name[0].toUpperCase() : '?';
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Inbox Intelligence</Text>
        <Pressable style={st.closeBtn} onPress={onClose}>
          <Icon name="close" size={16} color={C.inkSoft} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={st.toolbar}>
        <View style={st.searchWrap}>
          <Icon name="search-outline" size={14} color={C.inkFaint} />
          <TextInput
            style={st.searchInput}
            placeholder="Search subject, sender, project or vendor"
            placeholderTextColor={C.inkFaint}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Type filter */}
      {types.length > 0 && (
        <View style={st.filterWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
            <Pressable style={[st.filterChip, !typeFilter && st.filterChipActive]} onPress={() => setTypeFilter(null)}>
              <Text style={[st.filterChipText, !typeFilter && st.filterChipTextActive]}>All types</Text>
            </Pressable>
            {types.map(t => (
              <Pressable key={t} style={[st.filterChip, typeFilter === t && st.filterChipActive]} onPress={() => setTypeFilter(typeFilter === t ? null : t!)}>
                <View style={[st.filterDot, { backgroundColor: CLASS_TONE[t!] || C.inkFaint }]} />
                <Text style={[st.filterChipText, typeFilter === t && st.filterChipTextActive]}>{CLASS_LABEL[t!] || t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <View style={st.filterWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
            <Pressable style={[st.filterChip, !categoryFilter && st.filterChipActive]} onPress={() => setCategoryFilter(null)}>
              <Text style={[st.filterChipText, !categoryFilter && st.filterChipTextActive]}>All categories</Text>
          </Pressable>
          {categories.map(c => (
            <Pressable key={c} style={[st.filterChip, categoryFilter === c && st.filterChipActive]} onPress={() => setCategoryFilter(categoryFilter === c ? null : c!)}>
              <Text style={[st.filterChipText, categoryFilter === c && st.filterChipTextActive]}>{CATEGORY_LABELS[c!] || c}</Text>
            </Pressable>
          ))}
          <Pressable style={[st.filterChip, categoryFilter === 'none' && st.filterChipActive]} onPress={() => setCategoryFilter(categoryFilter === 'none' ? null : 'none')}>
            <Text style={[st.filterChipText, categoryFilter === 'none' && st.filterChipTextActive]}>No category</Text>
          </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Sort + count + clear */}
      <View style={st.sortBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={st.countText}>{filtered.length} of {data.length} messages</Text>
          {filtering && (
            <Pressable onPress={clearFilters}>
              <Text style={st.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>
        <View style={st.sortToggle}>
          {(['date', 'sender', 'subject', 'type', 'project'] as const).map(s => (
            <Pressable key={s} style={[st.sortBtn, sortBy === s && st.sortBtnActive]} onPress={() => setSortBy(s)}>
              <Text style={[st.sortBtnText, sortBy === s && st.sortBtnTextActive]}>{s[0].toUpperCase() + s.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={st.center}><Loader message="Loading inbox..." /></View>
      ) : error ? (
        <View style={st.center}><Text style={st.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={paged}
          keyExtractor={(m, i) => m.id || String(i)}
          contentContainerStyle={[st.list, { paddingBottom: Math.max(insets.bottom, 20) }]}
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={st.emptyText}>{data.length === 0 ? 'No mail read yet. Run "Read Gmail & Drive" from the Dashboard.' : 'No mail matches these filters.'}</Text>
            </View>
          }
          ListFooterComponent={totalPages > 1 ? (
            <View style={st.pager}>
              <Pressable style={[st.pageBtn, page <= 1 && { opacity: 0.3 }]} onPress={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <Icon name="chevron-back" size={14} color={C.inkSoft} />
                <Text style={st.pageBtnText}>Prev</Text>
              </Pressable>
              <Text style={st.pageInfo}>Page {page} of {totalPages}</Text>
              <Pressable style={[st.pageBtn, page >= totalPages && { opacity: 0.3 }]} onPress={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <Text style={st.pageBtnText}>Next</Text>
                <Icon name="chevron-forward" size={14} color={C.inkSoft} />
              </Pressable>
            </View>
          ) : undefined}
          renderItem={({ item: m }) => {
            const expanded = expandedIds.has(m.id);
            const tone = CLASS_TONE[getCls(m) || ''] || C.inkFaint;
            const rawDate = m.receivedAt || m.received_at;
            const when = m.when || m.date || (rawDate ? new Date(rawDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
            return (
              <Pressable onPress={() => toggleExpand(m.id)}>
                <View style={[st.row, expanded && st.rowExpanded]}>
                  {/* Type pill + when */}
                  <View style={st.topRow}>
                    <View style={[st.pill, { borderColor: tone }]}>
                      <View style={[st.pillDot, { backgroundColor: tone }]} />
                      <Text style={[st.pillText, { color: tone }]}>{CLASS_LABEL[getCls(m) || ''] || getCls(m) || 'Email'}</Text>
                    </View>
                    <Text style={st.metaWhen}>{when}</Text>
                  </View>

                  {/* Sender */}
                  <View style={st.senderRow}>
                    <View style={st.senderAvatar}>
                      <Text style={st.senderInitial}>{senderInitial(m)}</Text>
                    </View>
                    <Text style={st.senderName} numberOfLines={1}>{senderName(m)}</Text>
                  </View>

                  {/* Subject + snippet + drafted indicator */}
                  <View style={st.subjectRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={[st.subject, { flexShrink: 1 }]} numberOfLines={expanded ? undefined : 1}>{m.subject || '(no subject)'}</Text>
                      {['vendor_quote', 'order_confirmation', 'client_approval'].includes(getCls(m) || '') && (
                        <Text style={st.draftedTag}>drafted</Text>
                      )}
                    </View>
                    {m.snippet && !expanded && <Text style={st.snippet} numberOfLines={1}>{m.snippet}</Text>}
                  </View>

                  {/* Meta row */}
                  <View style={st.metaRow}>
                    {m.project && <Text style={st.metaProject} numberOfLines={1}>{m.project}</Text>}
                    {m.vendor && !expanded && <Text style={st.metaVendor} numberOfLines={1}>{m.vendor}</Text>}
                    {m.category && <Text style={st.metaCategory}>{CATEGORY_LABELS[m.category] || m.category}</Text>}
                  </View>

                  {/* Expanded content */}
                  {expanded && (
                    <View style={st.expandedContent}>
                      <Text style={st.expandedText}>{m.summary || m.snippet || 'No preview available.'}</Text>
                      {m.vendor && <Text style={st.expandedMeta}>Vendor: {m.vendor}</Text>}
                      {getGmailId(m) && (
                        <Pressable style={st.gmailLink} onPress={() => openInGmail(getGmailId(m))}>
                          <Text style={st.gmailLinkText}>Open in Gmail →</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </Pressable>
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
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: C.crit, fontSize: 14, textAlign: 'center' },
  emptyText: { color: C.inkFaint, fontSize: 14, textAlign: 'center' },

  toolbar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, gap: 6 },
  searchInput: { flex: 1, fontSize: 13, color: C.ink, padding: 0 },
  filterWrap: { minHeight: 38, marginBottom: 4 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 6, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  filterChipActive: { borderColor: C.brass, backgroundColor: 'rgba(37,99,235,0.12)' },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  filterChipText: { fontSize: 12, color: C.inkFaint, fontWeight: '500', lineHeight: 16 },
  filterChipTextActive: { color: C.ink },
  sortBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  countText: { fontSize: 12, color: C.inkFaint },
  clearText: { fontSize: 12, color: C.brassDeep, fontWeight: '600' },
  sortToggle: { flexDirection: 'row', borderRadius: 6, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  sortBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.surface },
  sortBtnActive: { backgroundColor: C.brass },
  sortBtnText: { fontSize: 11, fontWeight: '600', color: C.inkFaint },
  sortBtnTextActive: { color: '#fff' },
  pager: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 16 },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  pageBtnText: { fontSize: 12, fontWeight: '600', color: C.inkSoft },
  pageInfo: { fontSize: 12, color: C.inkFaint },

  list: { paddingHorizontal: 16 },
  row: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 8 },
  rowExpanded: { borderColor: 'rgba(37,99,235,0.3)' },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },

  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  senderAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' },
  senderInitial: { fontSize: 10, fontWeight: '700', color: C.brass },
  senderName: { fontSize: 13, fontWeight: '500', color: C.ink, flex: 1 },

  subjectRow: { marginBottom: 6 },
  subject: { fontSize: 13.5, fontWeight: '600', color: C.ink },
  draftedTag: { fontSize: 12, fontWeight: '600', color: C.brassDeep },
  snippet: { fontSize: 12, color: C.inkFaint, marginTop: 2 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaProject: { fontSize: 12, color: C.inkSoft },
  metaVendor: { fontSize: 12, color: C.inkFaint },
  metaCategory: { fontSize: 11, color: C.inkFaint, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: C.sunk, overflow: 'hidden' },
  metaWhen: { fontSize: 12, color: C.inkFaint },

  expandedContent: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.lineSoft },
  expandedText: { fontSize: 13, color: C.inkSoft, lineHeight: 20 },
  expandedMeta: { fontSize: 12, color: C.inkFaint, marginTop: 6 },
  gmailLink: { marginTop: 8 },
  gmailLinkText: { fontSize: 12.5, fontWeight: '600', color: C.brassDeep },
});
