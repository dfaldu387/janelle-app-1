#!/bin/bash
# Patch outdated build.gradle files that use jcenter()

# react-native-tts
TTS_GRADLE="node_modules/react-native-tts/android/build.gradle"
if [ -f "$TTS_GRADLE" ] && grep -q "jcenter()" "$TTS_GRADLE"; then
  cat > "$TTS_GRADLE" << 'EOF'
def safeExtGet(prop, fallback) {
    rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}
apply plugin: 'com.android.library'
android {
    compileSdkVersion safeExtGet('compileSdkVersion', 34)
    defaultConfig {
        minSdkVersion safeExtGet('minSdkVersion', 21)
        targetSdkVersion safeExtGet('targetSdkVersion', 34)
    }
}
repositories { mavenCentral() }
dependencies { implementation 'com.facebook.react:react-native:+' }
EOF
  echo "Patched react-native-tts"
fi

# @react-native-voice/voice
VOICE_GRADLE="node_modules/@react-native-voice/voice/android/build.gradle"
if [ -f "$VOICE_GRADLE" ] && grep -q "jcenter()" "$VOICE_GRADLE"; then
  cat > "$VOICE_GRADLE" << 'EOF'
apply plugin: 'com.android.library'
repositories { mavenLocal(); mavenCentral(); google() }
android {
    compileSdkVersion rootProject.hasProperty('compileSdkVersion') ? rootProject.compileSdkVersion : 34
    defaultConfig {
        minSdkVersion 21
        targetSdkVersion rootProject.hasProperty('targetSdkVersion') ? rootProject.targetSdkVersion : 34
    }
}
dependencies { implementation 'com.facebook.react:react-native:+' }
EOF
  echo "Patched @react-native-voice/voice build.gradle"
fi

# Fix @react-native-voice/voice Android module name mismatch:
# The JS layer does NativeModules.Voice but the Android module registers as "RCTVoice"
VOICE_MODULE="node_modules/@react-native-voice/voice/android/src/main/java/com/wenkesj/voice/VoiceModule.java"
if [ -f "$VOICE_MODULE" ] && grep -q 'return "RCTVoice"' "$VOICE_MODULE"; then
  sed -i '' 's/return "RCTVoice"/return "Voice"/' "$VOICE_MODULE"
  echo "Patched @react-native-voice/voice module name (RCTVoice -> Voice)"
fi
