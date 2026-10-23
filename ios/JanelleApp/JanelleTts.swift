import AVFoundation

@objc(JanelleTts)
class JanelleTts: RCTEventEmitter, AVSpeechSynthesizerDelegate {
  private let synthesizer = AVSpeechSynthesizer()

  override init() {
    super.init()
    synthesizer.delegate = self
    configureAudioSession()
  }

  private func configureAudioSession() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [.duckOthers])
      try session.setActive(true)
    } catch {}
  }

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String] { ["tts-finish"] }

  @objc func speak(_ text: String) {
    synthesizer.stopSpeaking(at: .immediate)
    configureAudioSession()
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate
    synthesizer.speak(utterance)
  }

  @objc func stop() {
    synthesizer.stopSpeaking(at: .immediate)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    sendEvent(withName: "tts-finish", body: nil)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    sendEvent(withName: "tts-finish", body: nil)
  }
}
