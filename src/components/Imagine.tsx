import { showAlert } from '../components/DarkAlert';
import React, { useEffect, useState } from 'react';
import {
  Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
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
  nav: '#0F1B2D', good: '#4ADE80', crit: '#F87171',
};

interface Props { visible: boolean; onClose: () => void }

export default function Imagine({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await api<any>(ENDPOINTS.ASSISTANT_IMAGINE, {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim(), kind: mode }),
      });
      if (res.jobId) {
        setJobId(res.jobId);
        setPolling(true);
      } else if (res.url || res.image) {
        setResult(res);
      }
    } catch (e) {
      showAlert('Error', (e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  // Poll for job completion
  useEffect(() => {
    if (!polling || !jobId) return;
    const interval = setInterval(async () => {
      try {
        const status = await api<any>(ENDPOINTS.ASSISTANT_MEDIA + '/' + jobId);
        if (status.status === 'done' || status.url) {
          setResult(status);
          setPolling(false);
        } else if (status.status === 'failed') {
          showAlert('Failed', status.error || 'Generation failed');
          setPolling(false);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, jobId]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Imagine</Text>
          <Pressable style={s.closeBtn} onPress={onClose}>
            <Icon name="close" size={16} color="#BFCBDB" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Mode toggle */}
          <View style={s.modeRow}>
            <Pressable style={[s.modeBtn, mode === 'image' && s.modeBtnActive]} onPress={() => setMode('image')}>
              <Text style={[s.modeBtnText, mode === 'image' && s.modeBtnTextActive]}>Image</Text>
            </Pressable>
            <Pressable style={[s.modeBtn, mode === 'video' && s.modeBtnActive]} onPress={() => setMode('video')}>
              <Text style={[s.modeBtnText, mode === 'video' && s.modeBtnTextActive]}>Video</Text>
            </Pressable>
          </View>

          {/* Prompt */}
          <TextInput
            style={s.promptInput}
            placeholder={mode === 'image' ? 'Describe the image you want...' : 'Describe the video clip...'}
            placeholderTextColor={C.inkFaint}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            maxLength={1000}
          />

          <Pressable
            style={[s.generateBtn, (generating || polling || !prompt.trim()) && { opacity: 0.5 }]}
            disabled={generating || polling || !prompt.trim()}
            onPress={generate}>
            <Text style={s.generateBtnText}>
              {generating ? 'Starting...' : polling ? 'Rendering...' : `Generate ${mode}`}
            </Text>
          </Pressable>

          {/* Loading */}
          {(generating || polling) && (
            <View style={s.loadWrap}>
              <Loader message={polling ? 'Rendering your image...' : 'Starting generation...'} />
            </View>
          )}

          {/* Result */}
          {result?.url && (
            <View style={s.resultWrap}>
              <Image source={{ uri: result.url }} style={s.resultImage} resizeMode="contain" />
              <Text style={s.resultHint}>Tap and hold to save</Text>
            </View>
          )}
        </ScrollView>
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
  content: { padding: 16 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center' },
  modeBtnActive: { backgroundColor: C.brass, borderColor: C.brass },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: C.inkSoft },
  modeBtnTextActive: { color: '#fff' },
  promptInput: { minHeight: 100, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.ink, textAlignVertical: 'top', marginBottom: 14 },
  generateBtn: { paddingVertical: 14, borderRadius: 10, backgroundColor: C.brass, alignItems: 'center' },
  generateBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  loadWrap: { marginTop: 24, alignItems: 'center' },
  resultWrap: { marginTop: 20, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  resultImage: { width: '100%', height: 300, backgroundColor: C.sunk },
  resultHint: { fontSize: 12, color: C.inkFaint, textAlign: 'center', paddingVertical: 8 },
});
