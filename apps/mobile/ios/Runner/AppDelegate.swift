import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var pronunciationPlayer: AVAudioPlayer?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let channel = FlutterMethodChannel(
      name: "com.learnbox.learnbox/pronunciation",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      switch call.method {
      case "playAsset":
        guard
          let arguments = call.arguments as? [String: Any],
          let assetPath = arguments["assetPath"] as? String,
          Self.supportedPronunciationAssets.contains(assetPath)
        else {
          result(FlutterError(
            code: "invalid_asset",
            message: "Only bundled pronunciation audio is supported.",
            details: nil
          ))
          return
        }

        guard let assetFile = Bundle.main.path(
          forResource: "flutter_assets/assets/\(assetPath)",
          ofType: nil
        ) else {
          result(FlutterError(
            code: "missing_asset",
            message: "Bundled pronunciation audio is unavailable.",
            details: nil
          ))
          return
        }

        do {
          let player = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: assetFile))
          player.prepareToPlay()
          player.play()
          self?.pronunciationPlayer = player
          result(nil)
        } catch {
          result(FlutterError(
            code: "playback_failed",
            message: "Bundled pronunciation audio could not play.",
            details: nil
          ))
        }
      case "dispose":
        self?.pronunciationPlayer?.stop()
        self?.pronunciationPlayer = nil
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private static let supportedPronunciationAssets: Set<String> = [
    "audio/start-a1-haus-word-audio-v1.mp3",
    "audio/start-a1-haus-sentence-audio-v1.mp3",
    "audio/start-a1-tisch-word-audio-v1.mp3",
    "audio/start-a1-tisch-sentence-audio-v1.mp3",
    "audio/start-a1-tuer-word-audio-v1.mp3",
    "audio/start-a1-tuer-sentence-audio-v1.mp3",
  ]
}
