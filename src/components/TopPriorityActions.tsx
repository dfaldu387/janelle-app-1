import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Modal, Pressable, StyleSheet, Text, View,
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
  brass: '#2563EB', good: '#4ADE80', crit: '#F87171', warn: '#FBBF24', olive: '#A78BFA',
};

const TYPE_LABEL: Record<string, string> = {
  vendor_silence: 'Vendor silent',
  client_approval_overdue: 'Approval overdue',
  date_slipping: 'Date slipping',
  spec_gap: 'Spec gap',
  quote_overdue: 'Quote overdue',
  client_waiting: 'Client waiting',
  task_overdue: 'Reminder sent',
  task_escalation: 'Escalated',
  task_unowned: 'No owner',
  task_no_next_step: 'No next step',
  task_no_due_date: 'No due date',
};

const TYPE_TONE: Record<string, string> = {
  vendor_silence: C.warn,
  client_approval_overdue: C.crit,
  date_slipping: C.crit,
  spec_gap: C.brass,
  quote_overdue: C.crit,
  client_waiting: C.crit,
  task_overdue: C.warn,
  task_escalation: C.crit,
  task_unowned: C.warn,
  task_no_next_step: C.brass,
  task_no_due_date: C.brass,
};

const RANK: Record<string, number> = {
  task_escalation: 0,
  date_slipping: 1,
  client_approval_overdue: 1,
  client_waiting: 2,
  quote_overdue: 2,
  vendor_silence: 3,
  task_overdue: 3,
  spec_gap: 4,
  task_unowned: 4,
  task_no_next_step: 5,
  task_no_due_date: 5,
};
const TOP_RANK = 1;

const SNOOZE_OPTIONS = [
  { days: 3, label: '3 days' },
  { days: 7, label: 'A week' },
  { days: 14, label: 'Two weeks' },
];

interface FollowUp {
  id: string;
  type: string;
  reason: string | null;
  created_at: string;
  target: string | null;
  vendors: { name: string } | null;
  projects: { name: string; assigned_to?: string | null } | null;
  tasks: { assigned_to: string | null } | null;
  task_id: string | null;
}

