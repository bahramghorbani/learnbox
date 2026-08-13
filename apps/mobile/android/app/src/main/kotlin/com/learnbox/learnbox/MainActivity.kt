package com.learnbox.learnbox

import android.media.MediaPlayer
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var pronunciationPlayer: MediaPlayer? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.learnbox.learnbox/pronunciation",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "playAsset" -> playAsset(call, result)
                "dispose" -> {
                    releasePronunciationPlayer()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        releasePronunciationPlayer()
        super.onDestroy()
    }

    private fun playAsset(call: MethodCall, result: MethodChannel.Result) {
        val assetPath = call.argument<String>("assetPath")
        if (assetPath !in supportedPronunciationAssets) {
            result.error("invalid_asset", "Only bundled pronunciation audio is supported.", null)
            return
        }

        try {
            releasePronunciationPlayer()
            val descriptor = assets.openFd("flutter_assets/assets/$assetPath")
            val player = MediaPlayer()
            player.setDataSource(
                descriptor.fileDescriptor,
                descriptor.startOffset,
                descriptor.length,
            )
            descriptor.close()
            player.setOnCompletionListener { completedPlayer ->
                if (pronunciationPlayer === completedPlayer) {
                    completedPlayer.release()
                    pronunciationPlayer = null
                }
            }
            player.prepare()
            player.start()
            pronunciationPlayer = player
            result.success(null)
        } catch (error: Exception) {
            releasePronunciationPlayer()
            result.error("playback_failed", "Bundled pronunciation audio could not play.", null)
        }
    }

    private fun releasePronunciationPlayer() {
        pronunciationPlayer?.release()
        pronunciationPlayer = null
    }

    private companion object {
        val supportedPronunciationAssets = setOf(
            "audio/start-a1-haus-word-audio-v1.mp3",
            "audio/start-a1-haus-sentence-audio-v1.mp3",
            "audio/start-a1-tisch-word-audio-v1.mp3",
            "audio/start-a1-tisch-sentence-audio-v1.mp3",
            "audio/start-a1-tuer-word-audio-v1.mp3",
            "audio/start-a1-tuer-sentence-audio-v1.mp3",
        )
    }
}
