import React, { useEffect, useState } from 'react';
import {
  Alert, Linking, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { api } from '../lib/api';
import { ENDPOINTS } from '../lib/endpoints';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';

let Config: any = {};
try { Config = require('react-native-config').default || {}; } catch {}

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', brass: '#2563EB', brassLight: '#60A5FA',
  nav: '#0F1B2D', good: '#4ADE80', crit: '#F87171', warn: '#FBBF24',
};

const TABS = ['AI', 'Account'] as const;
type Tab = (typeof TABS)[number];

interface Props { visible: boolean; onClose: () => void }

// ── Reusable KeyField ──
function KeyField({ label, placeholder, hint, hasKey, linkUrl, linkText, onSave, onRemove, saving }: {
  label: string; placeholder: string; hint?: string; hasKey?: boolean;
  linkUrl: string; linkText: string; onSave: (k: string) => void; onRemove: () => void; saving: boolean;
}) {
  const [key, setKey] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <View style={s.kf}>
      <Text style={s.kfLabel}>{label}</Text>
      {hasKey && !editing ? (
        <>
          <View style={s.kfStatus}>
            <Text style={s.kfHint}>{'•••• ' + (hint || '****')}</Text>
            <Text style={s.kfStored}>Encrypted</Text>
          </View>
          <View style={s.kfActions}>
            <Pressable style={s.kfBtn} onPress={() => setEditing(true)}><Text style={s.kfBtnText}>Replace</Text></Pressable>
            <Pressable style={s.kfBtn} onPress={() => Alert.alert('Remove key?', '', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onRemove },
            ])}><Text style={[s.kfBtnText, { color: C.crit }]}>Remove</Text></Pressable>
          </View>
        </>
      ) : (
        <>
          <TextInput style={s.kfInput} placeholder={placeholder} placeholderTextColor={C.inkFaint}
            value={key} onChangeText={setKey} autoCapitalize="none" secureTextEntry />
          <View style={s.kfActions}>
            <Pressable style={[s.saveBtn, (!key.trim() || saving) && s.disabled]} disabled={!key.trim() || saving}
              onPress={() => { onSave(key.trim()); setKey(''); setEditing(false); }}>
              <Text style={s.saveBtnText}>{saving ? '...' : 'Save'}</Text>
            </Pressable>
            {editing && <Pressable style={s.kfBtn} onPress={() => { setEditing(false); setKey(''); }}><Text style={s.kfBtnText}>Cancel</Text></Pressable>}
          </View>
          <Pressable onPress={() => Linking.openURL(linkUrl)}><Text style={s.kfLink}>{linkText}</Text></Pressable>
        </>
      )}
    </View>
  );
}

// ── Card wrapper ──
function Card({ icon, title, desc, children }: { icon: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Icon name={icon} size={20} color="#60A5FA" style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}><Text style={s.cardTitle}>{title}</Text><Text style={s.cardDesc}>{desc}</Text></View>
      </View>
      {children}
    </View>
  );
}