function ageFrom(created: string): string {
  const days = Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function rankOf(f: FollowUp) { return RANK[f.type] ?? 4; }

function projectOf(f: FollowUp) {
  return f.projects?.name && f.projects.name !== '—' ? f.projects.name : 'No project';
}

function whoOf(f: FollowUp) {
  return f.vendors?.name ?? f.projects?.name ?? f.target ?? '';
}

interface ProjectGroup {
  name: string;
  items: FollowUp[];
  bestRank: number;
}

function groupByProject(items: FollowUp[]): ProjectGroup[] {
  const map = new Map<string, FollowUp[]>();
  for (const f of items) {
    const key = projectOf(f);
    const list = map.get(key);
    if (list) list.push(f); else map.set(key, [f]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => rankOf(a) - rankOf(b));
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, items, bestRank: Math.min(...items.map(rankOf)) }))
    .sort((a, b) =>
      Number(a.name === 'No project') - Number(b.name === 'No project') ||
      a.bestRank - b.bestRank ||
      b.items.length - a.items.length,
    );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[st.pill, { borderColor: color }]}>
      <View style={[st.pillDot, { backgroundColor: color }]} />
      <Text style={[st.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function StatCard({ text, value, hint, color }: { text: string; value: number; hint: string; color: string }) {
  const active = value > 0;
  return (
    <View style={[st.stat, active && { borderTopColor: color }]}>
      <View style={st.statHeader}>
        <View style={[st.statDot, { backgroundColor: active ? color : C.inkFaint }]} />
        <Text style={st.statLabel}>{text}</Text>
      </View>
      <Text style={[st.statValue, { color: active ? color : C.inkFaint }]}>{value}</Text>
      <Text style={st.statHint}>{hint}</Text>
    </View>
  );
}

function RowItem({ f, onAction }: { f: FollowUp; onAction: (id: string, action: string, days?: number) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const color = TYPE_TONE[f.type] || C.inkFaint;
  const who = whoOf(f);
  const rank = rankOf(f);

  return (
    <View style={[st.row, rank <= TOP_RANK && { borderLeftColor: C.crit, borderLeftWidth: 3 }]}>
      <View style={st.rowTop}>
        <Pill label={TYPE_LABEL[f.type] || f.type} color={color} />
        <Pressable style={st.dotsBtn} onPress={() => setMenuOpen(true)}>
          <Text style={st.dotsText}>...</Text>
        </Pressable>
      </View>
      <Text style={st.rowReason} numberOfLines={2}>{f.reason || ''}</Text>
      <Text style={st.rowMeta}>
        {who ? `${who} · ` : ''}quiet {ageFrom(f.created_at)}
      </Text>

      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={st.actionOverlay} onPress={() => setMenuOpen(false)}>
          <View style={st.actionSheet}>
            <Pressable style={st.actionItem} onPress={() => { setMenuOpen(false); onAction(f.id, 'done'); }}>
              <Text style={[st.actionText, { fontWeight: '700' }]}>Mark as completed</Text>
            </Pressable>
            <View style={st.actionDivider} />
            <Pressable style={st.actionItem} onPress={() => { setMenuOpen(false); onAction(f.id, 'draft'); }}>
              <Text style={[st.actionText, { color: '#60A5FA' }]}>Draft a reply</Text>
            </Pressable>
            <View style={st.actionDivider} />
            <Text style={st.actionSectionLabel}>SNOOZE</Text>
            {SNOOZE_OPTIONS.map(s => (
              <Pressable key={s.days} style={st.actionItem} onPress={() => { setMenuOpen(false); onAction(f.id, 'snooze', s.days); }}>
                <Text style={st.actionText}>{s.label}</Text>
              </Pressable>
            ))}
            <View style={st.actionDivider} />
            <Pressable style={st.actionItem} onPress={() => { setMenuOpen(false); onAction(f.id, 'dismissed'); }}>
              <Text style={st.actionText}>Dismiss</Text>
            </Pressable>
            <View style={st.actionDivider} />
            <Pressable style={st.actionItem} onPress={() => setMenuOpen(false)}>
              <Text style={[st.actionText, { color: C.inkFaint }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ProjectBox({ group, defaultOpen }: { group: ProjectGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState(group.items);
  const bestColor = TYPE_TONE[items[0]?.type] || C.inkFaint;

  const handleAction = async (id: string, action: string, days?: number) => {
    if (action === 'draft') return; // "Draft a reply" — user opens Drafts from menu
    try {
      if (action === 'snooze') {
        await api(`/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ snoozeDays: days }) });
      } else {
        await api(`/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ status: action }) });
      }
      setItems(prev => prev.filter(f => f.id !== id));
    } catch {}
  };

  if (items.length === 0) return null;

  return (
    <View style={st.projectBox}>
      <Pressable style={st.projectHeader} onPress={() => setOpen(v => !v)}>
        <View style={st.projectHeaderLeft}>
          <Text style={st.chevron}>{open ? '▾' : '▸'}</Text>
          <Text style={st.projectName} numberOfLines={1}>{group.name}</Text>
          <Pill label={TYPE_LABEL[items[0]?.type] || ''} color={bestColor} />
        </View>
        <Text style={st.projectCount}>{items.length} open</Text>
      </Pressable>
      {open && items.map(f => (
        <RowItem key={f.id} f={f} onAction={handleAction} />
      ))}
    </View>
  );
}

function OthersSection({ otherItems, otherGroups }: { otherItems: FollowUp[]; otherGroups: ProjectGroup[] }) {
  const [showOthers, setShowOthers] = useState(true);
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24, marginBottom: 8 }}>
        <View>
          <Text style={st.sectionTitle}>Everything else</Text>
          <Text style={st.sectionSub}>
            {otherItems.length} more across {otherGroups.length} project{otherGroups.length > 1 ? 's' : ''}.
          </Text>
        </View>
        <Pressable onPress={() => setShowOthers(v => !v)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#1E2A40' }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#8C9BB2' }}>{showOthers ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      {showOthers && otherGroups.map(g => <ProjectBox key={g.name} group={g} defaultOpen={false} />)}
    </>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function TopPriorityActions({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError('');
    api<FollowUp[]>(ENDPOINTS.FOLLOW_UPS)
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    if (scope === 'all') return data;
    const myEmail = (user?.email ?? '').trim().toLowerCase();
    const myId = user?.id;
    return data.filter(f => {
      if (f.tasks?.assigned_to) return f.tasks.assigned_to === myId;
      if (f.projects?.assigned_to && f.projects.assigned_to === myId) return true;
      const target = (f.target ?? '').trim().toLowerCase();
      return Boolean(target) && target === myEmail;
    });
  }, [data, scope, user]);

  const topItems = filtered.filter(f => rankOf(f) <= TOP_RANK);
  const otherItems = filtered.filter(f => rankOf(f) > TOP_RANK);
  const topGroups = groupByProject(topItems);
  const otherGroups = groupByProject(otherItems);
  const projectCount = new Set(filtered.map(projectOf)).size;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[st.container, { paddingTop: insets.top }]}>
        <View style={st.header}>
          <Text style={st.headerTitle}>Top Priority Actions</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#2C3A52', overflow: 'hidden' }}>
              <Pressable style={[{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: scope === 'mine' ? '#2563EB' : '#162032' }]} onPress={() => setScope('mine')}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: scope === 'mine' ? '#fff' : '#8C9BB2' }}>Mine</Text>
              </Pressable>
              <Pressable style={[{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: scope === 'all' ? '#2563EB' : '#162032' }]} onPress={() => setScope('all')}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: scope === 'all' ? '#fff' : '#8C9BB2' }}>All {data.length}</Text>
              </Pressable>
            </View>
            <Pressable style={st.closeBtn} onPress={onClose}>
              <Icon name="close" size={16} color="#BFCBDB" />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={st.center}><Loader message="Loading follow-ups..." /></View>
        ) : error ? (
          <View style={st.center}><Text style={st.errorText}>{error}</Text></View>
        ) : data.length === 0 ? (
          <View style={st.center}>
            <Text style={st.emptyTitle}>You're all caught up</Text>
            <Text style={st.emptyText}>
              No follow-ups are waiting. New ones appear here when a vendor goes quiet, a client is left waiting or a task is overdue.
            </Text>
          </View>
        ) : (
          <FlatList
            data={[1]}
            keyExtractor={() => 'content'}
            renderItem={() => (
              <View style={st.content}>
                {/* Stats row */}
                <View style={st.statsRow}>
                  <StatCard text="Top priority" value={topItems.length} hint="Escalated, overdue, slipping" color={C.crit} />
                  <StatCard text="Other" value={otherItems.length} hint="Waiting, stale, reminders" color={C.warn} />
                  <StatCard text="Projects" value={projectCount} hint="Affected" color={C.olive} />
                </View>

                {/* Top priority section */}
                <Text style={st.sectionTitle}>Top priority</Text>
                <Text style={st.sectionSub}>Escalated tasks, overdue approvals and slipping dates.</Text>
                {topGroups.length === 0 ? (
                  <View style={st.emptySection}>
                    <Text style={st.emptySectionText}>Nothing urgent right now. Everything waiting is below.</Text>
                  </View>
                ) : (
                  topGroups.map((g, i) => <ProjectBox key={g.name} group={g} defaultOpen={i === 0} />)
                )}

                {/* Everything else */}
                {otherGroups.length > 0 && (
                  <OthersSection otherItems={otherItems} otherGroups={otherGroups} />
                )}

                <Text style={st.footer}>Nothing is auto-sent. A snoozed nudge returns on its own.</Text>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
          />
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#0F1B2D' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 14, color: C.inkSoft, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: C.crit, fontSize: 14, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.ink, marginBottom: 8 },
  emptyText: { fontSize: 13, color: C.inkSoft, textAlign: 'center', lineHeight: 20 },
  content: { padding: 16 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  stat: { flex: 1, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderTopWidth: 3, borderTopColor: C.line, padding: 12 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 8, height: 8, borderRadius: 3 },
  statLabel: { fontSize: 10, fontWeight: '600', color: C.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: '700', marginTop: 4 },
  statHint: { fontSize: 10, color: C.inkFaint, marginTop: 2 },

  // Sections
  sectionTitle: { fontSize: 17, fontWeight: '600', color: C.ink, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: C.inkSoft, marginBottom: 12 },
  emptySection: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 20, alignItems: 'center' },
  emptySectionText: { fontSize: 13, color: C.inkSoft, textAlign: 'center' },

  // Project box
  projectBox: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginBottom: 10, overflow: 'hidden' },
  projectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(30,42,64,0.4)' },
  projectHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  chevron: { fontSize: 14, color: C.inkFaint },
  projectName: { fontSize: 15, fontWeight: '600', color: C.ink, flexShrink: 1 },
  projectCount: { fontSize: 12, color: C.inkFaint },

  // Row
  row: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.lineSoft },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  rowReason: { fontSize: 13, color: C.ink, lineHeight: 19 },
  rowMeta: { fontSize: 12, color: C.inkFaint, marginTop: 4 },
  dotsBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.sunk, alignItems: 'center', justifyContent: 'center' },
  dotsText: { fontSize: 16, color: C.inkSoft, fontWeight: '700', marginTop: -4 },

  // Pill
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },

  // Action sheet
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34, paddingTop: 8 },
  actionItem: { paddingHorizontal: 20, paddingVertical: 14 },
  actionText: { fontSize: 16, color: C.ink },
  actionDivider: { height: 1, backgroundColor: C.lineSoft, marginHorizontal: 16 },
  actionSectionLabel: { fontSize: 11, fontWeight: '600', color: C.inkFaint, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, letterSpacing: 0.5 },

  footer: { fontSize: 12, color: C.inkFaint, textAlign: 'center', marginTop: 20 },
});
