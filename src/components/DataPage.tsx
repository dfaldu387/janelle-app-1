import React, { useEffect, useState } from 'react';
import {
  FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { api } from '../lib/api';
import Loader from './Loader';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', brass: '#2563EB', nav: '#0F1B2D',
  good: '#4ADE80', crit: '#F87171', warn: '#FBBF24', olive: '#A78BFA',
};

const STATUS_COLOR: Record<string, string> = {
  done: C.good, completed: C.good, sent: C.good,
  'in progress': C.olive, active: C.olive, open: C.olive,
  overdue: C.crit, blocked: C.crit,
  pending: C.warn, draft: C.warn, waiting: C.warn,
};

interface Props {
  title: string;
  endpoint: string;
  renderRow: (item: any) => React.ReactNode;
  onClose: () => void;
}

export function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const color = STATUS_COLOR[status.toLowerCase()] || C.inkFaint;
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <View style={[s.pillDot, { backgroundColor: color }]} />
      <Text style={[s.pillText, { color }]}>{status}</Text>
    </View>
  );
}

export default function DataPage({ title, endpoint, renderRow, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<any>(endpoint)
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [endpoint]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{title}</Text>
        <Pressable style={s.closeBtn} onPress={onClose}>
          <Icon name="close" size={16} color="#BFCBDB" />
        </Pressable>
      </View>
      {loading ? (
        <View style={s.loadWrap}><Loader message={`Loading ${title.toLowerCase()}...`} /></View>
      ) : error ? (
        <View style={s.loadWrap}><Text style={s.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => item.id || String(i)}
          renderItem={({ item }) => <>{renderRow(item)}</>}
          contentContainerStyle={[s.list, { paddingBottom: Math.max(insets.bottom, 20) }]}
          ListEmptyComponent={<View style={s.loadWrap}><Text style={s.emptyText}>No {title.toLowerCase()} found.</Text></View>}
        />
      )}
    </View>
  );
}

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 14, color: C.inkSoft, fontWeight: '600' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: C.crit, fontSize: 14, textAlign: 'center' },
  emptyText: { color: C.inkFaint, fontSize: 14 },
  list: { padding: 16 },
  // Row styles for pages to use
  row: { padding: 14, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 4 },
  rowSub: { fontSize: 12, color: C.inkFaint, marginTop: 2 },
  rowMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  rowMetaText: { fontSize: 12, color: C.inkFaint },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
});
