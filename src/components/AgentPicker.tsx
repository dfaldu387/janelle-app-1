import React, { useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', brass: '#2563EB', brassLight: '#60A5FA',
  nav: '#0F1B2D', good: '#4ADE80',
};

export type AgentKey = 'inbox' | 'vendors' | 'projects' | 'george' | 'chief';

const AGENTS: Array<{ key: AgentKey; label: string; icon: string; description: string }> = [
  { key: 'inbox', label: 'Inbox', icon: 'mail-outline', description: 'Email, Gmail search, attachments, Drive search' },
  { key: 'vendors', label: 'Vendors', icon: 'storefront-outline', description: 'Vendor lists, purchase orders, follow-ups' },
  { key: 'projects', label: 'Projects', icon: 'folder-outline', description: 'Projects, tasks, boards, prompts, spec gaps' },
  { key: 'george', label: 'George', icon: 'pin-outline', description: 'Quick single task capture' },
  { key: 'chief', label: 'Chief', icon: 'bar-chart-outline', description: 'Daily briefing, weekly reports, activity, team info' },
];

interface Props {
  visible: boolean;
  selected: AgentKey[];
  onToggle: (key: AgentKey) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export default function AgentPicker({ visible, selected, onToggle, onSelectAll, onClearAll, onClose }: Props) {
  const allOn = selected.length === AGENTS.length;
  const [showSaved, setShowSaved] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const handleDone = () => {
    setShowSaved(true);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setShowSaved(false);
      onClose();
    });
  };
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={handleDone}>
            <Icon name="close" size={16} color="#BFCBDB" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Agents</Text>
            <Text style={styles.headerSub}>
              {selected.length === 0
                ? 'All tools available'
                : `${selected.length} agent${selected.length > 1 ? 's' : ''} active`}
            </Text>
          </View>
          <Pressable style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.hint}>
            Select agents to focus Jenny on specific tools. Leave all unchecked
            to let Jenny use any tool she needs.
          </Text>

          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, allOn && styles.toggleBtnActive]}
              onPress={onSelectAll}>
              <Text style={[styles.toggleBtnText, allOn && styles.toggleBtnTextActive]}>
                Turn on all
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, selected.length === 0 && styles.toggleBtnActive]}
              onPress={onClearAll}>
              <Text style={[styles.toggleBtnText, selected.length === 0 && styles.toggleBtnTextActive]}>
                Turn off all
              </Text>
            </Pressable>
          </View>

          {AGENTS.map(agent => {
            const isOn = selected.includes(agent.key);
            return (
              <Pressable
                key={agent.key}
                style={[styles.agentCard, isOn && styles.agentCardActive]}
                onPress={() => onToggle(agent.key)}>
                <View style={styles.agentRow}>
                  {/* Checkbox */}
                  <View style={[styles.checkbox, isOn && styles.checkboxChecked]}>
                    {isOn && <Text style={styles.checkmark}>✓</Text>}
                  </View>

                  {/* Icon */}
                  <Icon name={agent.icon} size={22} color={C.inkSoft} style={styles.emoji} />

                  {/* Info */}
                  <View style={styles.agentInfo}>
                    <Text style={[styles.agentLabel, isOn && styles.agentLabelActive]}>
                      {agent.label}
                    </Text>
                    <Text style={styles.agentDesc}>{agent.description}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          <View style={[styles.footerWrap, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <Text style={styles.footerText}>
              {selected.length === 0
                ? 'No agents selected — Jenny will decide which tools to use based on your question.'
                : `Jenny will only use tools from: ${selected.map(k => AGENTS.find(a => a.key === k)?.label).join(', ')}`}
            </Text>
          </View>
        </ScrollView>

        {/* Saved toast */}
        {showSaved && (
          <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
            <Text style={styles.toastIcon}>✓</Text>
            <Text style={styles.toastText}>Agents saved</Text>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  closeIcon: { fontSize: 14, color: C.inkSoft, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  headerSub: { fontSize: 12, color: C.inkFaint, marginTop: 2 },
  doneBtn: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8,
    backgroundColor: C.brass,
  },
  doneBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  hint: {
    fontSize: 13, lineHeight: 20, color: C.inkSoft,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  toggleRow: {
    flexDirection: 'row', gap: 10, marginBottom: 14,
    paddingHorizontal: 4,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: C.brass, borderColor: C.brass,
  },
  toggleBtnText: {
    fontSize: 13, fontWeight: '600', color: C.inkSoft,
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  agentCard: {
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line,
    marginBottom: 10,
  },
  agentCardActive: {
    borderColor: C.brass, backgroundColor: 'rgba(37,99,235,0.1)',
  },
  agentRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: C.line,
    backgroundColor: C.sunk,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: C.brass, borderColor: C.brass,
  },
  checkmark: {
    color: '#fff', fontSize: 14, fontWeight: '700', marginTop: -1,
  },
  emoji: {
    fontSize: 22, marginRight: 12,
  },
  agentInfo: { flex: 1 },
  agentLabel: {
    fontSize: 16, fontWeight: '600', color: C.ink, marginBottom: 3,
  },
  agentLabelActive: { color: '#fff' },
  agentDesc: {
    fontSize: 13, color: C.inkSoft, lineHeight: 19,
  },
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, backgroundColor: C.good,
  },
  toastIcon: { fontSize: 16, fontWeight: '700', color: '#fff' },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  footerWrap: {
    marginTop: 12, paddingHorizontal: 4,
  },
  footerText: {
    fontSize: 13, lineHeight: 20, color: C.inkFaint, textAlign: 'center',
  },
});
