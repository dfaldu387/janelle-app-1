import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const C = {
  brass: '#2563EB',
  brassLight: '#60A5FA',
  ink: '#F1F5F9',
  inkFaint: '#8C9BB2',
};

interface Props {
  message?: string;
  fullscreen?: boolean;
  dotsOnly?: boolean;
}

export default function Loader({ message = 'Loading...', fullscreen = false, dotsOnly = false }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const fade1 = useRef(new Animated.Value(0.3)).current;
  const fade2 = useRef(new Animated.Value(0.3)).current;
  const fade3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Spinning ring
    const spinner = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Fading dots (wave effect)
    const wave = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );

    const w1 = wave(fade1, 0);
    const w2 = wave(fade2, 200);
    const w3 = wave(fade3, 400);

    spinner.start();
    w1.start();
    w2.start();
    w3.start();

    return () => { spinner.stop(); w1.stop(); w2.stop(); w3.stop(); };
  }, [spin, fade1, fade2, fade3]);

  const rotation = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (dotsOnly) {
    return (
      <View style={styles.dotsOnlyWrap}>
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: fade1 }]} />
          <Animated.View style={[styles.dot, { opacity: fade2 }]} />
          <Animated.View style={[styles.dot, { opacity: fade3 }]} />
        </View>
        {message ? <Text style={styles.dotsOnlyMsg}>{message}</Text> : null}
      </View>
    );
  }

  const content = (
    <View style={styles.container}>
      {/* Spinner ring */}
      <View style={styles.spinnerWrap}>
        <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: rotation }] }]} />
        <View style={styles.spinnerCenter}>
          <Text style={styles.spinnerLetter}>J</Text>
        </View>
      </View>

      {/* Dots */}
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: fade1 }]} />
        <Animated.View style={[styles.dot, { opacity: fade2 }]} />
        <Animated.View style={[styles.dot, { opacity: fade3 }]} />
      </View>

      {/* Message */}
      <Text style={styles.message}>{message}</Text>
    </View>
  );

  if (fullscreen) {
    return <View style={styles.overlay}>{content}</View>;
  }
  return content;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,36,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  // Spinner
  spinnerWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  spinnerRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(96,165,250,0.15)',
    borderTopColor: C.brassLight,
  },
  spinnerCenter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerLetter: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.brassLight,
  },
  // Dots only mode
  dotsOnlyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dotsOnlyMsg: {
    fontSize: 13,
    color: C.inkFaint,
    fontWeight: '500',
  },
  // Message
  message: {
    fontSize: 13,
    color: C.inkFaint,
    fontWeight: '500',
  },
});
