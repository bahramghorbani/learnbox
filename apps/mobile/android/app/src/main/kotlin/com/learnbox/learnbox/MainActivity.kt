package com.learnbox.learnbox

import android.media.MediaPlayer
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var mediaPlayer: MediaPlayer? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            CHANNEL_NAME,
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "playAsset" -> playAsset(call.argument<String>("assetPath"), result)
                "stop" -> {
                    releasePlayer()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        releasePlayer()
        super.onDestroy()
    }

    private fun playAsset(assetPath: String?, result: MethodChannel.Result) {
        if (assetPath !in APPROVED_ASSET_PATHS) {
            result.error("unapproved_asset", "Audio asset is not approved.", null)
            return
        }

        try {
            releasePlayer()
            val descriptor = assets.openFd("flutter_assets/$assetPath")
            mediaPlayer = MediaPlayer().apply {
                setDataSource(
                    descriptor.fileDescriptor,
                    descriptor.startOffset,
                    descriptor.length,
                )
                descriptor.close()
                setOnCompletionListener { releasePlayer() }
                setOnErrorListener { _, _, _ ->
                    releasePlayer()
                    true
                }
                prepare()
                start()
            }
            result.success(null)
        } catch (error: Exception) {
            releasePlayer()
            result.error("playback_failed", "Approved audio could not be played.", null)
        }
    }

    private fun releasePlayer() {
        mediaPlayer?.let { player ->
            try {
                player.stop()
            } catch (_: IllegalStateException) {
                // Releasing an already completed or failed player is still safe.
            }
            player.release()
        }
        mediaPlayer = null
    }

    private companion object {
        const val CHANNEL_NAME = "learnbox/pronunciation_v2"
        val APPROVED_ASSET_PATHS = setOf(
            "assets/audio/start-a1-haus-word-audio-v2.mp3",
            "assets/audio/start-a1-haus-sentence-audio-v2.mp3",
            "assets/audio/start-a1-tisch-word-audio-v2.mp3",
            "assets/audio/start-a1-tisch-sentence-audio-v2.mp3",
            "assets/audio/start-a1-tuer-word-audio-v2.mp3",
            "assets/audio/start-a1-tuer-sentence-audio-v2.mp3",
        )
    }
}
