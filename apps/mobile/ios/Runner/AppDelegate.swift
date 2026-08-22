import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var audioPlayer: AVAudioPlayer?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    guard let registrar = engineBridge.pluginRegistry.registrar(
      forPlugin: "LearnBoxPronunciationBridge"
    ) else {
      return
    }
    FlutterMethodChannel(
      name: Self.channelName,
      binaryMessenger: registrar.messenger()
    ).setMethodCallHandler { [weak self] call, result in
      switch call.method {
      case "playAsset":
        let arguments = call.arguments as? [String: Any]
        self?.playAsset(arguments?["assetPath"] as? String, result: result)
      case "stop":
        self?.stopPlayback()
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  override func applicationWillTerminate(_ application: UIApplication) {
    stopPlayback()
    super.applicationWillTerminate(application)
  }

  private func playAsset(_ assetPath: String?, result: FlutterResult) {
    guard let assetPath, Self.approvedAssetPaths.contains(assetPath) else {
      result(FlutterError(
        code: "unapproved_asset",
        message: "Audio asset is not approved.",
        details: nil
      ))
      return
    }

    do {
      stopPlayback()
      let lookupKey = FlutterDartProject.lookupKey(forAsset: assetPath)
      guard let path = Bundle.main.path(forResource: lookupKey, ofType: nil) else {
        throw NSError(domain: "LearnBoxPronunciation", code: 1)
      }
      let player = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: path))
      player.prepareToPlay()
      guard player.play() else {
        throw NSError(domain: "LearnBoxPronunciation", code: 2)
      }
      audioPlayer = player
      result(nil)
    } catch {
      stopPlayback()
      result(FlutterError(
        code: "playback_failed",
        message: "Approved audio could not be played.",
        details: nil
      ))
    }
  }

  private func stopPlayback() {
    audioPlayer?.stop()
    audioPlayer = nil
  }

  private static let channelName = "learnbox/pronunciation_v2"
  private static let approvedAssetPaths: Set<String> = [
    "assets/audio/start-a1-haus-word-audio-v2.mp3",
    "assets/audio/start-a1-haus-sentence-audio-v2.mp3",
    "assets/audio/start-a1-tisch-word-audio-v2.mp3",
    "assets/audio/start-a1-tisch-sentence-audio-v2.mp3",
    "assets/audio/start-a1-tuer-word-audio-v2.mp3",
    "assets/audio/start-a1-tuer-sentence-audio-v2.mp3",
  ]
}
