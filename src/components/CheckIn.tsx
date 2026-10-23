import { showAlert } from '../components/DarkAlert';
import React, { useEffect, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { api } from '../lib/api';
import { ENDPOINTS } from '../lib/endpoints';
import Loader from './Loader';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', brass: '#2563EB', brassLight: '#60A5FA',
  nav: '#0F1B2D', good: '#4ADE80', crit: '#F87171', warn: '#FBBF24',
};

interface CheckinTask {
  id: string;
  title: string;
  project?: string;
  status?: string;
  due?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CheckIn({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<CheckinTask[]>([]);
  const [lead, setLead] = useState('');
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [blockReasons, setBlockReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setDone(false);
    api<any>(ENDPOINTS.ASSISTANT_CHECKIN)
      .then(data => {
        if (data?.tasks) {
          setTasks(data.tasks);
          setLead(data.lead || 'How did today go?');
        } else {
          setLead('No tasks to check in on today.');
        }
      })
      .catch(() => setLead('Could not load check-in.'))
      .finally(() => setLoading(false));
  }, [visible]);

  const setOutcome = (taskId: string, outcome: string) => {
    setOutcomes(prev => ({ ...prev, [taskId]: outcome }));
  };

  const submit = async () => {
    const entries = tasks.map(t => ({
      taskId: t.id,
      outcome: outcomes[t.id] || 'done',
      reason: blockReasons[t.id] || undefined,
    }));
    setSubmitting(true);
    try {
      await api(ENDPOINTS.ASSISTANT_CHECKIN, {
        method: 'POST',
        body: JSON.stringify({ entries }),
      });
      setDone(true);
    } catch (e) {
      showAlert('Error', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>End-of-day Check-in</Text>
          <Pressable style={s.closeBtn} onPress={onClose}>
            <Icon name="close" size={16} color="#BFCBDB" />
          </Pressable>
        </View>

        {loading ? (
          <View style={s.center}><Loader message="Loading check-in..." /></View>
        ) : done ? (
          <View style={s.center}>
            <Text style={s.doneIcon}>✓</Text>
            <Text style={s.doneTitle}>Check-in recorded</Text>
            <Text style={s.doneSub}>See you tomorrow!</Text>
            <Pressable style={s.doneBtn} onPress={onClose}>
              <Text style={s.doneBtnText}>Close</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <Text style={s.lead}>{lead}</Text>

            {tasks.map(task => {
              const outcome = outcomes[task.id];
              return (
                <View key={task.id} style={s.taskCard}>
                  <Text style={s.taskTitle}>{task.title}</Text>
                  {task.project && <Text style={s.taskProject}>{task.project}</Text>}
                  {task.due && <Text style={s.taskDue}>Due: {task.due}</Text>}

                  <View style={s.outcomeRow}>
                    {['done', 'blocked', 'tomorrow'].map(o => (
                      <Pressable key={o} style={[s.outcomeBtn, outcome === o && s.outcomeBtnActive,
                        o === 'done' && outcome === o && { backgroundColor: C.good, borderColor: C.good },
                        o === 'blocked' && outcome === o && { backgroundColor: C.crit, borderColor: C.crit },
                        o === 'tomorrow' && outcome === o && { backgroundColor: C.warn, borderColor: C.warn },
                      ]} onPress={() => setOutcome(task.id, o)}>
                        <Text style={[s.outcomeBtnText, outcome === o && { color: '#fff' }]}>
                          {o === 'done' ? 'Done' : o === 'blocked' ? 'Blocked' : 'Tomorrow'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {outcome === 'blocked' && (
                    <TextInput
                      style={s.reasonInput}
                      placeholder="What's blocking this?"
                      placeholderTextColor={C.inkFaint}
                      value={blockReasons[task.id] || ''}
                      onChangeText={v => setBlockReasons(prev => ({ ...prev, [task.id]: v }))}
                    />
                  )}
                </View>
              );
            })}

            {tasks.length > 0 && (
              <Pressable style={[s.submitBtn, submitting && { opacity: 0.5 }]} disabled={submitting} onPress={submit}>
                <Text style={s.submitBtnText}>{submitting ? 'Submitting...' : 'Submit check-in'}</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 14, color: C.inkSoft, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 16 },
  lead: { fontSize: 16, fontWeight: '600', color: C.ink, marginBottom: 16 },
  taskCard: { padding: 14, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginBottom: 10 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 4 },
  taskProject: { fontSize: 12, color: C.brassLight, marginBottom: 2 },
  taskDue: { fontSize: 12, color: C.inkFaint },
  outcomeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  outcomeBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.sunk, alignItems: 'center' },
  outcomeBtnActive: {},
  outcomeBtnText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  reasonInput: { marginTop: 8, height: 40, borderRadius: 8, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.crit, paddingHorizontal: 12, fontSize: 14, color: C.ink },
  submitBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 10, backgroundColor: C.brass, alignItems: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  doneIcon: { fontSize: 48, color: C.good, marginBottom: 12 },
  doneTitle: { fontSize: 20, fontWeight: '700', color: C.ink, marginBottom: 4 },
  doneSub: { fontSize: 14, color: C.inkFaint, marginBottom: 20 },
  doneBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: C.brass },
  doneBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
