package com.janelleapp.tts

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.*
import java.util.Locale

class TtsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var ready = false

    override fun getName() = "JanelleTts"

    override fun initialize() {
        super.initialize()
        tts = TextToSpeech(reactApplicationContext, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    val params = Arguments.createMap().apply { putString("utteranceId", utteranceId) }
                    reactApplicationContext
                        .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("tts-finish", params)
                }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {}
            })
            ready = true
        }
    }

    @ReactMethod
    fun speak(text: String, promise: Promise) {
        if (!ready || tts == null) {
            promise.reject("TTS_NOT_READY", "Text-to-speech is not ready")
            return
        }
        val id = "utt-${System.currentTimeMillis()}"
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
        promise.resolve(id)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        tts?.stop()
        promise.resolve(null)
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(ready)
    }

    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onCatalystInstanceDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
    }
}