export default function SettingsScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('AI');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // State for all sections
  const [ai, setAi] = useState<any>({});
  const [openai, setOpenai] = useState<any>({});
  const [routing, setRouting] = useState<any>({});
  const [google, setGoogle] = useState<any>({});
  const [ingest, setIngest] = useState<any>({});
  const [slack, setSlack] = useState<any>({});
  const [sla, setSla] = useState<any>({});
  const [usageLink, setUsageLink] = useState<any>({});

  // Password
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const show = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  useEffect(() => {
    Promise.all([
      api<any>(ENDPOINTS.SETTINGS_AI).catch(() => ({})),
      api<any>(ENDPOINTS.SETTINGS_OPENAI).catch(() => ({})),
      api<any>(ENDPOINTS.SETTINGS_AI_ROUTING).catch(() => ({})),
      api<any>(ENDPOINTS.SETTINGS_INGEST).catch(() => ({})),
      api<any>(ENDPOINTS.SETTINGS_SLACK).catch(() => ({})),
      api<any>(ENDPOINTS.SETTINGS_SLA).catch(() => ({})),
      api<any>(ENDPOINTS.SETTINGS_USAGE_LINK).catch(() => ({})),
    ]).then(([a, o, r, ing, sl, slaD, ul]) => {
      setAi(a || {}); setOpenai(o || {}); setRouting(r || {}); setIngest(ing || {}); setSlack(sl || {}); setSla(slaD || {}); setUsageLink(ul || {});
    }).finally(() => setLoading(false));
  }, []);

  // ── API helpers ──
  const apiSave = async (path: string, body: any, onOk: () => void, msg: string) => {
    setSaving(true);
    try { await api(path, { method: 'PUT', body: JSON.stringify(body) }); onOk(); show(msg); }
    catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setSaving(false); }
  };
  const apiDel = async (path: string, onOk: () => void, msg: string) => {
    setSaving(true);
    try { await api(path, { method: 'DELETE' }); onOk(); show(msg); }
    catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (newPwd !== confirmPwd) { Alert.alert('Error', 'Passwords do not match'); return; }
    if (newPwd.length < 6) { Alert.alert('Error', 'Minimum 6 characters'); return; }
    setSaving(true);
    try {
      const { supabase } = require('../lib/supabase');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
      show('Password changed');
    } catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setSaving(false); }
  };

  // ── Tab content ──
  const renderAI = () => (
    <>
      <Card icon="sparkles-outline" title="Jenny's brain — Claude" desc="Anthropic API key for AI assistant">
        <KeyField label="Anthropic API Key" placeholder="sk-ant-..." hint={ai.keyHint} hasKey={ai.configured}
          linkUrl="https://console.anthropic.com/settings/keys" linkText="Get key from console.anthropic.com"
          onSave={k => apiSave(ENDPOINTS.SETTINGS_AI_KEY, { key: k }, () => setAi((p: any) => ({ ...p, configured: true, keyHint: k.slice(-4) })), 'Claude key saved')}
          onRemove={() => apiDel(ENDPOINTS.SETTINGS_AI_KEY, () => setAi((p: any) => ({ ...p, configured: false })), 'Claude key removed')}
          saving={saving} />
        {ai.models?.length > 0 && (
          <View style={s.modelSec}>
            <Text style={s.modelLabel}>Model</Text>
            <View style={s.chips}>{ai.models.map((m: any) => (
              <Pressable key={m.id} style={[s.chip, ai.model === m.id && s.chipOn]}
                onPress={() => apiSave(ENDPOINTS.SETTINGS_AI_MODEL, { model: m.id }, () => setAi((p: any) => ({ ...p, model: m.id })), 'Model updated')}>
                <Text style={[s.chipText, ai.model === m.id && s.chipTextOn]}>{m.label || m.id}</Text>
              </Pressable>
            ))}</View>
          </View>
        )}
      </Card>

      <Card icon="color-palette-outline" title="Photos — OpenAI" desc="OpenAI API key for image generation">
        <KeyField label="OpenAI API Key" placeholder="sk-..." hint={openai.keyHint} hasKey={openai.configured}
          linkUrl="https://platform.openai.com/api-keys" linkText="Get key from platform.openai.com"
          onSave={k => apiSave(ENDPOINTS.SETTINGS_OPENAI_KEY, { key: k }, () => setOpenai((p: any) => ({ ...p, configured: true, keyHint: k.slice(-4) })), 'OpenAI key saved')}
          onRemove={() => apiDel(ENDPOINTS.SETTINGS_OPENAI_KEY, () => setOpenai((p: any) => ({ ...p, configured: false })), 'OpenAI key removed')}
          saving={saving} />
      </Card>

      <Card icon="git-branch-outline" title="Who does the work" desc="Choose which AI handles each action">
        {routing.features?.length > 0 ? (
          <View>
            {routing.features.map((f: any) => (
              <View key={f.id} style={s.providerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.providerName}>{f.label}</Text>
                  <Text style={[s.hint, { marginTop: 2 }]} numberOfLines={2}>{f.note}</Text>
                </View>
                <Text style={[s.providerStatus, { color: f.route ? C.good : C.inkFaint }]}>
                  {f.route || 'Claude'}
                </Text>
              </View>
            ))}
            <Text style={[s.hint, { marginTop: 10 }]}>Route changes are managed from the web settings.</Text>
          </View>
        ) : <Text style={s.hint}>No routing configuration found.</Text>}
        <View style={{ marginTop: 14 }}>
          <KeyField label="Gemini API Key" placeholder="AIza..." hint={routing.geminiKeyHint} hasKey={routing.geminiConfigured}
            linkUrl="https://aistudio.google.com/apikey" linkText="Get key from aistudio.google.com"
            onSave={k => apiSave(ENDPOINTS.SETTINGS_AI_ROUTING_GEMINI_KEY, { key: k }, () => setRouting((p: any) => ({ ...p, geminiConfigured: true, geminiKeyHint: k.slice(-4) })), 'Gemini key saved')}
            onRemove={() => apiDel(ENDPOINTS.SETTINGS_AI_ROUTING_GEMINI_KEY, () => setRouting((p: any) => ({ ...p, geminiConfigured: false })), 'Gemini key removed')}
            saving={saving} />
        </View>
      </Card>
    </>
  );

  const renderConnections = () => (
    <>
      <Card icon="mail-outline" title="Google Workspace" desc="Gmail and Drive — read-only plus drafts">
        <View style={s.connStatus}>
          <Text style={s.connLabel}>Gmail</Text>
          <Text style={[s.connValue, google.gmail ? { color: C.good } : { color: C.warn }]}>{google.gmail ? 'Connected' : 'Not connected'}</Text>
        </View>
        <View style={s.connStatus}>
          <Text style={s.connLabel}>Google Drive</Text>
          <Text style={[s.connValue, google.drive ? { color: C.good } : { color: C.warn }]}>{google.drive ? 'Connected' : 'Not connected'}</Text>
        </View>
        <Text style={s.hint}>Google OAuth connection is managed from the web app at the web app Settings page</Text>
      </Card>

      <Card icon="download-outline" title="Reading email" desc="How often Gmail is checked and whether Claude reads what arrives">
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>Let Claude read incoming email</Text>
          <Switch value={ingest.useAi ?? true}
            onValueChange={v => apiSave(ENDPOINTS.SETTINGS_INGEST, { useAi: v }, () => setIngest((p: any) => ({ ...p, useAi: v })), 'Updated')}
            trackColor={{ false: C.sunk, true: C.brass }} thumbColor="#fff" />
        </View>
        <Text style={s.toggleHint}>When on, classifies mail, links to projects, creates tasks and drafts. When off, just fetches and files.</Text>
        {ingest.intervalMinutes !== undefined && (
          <View style={[s.connStatus, { marginTop: 8 }]}>
            <Text style={s.connLabel}>Check frequency</Text>
            <Text style={s.connValue}>Every {ingest.intervalMinutes} min</Text>
          </View>
        )}
      </Card>

      <Card icon="chatbubble-outline" title="Slack" desc="Task reports in Slack at 9am, midday and 5pm Pacific">
        {slack.connected ? (
          <View>
            <View style={s.connStatus}><Text style={s.connLabel}>Status</Text><Text style={[s.connValue, { color: C.good }]}>Connected</Text></View>
            {slack.channel && <View style={s.connStatus}><Text style={s.connLabel}>Channel</Text><Text style={s.connValue}>#{slack.channel}</Text></View>}
          </View>
        ) : (
          <Text style={s.hint}>Slack is configured from the web app at the web app Settings page</Text>
        )}
      </Card>
    </>
  );

  const renderStudio = () => (
    <>
      <Card icon="time-outline" title="When the studio chases" desc="SLA timers for vendors, clients, and tasks">
        {[
          { key: 'vendor_silence_days', label: 'Chase silent vendor after', unit: 'days' },
          { key: 'quote_response_days', label: 'Quote is late after', unit: 'days' },
          { key: 'client_approval_days', label: 'Chase client for approval after', unit: 'days' },
          { key: 'client_waiting_hours', label: 'Client waiting flagged after', unit: 'hours' },
          { key: 'task_reminder_days', label: 'Remind task owner after', unit: 'days' },
          { key: 'reminder_repeat_days', label: 'Repeat reminder every', unit: 'days' },
          { key: 'escalation_days', label: 'Escalate to principal after', unit: 'days' },
        ].map(item => (
          <View key={item.key} style={s.slaRow}>
            <Text style={s.slaLabel}>{item.label}</Text>
            <View style={s.slaInputRow}>
              <TextInput style={s.slaInput} keyboardType="number-pad"
                value={String(sla[item.key] ?? '')} placeholderTextColor={C.inkFaint}
                onChangeText={v => setSla((p: any) => ({ ...p, [item.key]: parseInt(v) || 0 }))} />
              <Text style={s.slaUnit}>{item.unit}</Text>
            </View>
          </View>
        ))}
        <Pressable style={[s.saveBtn, saving && s.disabled]} disabled={saving}
          onPress={() => apiSave(ENDPOINTS.SETTINGS_SLA, sla, () => {}, 'SLA timers saved')}>
          <Text style={s.saveBtnText}>Save changes</Text>
        </Pressable>
      </Card>

      <Card icon="stats-chart-outline" title="AI usage link" desc="Read-only spend page shareable without sign-in">
        {usageLink.path ? (
          <View>
            <Text style={s.usageLinkText} selectable>{(Config.API_BASE_URL || '') + usageLink.path}</Text>
            <View style={s.kfActions}>
              <Pressable style={s.kfBtn} onPress={() => Linking.openURL(usageLink.url)}><Text style={s.kfBtnText}>Open</Text></Pressable>
              <Pressable style={s.kfBtn} onPress={() => apiDel(ENDPOINTS.SETTINGS_USAGE_LINK, () => setUsageLink({}), 'Link removed')}>
                <Text style={[s.kfBtnText, { color: C.crit }]}>Turn off</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={s.saveBtn} onPress={async () => {
            setSaving(true);
            try {
              const result = await api<any>(ENDPOINTS.SETTINGS_USAGE_LINK + '/rotate', { method: 'POST' });
              setUsageLink(result || {});
              show('Link created');
            } catch (e) { Alert.alert('Error', (e as Error).message); }
            finally { setSaving(false); }
          }}>
            <Text style={s.saveBtnText}>Create a link</Text>
          </Pressable>
        )}
      </Card>
    </>
  );

  const renderAccount = () => (
    <>
      <Card icon="color-palette-outline" title="Appearance" desc="Theme for the app">
        <Text style={s.hint}>The app follows your device's system theme (Settings → Display & Brightness).</Text>
      </Card>

      <Card icon="key-outline" title="Password" desc={`Signed in as ${user?.email || '—'}`}>
        <TextInput style={s.kfInput} placeholder="Current password" placeholderTextColor={C.inkFaint}
          secureTextEntry value={curPwd} onChangeText={setCurPwd} />
        <TextInput style={[s.kfInput, { marginTop: 8 }]} placeholder="New password (min 6 chars)" placeholderTextColor={C.inkFaint}
          secureTextEntry value={newPwd} onChangeText={setNewPwd} />
        <TextInput style={[s.kfInput, { marginTop: 8 }]} placeholder="Repeat new password" placeholderTextColor={C.inkFaint}
          secureTextEntry value={confirmPwd} onChangeText={setConfirmPwd} />
        <Pressable style={[s.saveBtn, { marginTop: 12 }, saving && s.disabled]} disabled={saving} onPress={changePassword}>
          <Text style={s.saveBtnText}>Change password</Text>
        </Pressable>
      </Card>

      <Card icon="people-outline" title="Team & Roles" desc="Manage studio team members and roles">
        <Text style={s.hint}>Full team management is available on the web at the web app Settings page (Team & Roles tab).</Text>
      </Card>

      <Card icon="shield-outline" title="Permissions" desc="Fine-grained role permission overrides">
        <Text style={s.hint}>Permission overrides are managed from the web at the web app Settings page (Permissions tab).</Text>
      </Card>

      <Card icon="list-outline" title="Login History" desc="Audit log of all sign-in attempts">
        <Text style={s.hint}>Login history is viewable on the web at the web app Settings page (Login History tab).</Text>
      </Card>

      <Pressable style={s.signOutBtn} onPress={() => {
        Alert.alert('Sign out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: signOut },
        ]);
      }}>
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>
    </>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Settings</Text>
        <Pressable style={s.closeBtn} onPress={onClose}><Icon name="close" size={16} color={C.inkSoft} /></Pressable>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(t => (
          <Pressable key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={s.loadWrap}><Loader message="Loading settings..." /></View>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 30) }]}>
          {tab === 'AI' && renderAI()}
          {tab === 'Account' && renderAccount()}
        </ScrollView>
      )}

      {toast ? <View style={s.toast}><Text style={s.toastText}>✓ {toast}</Text></View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 14, color: C.inkSoft, fontWeight: '600' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.nav },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.brass },
  tabText: { fontSize: 13, fontWeight: '500', color: C.inkFaint },
  tabTextActive: { color: C.brassLight, fontWeight: '600' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  // Card
  card: { borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  cardEmoji: { fontSize: 26 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  cardDesc: { fontSize: 12, color: C.inkFaint, marginTop: 2 },
  // KeyField
  kf: { marginBottom: 4 },
  kfLabel: { fontSize: 13, fontWeight: '600', color: C.inkSoft, marginBottom: 8 },
  kfInput: { height: 44, borderRadius: 8, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, fontSize: 14, color: C.ink },
  kfStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  kfHint: { fontSize: 14, color: C.ink, letterSpacing: 1 },
  kfStored: { fontSize: 11, color: C.good },
  kfActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  kfBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  kfBtnText: { fontSize: 13, fontWeight: '500', color: C.inkSoft },
  kfLink: { fontSize: 12, color: C.brassLight, marginTop: 10 },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: C.brass, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  disabled: { opacity: 0.4 },
  // Model chips
  modelSec: { marginTop: 14 },
  modelLabel: { fontSize: 13, fontWeight: '600', color: C.inkSoft, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.brass, borderColor: C.brass },
  chipText: { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  chipTextOn: { color: '#fff' },
  // Routing
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  providerName: { fontSize: 14, color: C.ink, fontWeight: '500' },
  providerStatus: { fontSize: 13, fontWeight: '500' },
  // Connections
  connStatus: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  connLabel: { fontSize: 14, color: C.inkSoft },
  connValue: { fontSize: 14, fontWeight: '500', color: C.ink },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  toggleLabel: { fontSize: 14, color: C.ink, flex: 1, marginRight: 12 },
  toggleHint: { fontSize: 12, color: C.inkFaint, marginTop: 4, lineHeight: 18 },
  // SLA
  slaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  slaLabel: { fontSize: 13, color: C.inkSoft, flex: 1, marginRight: 8 },
  slaInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slaInput: { width: 50, height: 36, borderRadius: 6, backgroundColor: C.sunk, borderWidth: 1, borderColor: C.line, textAlign: 'center', fontSize: 14, color: C.ink },
  slaUnit: { fontSize: 12, color: C.inkFaint },
  // Usage link
  usageLinkText: { fontSize: 12, color: C.brassLight, padding: 10, backgroundColor: C.sunk, borderRadius: 6, marginBottom: 8 },
  // Sign out
  signOutBtn: { paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: C.crit, alignItems: 'center', marginTop: 10 },
  signOutText: { fontSize: 15, fontWeight: '600', color: C.crit },
  // Toast
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: C.good },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Hint
  hint: { fontSize: 13, color: C.inkFaint, lineHeight: 20 },
});
