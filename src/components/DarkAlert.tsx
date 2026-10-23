import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const C = {
  page: '#0F1724', surface: '#162032', sunk: '#1E2A40',
  ink: '#F1F5F9', inkSoft: '#BFCBDB', inkFaint: '#8C9BB2',
  line: '#2C3A52', brass: '#2563EB', crit: '#F87171',
};

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

let _showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void = () => {};

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  _showAlert(title, message, buttons);
}

export default function DarkAlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertState>({ visible: false, title: '', buttons: [] });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(() => setAlert(prev => ({ ...prev, visible: false })));
  }, [fadeAnim, scaleAnim]);

  useEffect(() => {
    _showAlert = (title, message, buttons) => {
      const btns = buttons?.length ? buttons : [{ text: 'OK' }];
      setAlert({ visible: true, title, message, buttons: btns });
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 300 }),
      ]).start();
    };
    return () => { _showAlert = () => {}; };
  }, [fadeAnim, scaleAnim]);

  const handlePress = (btn: AlertButton) => {
    hide();
    setTimeout(() => btn.onPress?.(), 200);
  };

  return (
    <>
      {children}
      <Modal visible={alert.visible} transparent animationType="none" statusBarTranslucent>
        <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
          <Animated.View style={[s.dialog, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <Text style={s.title}>{alert.title}</Text>
            {!!alert.message && <Text style={s.message}>{alert.message}</Text>}
            <View style={s.buttonRow}>
              {alert.buttons.map((btn, i) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                return (
                  <Pressable
                    key={i}
                    style={[
                      s.button,
                      isDestructive && s.buttonDestructive,
                      !isDestructive && !isCancel && alert.buttons.length === 1 && s.buttonPrimary,
                    ]}
                    onPress={() => handlePress(btn)}
                  >
                    <Text style={[
                      s.buttonText,
                      isCancel && s.buttonTextCancel,
                      isDestructive && s.buttonTextDestructive,
                      !isDestructive && !isCancel && alert.buttons.length === 1 && s.buttonTextPrimary,
                    ]}>
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  dialog: {
    width: '100%', maxWidth: 320,
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.line,
    padding: 24,
  },
  title: {
    fontSize: 18, fontWeight: '700', color: C.ink, marginBottom: 8,
  },
  message: {
    fontSize: 14, lineHeight: 21, color: C.inkSoft, marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8,
  },
  button: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.sunk,
  },
  buttonPrimary: {
    backgroundColor: C.brass, borderColor: C.brass,
  },
  buttonDestructive: {
    backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)',
  },
  buttonText: {
    fontSize: 14, fontWeight: '600', color: C.inkSoft,
  },
  buttonTextCancel: {
    color: C.inkFaint,
  },
  buttonTextDestructive: {
    color: C.crit,
  },
  buttonTextPrimary: {
    color: '#fff',
  },
});
