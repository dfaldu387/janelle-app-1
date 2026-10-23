import { showAlert } from '../components/DarkAlert';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
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
  brass: '#2563EB', brassDeep: '#60A5FA', good: '#4ADE80', crit: '#F87171', warn: '#FBBF24', olive: '#A78BFA',
};

const STATUS_DOT: Record<string, string> = {
  open: C.inkFaint, in_progress: C.olive, blocked: C.crit, done: C.good,
};
const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
};
const CATEGORY_LABELS: Record<string, string> = {
  design: 'Design', procurement: 'Procurement', ff_and_e: 'FF&E',
  client_communication: 'Client Comms', admin: 'Admin', installation: 'Installation',
};
const CATEGORY_KEYS = ['design', 'procurement', 'ff_and_e', 'client_communication', 'admin', 'installation'];
const KIND_LABELS: Record<string, string> = {
  quote_request: 'Quote request', order_followup: 'Order follow-up',
  client_approval: 'Client approval', spec_review: 'Spec review',
  scheduling: 'Scheduling', admin: 'Admin',
};
const HISTORY_LABELS: Record<string, string> = {
  reminder: 'Reminder sent', escalation: 'Escalated', nudge: 'Nudge sent',
  overdue: 'Marked overdue', stale: 'Flagged stale',
};

interface Task {
  id: string; title: string; status: string; category?: string; kind?: string;
  assignee?: string; owner?: string; assigned_to?: string;
  due?: string; due_date?: string; project?: string; project_id?: string;
  next_step?: string; detail?: string; completed_at?: string;
  created_at?: string; completion_note?: string;
}
interface TeamMember { id: string; full_name: string | null; email: string | null }
interface Project { id: string; name: string }
interface Comment { id: string; body: string; created_at: string; author: string; profiles?: { full_name: string | null } }
interface HistoryItem { id: string; type: string; reason?: string; created_at: string }
interface TaskDetail {
  task: Task;
  comments: Comment[];
  history: HistoryItem[];
  commentsAvailable: boolean;
}

const STATUSES = ['open', 'in_progress', 'blocked', 'done'];

type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'next7';
const DUE_OPTIONS: { v: DueFilter; label: string }[] = [
  { v: 'any', label: 'Any due date' },
  { v: 'overdue', label: 'Overdue' },
  { v: 'today', label: 'Due today' },
  { v: 'week', label: 'This week' },
  { v: 'next7', label: 'Next 7 days' },
];

const KIND_KEYS = ['quote_request', 'order_followup', 'client_approval', 'spec_review', 'scheduling', 'admin'];

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function shortDate(s: string) { return s?.slice(0, 10) || ''; }

function daysEarly(dueDate: string | null, completedAt: string | null): number | null {
  if (!dueDate || !completedAt) return null;
  const due = new Date(dueDate.slice(0, 10));
  const done = new Date(completedAt.slice(0, 10));
  return Math.round((due.getTime() - done.getTime()) / 86400000);
}

function finishedLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return 'on its due date';
  const n = Math.abs(days);
  return `${n} day${n === 1 ? '' : 's'} ${days > 0 ? 'early' : 'late'}`;
}

function dueMatches(t: Task, due: DueFilter): boolean {
  const d = t.due || t.due_date;
  if (due === 'any') return true;
  if (!d) return false;
  const dueDate = d.slice(0, 10);
  const now = new Date();
  const today = isoDay(now);
  if (due === 'overdue') return dueDate < today && t.status !== 'done';
  if (due === 'today') return dueDate === today;
  if (due === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return dueDate >= isoDay(start) && dueDate <= isoDay(end);
  }
  if (due === 'next7') {
    const end = new Date(now); end.setDate(now.getDate() + 7);
    return dueDate >= today && dueDate <= isoDay(end);
  }
  return true;
}

interface Props { visible: boolean; onClose: () => void }

export default function TasksPage({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [dueFilter, setDueFilter] = useState<DueFilter>('any');
  const [personFilter, setPersonFilter] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail panel state
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  // Create task state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newKind, setNewKind] = useState('admin');
  const [newCategory, setNewCategory] = useState('admin');
  const [newDue, setNewDue] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<Task[]>(ENDPOINTS.TASKS)
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
    // Load team & projects for dropdowns
    api<TeamMember[]>(ENDPOINTS.TEAM).then(d => setTeam(Array.isArray(d) ? d : [])).catch(() => {});
    api<Project[]>(ENDPOINTS.PROJECTS).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Load task detail when selected
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await api<TaskDetail>(ENDPOINTS.TASKS + `/${id}`);
      setDetail(d);
    } catch { /* detail is optional enhancement */ }
    finally { setDetailLoading(false); }
  }, []);

  const openTask = useCallback((t: Task) => {
    setSelectedTask(t);
    setEditField(null);
    setCommentText('');
    loadDetail(t.id);
  }, [loadDetail]);

  const categories = useMemo(() => [...new Set(data.map(t => t.category).filter(Boolean))].sort() as string[], [data]);
  const people = useMemo(() => {
    const names = new Set<string>();
    data.forEach(t => { const n = t.assignee || t.owner; if (n) names.add(n); });
    return [...names].sort();
  }, [data]);

  const filtered = useMemo(() => {
    let items = data;
    if (scope === 'mine' && user?.id) {
      items = items.filter(t => t.assigned_to === user.id || !t.assigned_to);
    }
    if (personFilter === 'unassigned') {
      items = items.filter(t => !t.assigned_to && !t.assignee && !t.owner);
    } else if (personFilter) {
      items = items.filter(t => (t.assignee || t.owner) === personFilter);
    }
    if (statusFilter.length) items = items.filter(t => statusFilter.includes(t.status));
    if (categoryFilter.length) items = items.filter(t => t.category && categoryFilter.includes(t.category));
    items = items.filter(t => dueMatches(t, dueFilter));
    if (search.trim()) {
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter(t => {
        const hay = [t.title, t.detail, t.next_step, t.project, t.assignee || t.owner,
          t.category ? CATEGORY_LABELS[t.category] || t.category : '',
          t.kind ? KIND_LABELS[t.kind] || t.kind : '',
          STATUS_LABEL[t.status] || t.status,
        ].join(' ').toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }
    return items;
  }, [data, search, statusFilter, categoryFilter, dueFilter, personFilter, scope, user]);

  const activeFilterCount = (statusFilter.length ? 1 : 0) + (categoryFilter.length ? 1 : 0) + (dueFilter !== 'any' ? 1 : 0) + (personFilter ? 1 : 0);

  const updateTask = async (id: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api(ENDPOINTS.TASKS + `/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setData(prev => prev.map(t => t.id === id ? { ...t, ...patch } as Task : t));
      if (selectedTask?.id === id) setSelectedTask(prev => prev ? { ...prev, ...patch } as Task : null);
      setEditField(null);
    } catch (e) { showAlert('Error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const deleteTask = async (id: string) => {
    setSaving(true);
    try {
      await api(ENDPOINTS.TASKS + `/${id}`, { method: 'DELETE' });
      setData(prev => prev.filter(t => t.id !== id));
      setSelectedTask(null);
    } catch (e) { showAlert('Error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const [doneConfirmId, setDoneConfirmId] = useState<string | null>(null);
  const doneConfirmTask = doneConfirmId ? data.find(t => t.id === doneConfirmId) : null;

  const markDone = (id: string) => setDoneConfirmId(id);
  const confirmDone = () => {
    if (doneConfirmId) updateTask(doneConfirmId, { status: 'done' });
    setDoneConfirmId(null);
  };

  const addComment = async () => {
    if (!commentText.trim() || !selectedTask) return;
    setCommentSaving(true);
    try {
      const res = await api<{ comment: Comment }>(ENDPOINTS.TASKS + `/${selectedTask.id}/comments`, {
        method: 'POST', body: JSON.stringify({ body: commentText.trim() }),
      });
      if (detail) {
        setDetail({ ...detail, comments: [...detail.comments, res.comment] });
      }
      setCommentText('');
    } catch (e) { showAlert('Error', (e as Error).message); }
    finally { setCommentSaving(false); }
  };

  const deleteComment = async (commentId: string) => {
    if (!selectedTask) return;
    try {
      await api(ENDPOINTS.TASKS + `/${selectedTask.id}/comments/${commentId}`, { method: 'DELETE' });
      if (detail) {
        setDetail({ ...detail, comments: detail.comments.filter(c => c.id !== commentId) });
      }
    } catch (e) { showAlert('Error', (e as Error).message); }
  };

  const saveEditComment = async (commentId: string) => {
    if (!editCommentText.trim() || !selectedTask) return;
    setCommentSaving(true);
    try {
      const res = await api<Comment>(ENDPOINTS.TASKS + `/${selectedTask.id}/comments/${commentId}`, {
        method: 'PATCH', body: JSON.stringify({ body: editCommentText.trim() }),
      });
      if (detail) {
        setDetail({ ...detail, comments: detail.comments.map(c => c.id === commentId ? { ...c, body: editCommentText.trim() } : c) });
      }
      setEditingComment(null);
    } catch (e) { showAlert('Error', (e as Error).message); }
    finally { setCommentSaving(false); }
  };

  const createTask = async () => {
    if (!newTitle.trim()) { showAlert('Error', 'Title is required'); return; }
    setCreating(true);
    try {
      const res = await api<{ id: string }>(ENDPOINTS.TASKS, {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          detail: newDetail.trim() || undefined,
          kind: newKind,
          category: newCategory,
          due_date: newDue || undefined,
        }),
      });
      // Reload task list
      const d = await api<Task[]>(ENDPOINTS.TASKS);
      setData(Array.isArray(d) ? d : []);
      setCreateOpen(false);
      setNewTitle(''); setNewDetail(''); setNewKind('admin'); setNewCategory('admin'); setNewDue('');
    } catch (e) { showAlert('Error', (e as Error).message); }
    finally { setCreating(false); }
  };

  const clearAllFilters = () => {
    setStatusFilter([]); setCategoryFilter([]); setDueFilter('any'); setPersonFilter(''); setSearch('');
  };

  const toggleStatus = (s: string) => setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleCategory = (c: string) => setCategoryFilter(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const columns = useMemo(() =>
    STATUSES.map(status => ({
      status,
      label: STATUS_LABEL[status] || status,
      dot: STATUS_DOT[status] || C.inkFaint,
      items: filtered.filter(t => t.status === status),
    })),
  [filtered]);

  // Long-press "Move to" — the standard mobile pattern for moving cards between columns
  const showMoveTo = useCallback((t: Task) => {
    const targets = STATUSES.filter(s => s !== t.status);
    showAlert(
      `Move "${t.title}"`,
      'Move to which column?',
      [
        ...targets.map(s => ({
          text: STATUS_LABEL[s],
          onPress: () => updateTask(t.id, { status: s }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [updateTask]);

  const renderCard = (t: Task) => {
    const dot = STATUS_DOT[t.status] || C.inkFaint;
    const due = t.due || t.due_date;
    const assignee = t.assignee || t.owner || '';
    const initial = assignee ? assignee.split(' ').map(n => n[0]).join('').slice(0, 2) : '';
    return (
      <Pressable
        key={t.id}
        onPress={() => openTask(t)}
        onLongPress={() => showMoveTo(t)}
        delayLongPress={300}
      >
        <View style={st.card}>
          <View style={st.cardHeader}>
            <View style={[st.cardDot, { backgroundColor: dot }]} />
            <Text style={st.cardTitle} numberOfLines={2}>{t.title}</Text>
            {t.status !== 'done' && (
              <Pressable style={st.doneBtn} onPress={() => markDone(t.id)} hitSlop={8}>
                <Icon name="checkmark-done" size={13} color={C.good} />
              </Pressable>
            )}
          </View>
          {t.next_step && <Text style={st.cardDetail} numberOfLines={1}>{t.next_step}</Text>}
          <View style={st.cardFooter}>
            <View style={st.cardMeta}>
              {due && <Text style={[st.cardDue, t.status !== 'done' && new Date(due) < new Date() && { color: C.crit }]}>{due}</Text>}
              {t.status === 'done' && t.completed_at && <Text style={[st.cardDue, { color: C.good }]}>Done {shortDate(t.completed_at)}{finishedLabel(daysEarly(t.due_date || t.due || null, t.completed_at)) ? ` · ${finishedLabel(daysEarly(t.due_date || t.due || null, t.completed_at))}` : ''}</Text>}
              {t.project && <Text style={st.cardProject} numberOfLines={1}>{t.project}</Text>}
            </View>
            {initial ? (
              <View style={st.avatar}><Text style={st.avatarText}>{initial}</Text></View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  // Assign picker
  const showAssignPicker = () => {
    if (!selectedTask) return;
    const options = [
      { text: 'Unassigned', onPress: () => updateTask(selectedTask.id, { assigned_to: null }) },
      ...team.map(m => ({
        text: m.full_name || m.email || m.id,
        onPress: () => updateTask(selectedTask.id, { assigned_to: m.id }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    showAlert('Assign to', 'Choose a team member', options);
  };

  // Project picker
  const showProjectPicker = () => {
    if (!selectedTask) return;
    const options = [
      { text: 'No project', onPress: () => updateTask(selectedTask.id, { project_id: null }) },
      ...projects.map(p => ({
        text: p.name,
        onPress: () => updateTask(selectedTask.id, { project_id: p.id }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    showAlert('Change project', 'Choose a project', options);
  };

  // Category picker
  const showCategoryPicker = () => {
    if (!selectedTask) return;
    const options = [
      ...CATEGORY_KEYS.map(k => ({
        text: CATEGORY_LABELS[k] || k,
        onPress: () => updateTask(selectedTask.id, { category: k }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    showAlert('Change category', 'Choose a category', options);
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Tasks</Text>
        <View style={st.headerRight}>
          <View style={st.scopeToggle}>
            <Pressable style={[st.scopeBtn, scope === 'mine' && st.scopeBtnActive]} onPress={() => setScope('mine')}>
              <Text style={[st.scopeBtnText, scope === 'mine' && st.scopeBtnTextActive]}>Mine</Text>
            </Pressable>
            <Pressable style={[st.scopeBtn, scope === 'all' && st.scopeBtnActive]} onPress={() => setScope('all')}>
              <Text style={[st.scopeBtnText, scope === 'all' && st.scopeBtnTextActive]}>All</Text>
            </Pressable>
          </View>
          <Pressable style={[st.closeBtn, { backgroundColor: C.brass, borderColor: C.brass }]} onPress={() => setCreateOpen(true)}>
            <Icon name="add" size={18} color="#fff" />
          </Pressable>
          <Pressable style={st.closeBtn} onPress={onClose}>
            <Icon name="close" size={16} color={C.inkSoft} />
          </Pressable>
        </View>
      </View>

      {/* Toolbar */}
      <View style={st.toolbar}>
        <View style={st.searchWrap}>
          <Icon name="search-outline" size={14} color={C.inkFaint} />
          <TextInput
            style={st.searchInput}
            placeholder="Search tasks..."
            placeholderTextColor={C.inkFaint}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Pressable style={[st.filterBtn, activeFilterCount > 0 && st.filterBtnActive]} onPress={() => setFiltersOpen(v => !v)}>
          <Icon name="funnel-outline" size={14} color={activeFilterCount > 0 ? '#fff' : C.inkFaint} />
          {activeFilterCount > 0 && <Text style={st.filterBadge}>{activeFilterCount}</Text>}
        </Pressable>
        <View style={st.viewToggle}>
          <Pressable style={[st.viewBtn, view === 'board' && st.viewBtnActive]} onPress={() => setView('board')}>
            <Icon name="grid-outline" size={14} color={view === 'board' ? '#fff' : C.inkFaint} />
          </Pressable>
          <Pressable style={[st.viewBtn, view === 'list' && st.viewBtnActive]} onPress={() => setView('list')}>
            <Icon name="list-outline" size={14} color={view === 'list' ? '#fff' : C.inkFaint} />
          </Pressable>
        </View>
      </View>

      {/* Filter panel */}
      {filtersOpen && (
        <View style={st.filterPanel}>
          <Text style={st.filterLabel}>Status</Text>
          <View style={st.chipRow}>
            {STATUSES.map(s => (
              <Pressable key={s} style={[st.filterChip, statusFilter.includes(s) && st.filterChipActive]} onPress={() => toggleStatus(s)}>
                <View style={[st.filterDot, { backgroundColor: STATUS_DOT[s] }]} />
                <Text style={[st.filterChipText, statusFilter.includes(s) && st.filterChipTextActive]}>{STATUS_LABEL[s]}</Text>
              </Pressable>
            ))}
          </View>
          {categories.length > 0 && (
            <>
              <Text style={st.filterLabel}>Category</Text>
              <View style={st.chipRow}>
                {categories.map(c => (
                  <Pressable key={c} style={[st.filterChip, categoryFilter.includes(c) && st.filterChipActive]} onPress={() => toggleCategory(c)}>
                    <Text style={[st.filterChipText, categoryFilter.includes(c) && st.filterChipTextActive]}>{CATEGORY_LABELS[c] || c}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Text style={st.filterLabel}>Due date</Text>
          <View style={st.chipRow}>
            {DUE_OPTIONS.map(o => (
              <Pressable key={o.v} style={[st.filterChip, dueFilter === o.v && st.filterChipActive]} onPress={() => setDueFilter(dueFilter === o.v ? 'any' : o.v)}>
                <Text style={[st.filterChipText, dueFilter === o.v && st.filterChipTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          {people.length > 0 && (
            <>
              <Text style={st.filterLabel}>Person</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={st.chipRow}>
                  <Pressable style={[st.filterChip, personFilter === 'unassigned' && st.filterChipActive]} onPress={() => setPersonFilter(personFilter === 'unassigned' ? '' : 'unassigned')}>
                    <Text style={[st.filterChipText, personFilter === 'unassigned' && st.filterChipTextActive]}>Unassigned</Text>
                  </Pressable>
                  {people.map(p => (
                    <Pressable key={p} style={[st.filterChip, personFilter === p && st.filterChipActive]} onPress={() => setPersonFilter(personFilter === p ? '' : p)}>
                      <Text style={[st.filterChipText, personFilter === p && st.filterChipTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
          {activeFilterCount > 0 && (
            <Pressable style={st.clearBtn} onPress={clearAllFilters}>
              <Text style={st.clearBtnText}>Clear all filters</Text>
            </Pressable>
          )}
          <Text style={st.filterCount}>{filtered.length} of {data.length} tasks</Text>
        </View>
      )}

      {loading ? (
        <View style={st.center}><Loader message="Loading tasks..." /></View>
      ) : error ? (
        <View style={st.center}><Text style={st.errorText}>{error}</Text></View>
      ) : view === 'board' ? (
        <>
          <Text style={{ fontSize: 11, color: C.inkFaint, textAlign: 'center', paddingVertical: 4 }}>Long-press a card to move it to another column</Text>
          <FlatList
            horizontal
            data={columns}
            keyExtractor={col => col.status}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.boardContainer}
            renderItem={({ item: col }) => (
              <View style={st.column}>
                <View style={[st.columnHeader, { borderTopColor: col.dot }]}>
                  <View style={[st.columnDot, { backgroundColor: col.dot }]} />
                  <Text style={st.columnLabel}>{col.label}</Text>
                  <Text style={st.columnCount}>{col.items.length}</Text>
                </View>
                <FlatList
                  data={col.items}
                  keyExtractor={t => t.id}
                  renderItem={({ item }) => renderCard(item)}
                  contentContainerStyle={st.columnContent}
                  ListEmptyComponent={<Text style={st.emptyCol}>No tasks</Text>}
                />
              </View>
            )}
          />
        </>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          renderItem={({ item: t }) => {
            const dot = STATUS_DOT[t.status] || C.inkFaint;
            const due = t.due || t.due_date;
            const assignee = t.assignee || t.owner || '';
            return (
              <Pressable onPress={() => openTask(t)}>
                <View style={st.listRow}>
                  <View style={[st.listDot, { backgroundColor: dot }]} />
                  <View style={st.listContent}>
                    <Text style={st.listTitle} numberOfLines={1}>{t.title}</Text>
                    <View style={st.listMeta}>
                      {assignee ? <Text style={st.listMetaText}>{assignee}</Text> : null}
                      {t.project ? <Text style={st.listMetaText}>{t.project}</Text> : null}
                      {due ? <Text style={[st.listMetaText, t.status !== 'done' && new Date(due) < new Date() && { color: C.crit }]}>{due}</Text> : null}
                      {t.status === 'done' && t.completed_at ? <Text style={[st.listMetaText, { color: C.good }]}>Done {shortDate(t.completed_at)}{finishedLabel(daysEarly(t.due_date || t.due || null, t.completed_at)) ? ` · ${finishedLabel(daysEarly(t.due_date || t.due || null, t.completed_at))}` : ''}</Text> : null}
                    </View>
                  </View>
                  {t.status !== 'done' ? (
                    <Pressable style={st.doneBtn} onPress={() => markDone(t.id)} hitSlop={8}>
                      <Icon name="checkmark-done" size={14} color={C.good} />
                    </Pressable>
                  ) : (
                    <View style={[st.statusPill, { borderColor: dot }]}>
                      <Text style={[st.statusPillText, { color: dot }]}>{STATUS_LABEL[t.status]}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={[st.listContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}
          ListEmptyComponent={<View style={st.center}><Text style={st.emptyText}>No tasks match your filters.</Text></View>}
        />
      )}

      {/* Create Task Modal */}
      {createOpen && (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={[st.container, { paddingTop: insets.top }]}>
            <View style={st.header}>
              <Text style={st.headerTitle}>New Task</Text>
              <Pressable style={st.closeBtn} onPress={() => setCreateOpen(false)}>
                <Icon name="close" size={16} color={C.inkSoft} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 30) }}>
              <Text style={st.detailLabel}>Title *</Text>
              <TextInput
                style={{ fontSize: 14, color: C.ink, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 16 }}
                placeholder="What needs to be done?"
                placeholderTextColor={C.inkFaint}
                value={newTitle} onChangeText={setNewTitle} autoFocus
              />

              <Text style={st.detailLabel}>Detail</Text>
              <TextInput
                style={{ fontSize: 14, color: C.ink, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 16, minHeight: 60 }}
                placeholder="Optional details..."
                placeholderTextColor={C.inkFaint}
                value={newDetail} onChangeText={setNewDetail} multiline
              />

              <Text style={st.detailLabel}>Kind</Text>
              <View style={[st.chipRow, { marginBottom: 16 }]}>
                {KIND_KEYS.map(k => (
                  <Pressable key={k} style={[st.filterChip, newKind === k && st.filterChipActive]} onPress={() => setNewKind(k)}>
                    <Text style={[st.filterChipText, newKind === k && st.filterChipTextActive]}>{KIND_LABELS[k]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={st.detailLabel}>Category</Text>
              <View style={[st.chipRow, { marginBottom: 16 }]}>
                {CATEGORY_KEYS.map(k => (
                  <Pressable key={k} style={[st.filterChip, newCategory === k && st.filterChipActive]} onPress={() => setNewCategory(k)}>
                    <Text style={[st.filterChipText, newCategory === k && st.filterChipTextActive]}>{CATEGORY_LABELS[k]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={st.detailLabel}>Due date (YYYY-MM-DD)</Text>
              <TextInput
                style={{ fontSize: 14, color: C.ink, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 24 }}
                placeholder="2024-12-31"
                placeholderTextColor={C.inkFaint}
                value={newDue} onChangeText={setNewDue}
              />

              <Pressable
                style={{ backgroundColor: C.brass, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
                onPress={createTask} disabled={creating || !newTitle.trim()}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{creating ? 'Creating...' : 'Create Task'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={[st.container, { paddingTop: insets.top }]}>
            <View style={st.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                  <View style={[st.filterChip, st.filterChipActive, { paddingVertical: 2 }]}><Text style={[st.filterChipText, st.filterChipTextActive]}>{KIND_LABELS[selectedTask.kind || ''] || selectedTask.kind || 'Task'}</Text></View>
                  <View style={[st.filterChip, { paddingVertical: 2 }]}><Text style={st.filterChipText}>{STATUS_LABEL[selectedTask.status] || selectedTask.status}</Text></View>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{selectedTask.title}</Text>
              </View>
              <Pressable style={st.closeBtn} onPress={() => { setSelectedTask(null); setEditField(null); setDetail(null); }}>
                <Icon name="close" size={16} color={C.inkSoft} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 30) }}>
              {selectedTask.detail && <Text style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 21, marginBottom: 16 }}>{selectedTask.detail}</Text>}

              {/* Fields grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                {/* Owner - tappable to change */}
                <View style={{ width: '45%' }}>
                  <Text style={st.detailLabel}>Owner</Text>
                  <Pressable onPress={showAssignPicker}>
                    <Text style={[st.detailValue, { color: C.brassDeep }]}>{selectedTask.assignee || selectedTask.owner || 'Unassigned'}</Text>
                    <Text style={{ fontSize: 10, color: C.inkFaint }}>tap to change</Text>
                  </Pressable>
                </View>
                {/* Due - tappable to edit */}
                <View style={{ width: '45%' }}>
                  <Text style={st.detailLabel}>Due</Text>
                  <Pressable onPress={() => { setEditField('due_date'); setEditValue(selectedTask.due || selectedTask.due_date || ''); }}>
                    <Text style={[st.detailValue, { color: C.brassDeep }]}>{selectedTask.due || selectedTask.due_date || 'No due date'}</Text>
                    <Text style={{ fontSize: 10, color: C.inkFaint }}>tap to edit</Text>
                  </Pressable>
                </View>
                {/* Project - tappable to change */}
                <View style={{ width: '45%' }}>
                  <Text style={st.detailLabel}>Project</Text>
                  <Pressable onPress={showProjectPicker}>
                    <Text style={[st.detailValue, { color: C.brassDeep }]}>{selectedTask.project || '— none —'}</Text>
                    <Text style={{ fontSize: 10, color: C.inkFaint }}>tap to change</Text>
                  </Pressable>
                </View>
                {/* Category - tappable to change */}
                <View style={{ width: '45%' }}>
                  <Text style={st.detailLabel}>Category</Text>
                  <Pressable onPress={showCategoryPicker}>
                    <Text style={[st.detailValue, { color: C.brassDeep }]}>{CATEGORY_LABELS[selectedTask.category || ''] || selectedTask.category || '— none —'}</Text>
                    <Text style={{ fontSize: 10, color: C.inkFaint }}>tap to change</Text>
                  </Pressable>
                </View>
                {/* Created */}
                {selectedTask.created_at && (
                  <View style={{ width: '45%' }}>
                    <Text style={st.detailLabel}>Raised</Text>
                    <Text style={st.detailValue}>{shortDate(selectedTask.created_at)}</Text>
                  </View>
                )}
              </View>

              {/* Edit due date */}
              {editField === 'due_date' && (
                <View style={{ backgroundColor: C.sunk, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: C.line }}>
                  <Text style={st.detailLabel}>Due date (YYYY-MM-DD)</Text>
                  <TextInput style={{ fontSize: 14, color: C.ink, backgroundColor: C.surface, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 10, marginTop: 6 }}
                    value={editValue} onChangeText={setEditValue} placeholder="2024-12-31" placeholderTextColor={C.inkFaint} autoFocus />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, backgroundColor: C.brass }}
                      onPress={() => updateTask(selectedTask.id, { due_date: editValue || null })} disabled={saving}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{saving ? 'Saving...' : 'Save'}</Text>
                    </Pressable>
                    <Pressable style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line }}
                      onPress={() => setEditField(null)}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: C.inkFaint }}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Next step */}
              <View style={{ marginBottom: 16 }}>
                <Text style={st.detailSectionTitle}>Next step</Text>
                {selectedTask.next_step ? (
                  <Text style={{ fontSize: 13.5, color: C.ink }}>{selectedTask.next_step}</Text>
                ) : (
                  <Text style={{ fontSize: 13, color: C.warn }}>None written down.</Text>
                )}
              </View>

              {/* Completed info */}
              {selectedTask.status === 'done' && selectedTask.completed_at && (
                <View style={{ marginBottom: 16, backgroundColor: 'rgba(74,222,128,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)' }}>
                  <Text style={{ fontSize: 13, color: C.good, fontWeight: '600' }}>
                    Completed {shortDate(selectedTask.completed_at)}
                    {finishedLabel(daysEarly(selectedTask.due_date || selectedTask.due || null, selectedTask.completed_at!)) ? ` · ${finishedLabel(daysEarly(selectedTask.due_date || selectedTask.due || null, selectedTask.completed_at!))}` : ''}
                  </Text>
                  {selectedTask.completion_note && <Text style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>{selectedTask.completion_note}</Text>}
                </View>
              )}

              {/* Status actions */}
              <View style={{ marginBottom: 16 }}>
                <Text style={st.detailSectionTitle}>Change status</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {STATUSES.map(s => (
                    <Pressable key={s} style={[st.filterChip, selectedTask.status === s && st.filterChipActive]}
                      onPress={() => selectedTask.status !== s ? updateTask(selectedTask.id, { status: s }) : null}>
                      <View style={[st.filterDot, { backgroundColor: STATUS_DOT[s] }]} />
                      <Text style={[st.filterChipText, selectedTask.status === s && st.filterChipTextActive]}>{STATUS_LABEL[s]}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Comments */}
              <View style={{ marginBottom: 16 }}>
                <Text style={st.detailSectionTitle}>Comments</Text>
                {detailLoading && <Text style={{ fontSize: 12, color: C.inkFaint }}>Loading...</Text>}
                {detail?.commentsAvailable === false && (
                  <Text style={{ fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>Comments not available yet.</Text>
                )}
                {(detail?.comments ?? []).length > 0 && (
                  <View style={{ gap: 10, marginBottom: 12 }}>
                    {detail!.comments.map(c => (
                      <View key={c.id} style={{ backgroundColor: C.sunk, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.lineSoft }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.ink }}>{c.profiles?.full_name || 'Team member'}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 10, color: C.inkFaint }}>{shortDate(c.created_at)}</Text>
                            {c.author === user?.id && (
                              <>
                                <Pressable hitSlop={8} onPress={() => { setEditingComment(c.id); setEditCommentText(c.body); }}>
                                  <Icon name="create-outline" size={12} color={C.inkFaint} />
                                </Pressable>
                                <Pressable hitSlop={8} onPress={() => showAlert('Delete comment?', '', [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Delete', style: 'destructive', onPress: () => deleteComment(c.id) },
                                ])}>
                                  <Icon name="trash-outline" size={12} color={C.inkFaint} />
                                </Pressable>
                              </>
                            )}
                          </View>
                        </View>
                        {editingComment === c.id ? (
                          <View style={{ gap: 8 }}>
                            <TextInput
                              style={{ fontSize: 13, color: C.ink, backgroundColor: C.surface, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 8 }}
                              value={editCommentText} onChangeText={setEditCommentText} multiline autoFocus
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.brass }}
                                onPress={() => saveEditComment(c.id)} disabled={commentSaving}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{commentSaving ? 'Saving...' : 'Save'}</Text>
                              </Pressable>
                              <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line }}
                                onPress={() => setEditingComment(null)}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: C.inkFaint }}>Cancel</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 13, color: C.inkSoft, lineHeight: 19 }}>{c.body}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
                {detail?.commentsAvailable !== false && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <TextInput
                      style={{ flex: 1, fontSize: 13, color: C.ink, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 10, maxHeight: 80 }}
                      placeholder="Add a comment..."
                      placeholderTextColor={C.inkFaint}
                      value={commentText}
                      onChangeText={setCommentText}
                      multiline
                    />
                    <Pressable
                      style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: commentText.trim() ? C.brass : C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: commentText.trim() ? C.brass : C.line }}
                      onPress={addComment}
                      disabled={!commentText.trim() || commentSaving}>
                      <Icon name="send" size={16} color={commentText.trim() ? '#fff' : C.inkFaint} />
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Progress / History timeline */}
              <View style={{ marginBottom: 16 }}>
                <Text style={st.detailSectionTitle}>Progress</Text>
                <View style={{ borderLeftWidth: 2, borderLeftColor: C.lineSoft, paddingLeft: 14, gap: 10 }}>
                  {/* Created */}
                  {selectedTask.created_at && (
                    <View style={{ position: 'relative' }}>
                      <View style={{ position: 'absolute', left: -19, top: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.brass }} />
                      <Text style={{ fontSize: 13, color: C.inkSoft }}>Raised {shortDate(selectedTask.created_at)}</Text>
                    </View>
                  )}
                  {/* History items */}
                  {(detail?.history ?? []).map(h => (
                    <View key={h.id} style={{ position: 'relative' }}>
                      <View style={{ position: 'absolute', left: -19, top: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.warn }} />
                      <Text style={{ fontSize: 13, color: C.inkSoft }}>{HISTORY_LABELS[h.type] || h.type} {shortDate(h.created_at)}</Text>
                      {h.reason && <Text style={{ fontSize: 12, color: C.inkFaint }}>{h.reason}</Text>}
                    </View>
                  ))}
                  {/* Completed */}
                  {selectedTask.status === 'done' && (
                    <View style={{ position: 'relative' }}>
                      <View style={{ position: 'absolute', left: -19, top: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.good }} />
                      <Text style={{ fontSize: 13, color: C.inkSoft }}>
                        {selectedTask.completion_note ? 'Closed automatically' : 'Closed'}
                        {selectedTask.completed_at ? ` ${shortDate(selectedTask.completed_at)}` : ''}
                      </Text>
                      {selectedTask.completion_note && <Text style={{ fontSize: 12, color: C.inkFaint }}>{selectedTask.completion_note}</Text>}
                    </View>
                  )}
                  {!detailLoading && (detail?.history ?? []).length === 0 && selectedTask.status !== 'done' && (
                    <Text style={{ fontSize: 12, color: C.inkFaint }}>No reminders or escalations yet.</Text>
                  )}
                </View>
              </View>

              {/* Delete task */}
              <Pressable style={{ marginBottom: 30, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(248,113,113,0.1)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' }}
                onPress={() => showAlert('Delete task', `Delete "${selectedTask.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteTask(selectedTask.id) },
                ])}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="trash-outline" size={14} color={C.crit} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.crit }}>Delete task</Text>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </Modal>
      )}
      {/* Mark as Done — themed modal */}
      {doneConfirmTask && (
        <Modal visible transparent animationType="fade">
          <Pressable style={st.doneOverlay} onPress={() => setDoneConfirmId(null)}>
            <View style={st.doneSheet}>
              <View style={st.doneIcon}>
                <Icon name="checkmark-done" size={28} color={C.good} />
              </View>
              <Text style={st.doneTitle}>Mark as done</Text>
              <Text style={st.doneTaskName} numberOfLines={2}>{doneConfirmTask.title}</Text>
              <Text style={st.doneSubtext}>This task will be moved to Done.</Text>
              <Pressable style={st.doneConfirmBtn} onPress={confirmDone}>
                <Icon name="checkmark-circle" size={18} color="#fff" />
                <Text style={st.doneConfirmText}>Complete Task</Text>
              </Pressable>
              <Pressable style={st.doneCancelBtn} onPress={() => setDoneConfirmId(null)}>
                <Text style={st.doneCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: C.crit, fontSize: 14, textAlign: 'center' },
  emptyText: { color: C.inkFaint, fontSize: 14 },

  // Toolbar
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, gap: 6 },
  searchInput: { flex: 1, fontSize: 13, color: C.ink, padding: 0 },
  filterBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  filterBtnActive: { backgroundColor: C.brass, borderColor: C.brass },
  filterBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: C.crit, alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: '700', textAlign: 'center', lineHeight: 16, overflow: 'hidden' },
  viewToggle: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  viewBtn: { width: 36, height: 36, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  viewBtnActive: { backgroundColor: C.brass },

  // Filter panel
  filterPanel: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  filterLabel: { fontSize: 11, fontWeight: '600', color: C.inkFaint, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  filterChipActive: { borderColor: C.brass, backgroundColor: 'rgba(37,99,235,0.12)' },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  filterChipText: { fontSize: 12, color: C.inkFaint, fontWeight: '500' },
  filterChipTextActive: { color: C.ink },
  clearBtn: { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.sunk },
  clearBtnText: { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  filterCount: { fontSize: 12, color: C.inkFaint, marginTop: 8 },

  // Board view
  boardContainer: { paddingHorizontal: 12, paddingTop: 4 },
  column: { width: 260, marginHorizontal: 4, flex: 1 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surface, borderRadius: 10, borderTopWidth: 3, marginBottom: 8 },
  columnDot: { width: 8, height: 8, borderRadius: 4 },
  columnLabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  columnCount: { fontSize: 12, color: C.inkFaint, marginLeft: 'auto' },
  columnContent: { gap: 6, paddingBottom: 20 },
  emptyCol: { fontSize: 12, color: C.inkFaint, textAlign: 'center', paddingVertical: 20 },

  // Done confirm modal
  doneOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  doneSheet: { width: '100%', maxWidth: 340, backgroundColor: '#162032', borderRadius: 20, borderWidth: 1, borderColor: '#2C3A52', padding: 24, alignItems: 'center' },
  doneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 2, borderColor: 'rgba(74,222,128,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9', marginBottom: 8 },
  doneTaskName: { fontSize: 14, color: '#BFCBDB', textAlign: 'center', marginBottom: 6, paddingHorizontal: 10 },
  doneSubtext: { fontSize: 12, color: '#8C9BB2', marginBottom: 20 },
  doneConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 12, backgroundColor: '#4ADE80', marginBottom: 10 },
  doneConfirmText: { fontSize: 15, fontWeight: '700', color: '#0F1724' },
  doneCancelBtn: { width: '100%', paddingVertical: 12, borderRadius: 12, backgroundColor: '#1E2A40', borderWidth: 1, borderColor: '#2C3A52', alignItems: 'center' },
  doneCancelText: { fontSize: 14, fontWeight: '600', color: '#8C9BB2' },

  // Done button
  doneBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.5)', backgroundColor: 'rgba(74,222,128,0.1)', alignItems: 'center', justifyContent: 'center' },

  // Card
  card: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: '600', color: C.ink, lineHeight: 19 },
  cardDetail: { fontSize: 12, color: C.inkFaint, marginTop: 6, marginLeft: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardMeta: { gap: 2, flex: 1 },
  cardDue: { fontSize: 11, color: C.inkFaint },
  cardProject: { fontSize: 11, color: C.inkSoft },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 9, fontWeight: '700', color: C.brass },

  // List view
  listContainer: { paddingHorizontal: 16, paddingTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  listContent: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 14, fontWeight: '500', color: C.ink },
  listMeta: { flexDirection: 'row', gap: 8, marginTop: 3 },
  listMetaText: { fontSize: 12, color: C.inkFaint },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  // Detail modal
  detailLabel: { fontSize: 11, fontWeight: '600', color: C.inkFaint, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 13.5, color: C.ink },
  detailSectionTitle: { fontSize: 11, fontWeight: '600', color: C.inkFaint, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
});
