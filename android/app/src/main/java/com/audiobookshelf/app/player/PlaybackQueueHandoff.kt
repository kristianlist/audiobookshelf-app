package com.audiobookshelf.app.player

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.audiobookshelf.app.data.PlaybackSession
import com.audiobookshelf.app.data.Podcast
import com.audiobookshelf.app.data.PodcastEpisode
import com.audiobookshelf.app.data.StreamingUsingCellularSetting
import com.audiobookshelf.app.device.DeviceManager
import com.audiobookshelf.app.plugins.AbsLogger

data class QueueItem(
  val libraryItemId: String,
  val episodeId: String?,
  val localLibraryItemId: String?,
  val localEpisodeId: String?
)

// Native copy of the fork's playback queue (store/queue.js).
//   Android freezes the WebView while the screen is off, so the JS queue never sees the item end in time.
//   The service starts the next item from this copy instead, and tells the UI which item it moved to.
//   Kept in its own file so syncs with upstream do not conflict with it.
class PlaybackQueueHandoff(private val service: PlayerNotificationService) {
  private val tag = "PlaybackQueueHandoff"

  private var items: List<QueueItem> = emptyList()
  private var currentIndex: Int = -1
  private var repeatMode: String = "none"

  // Set by the AbsAudioPlayer plugin to forward the new queue index to the UI
  var onAdvanced: ((index: Int, item: QueueItem) -> Unit)? = null

  fun setQueue(newItems: List<QueueItem>, newCurrentIndex: Int, newRepeatMode: String) {
    items = newItems
    currentIndex = newCurrentIndex
    repeatMode = newRepeatMode
    Log.d(tag, "setQueue: ${items.size} items, index $currentIndex, repeat $repeatMode")
  }

  fun clear() {
    setQueue(emptyList(), -1, "none")
  }

  // Returns true when the next item was started here, so the caller must not also report ENDED to the UI
  fun playNext(): Boolean {
    val session = service.currentPlaybackSession ?: return false
    if (currentIndex !in items.indices) return false

    // Only continue the queue when the item that ended is the queue's current item. Anything else is left
    //   to the UI as before
    if (!matches(items[currentIndex], session)) {
      Log.d(tag, "playNext: Ended item is not the current queue item")
      return false
    }

    if (repeatMode == "repeat-one") {
      AbsLogger.info(tag, "playNext: Repeating \"${session.displayTitle}\"")
      service.seekPlayer(0L)
      service.play()
      return true
    }

    var nextIndex = currentIndex + 1
    if (nextIndex >= items.size) {
      if (repeatMode != "repeat-all") return false
      nextIndex = 0
    }
    val next = items[nextIndex]

    val playLocal = next.localLibraryItemId != null
    if (playLocal && service.getMediaPlayer() == PLAYER_CAST) return false // The UI asks before ending a cast for a local item
    if (!playLocal && !canStreamOnCurrentNetwork()) return false // The UI asks or refuses depending on the setting

    val playbackRate = service.currentPlayer.playbackParameters.speed
    val started = if (playLocal) prepareLocal(next, playbackRate) else prepareServer(next, playbackRate)
    if (!started) return false

    currentIndex = nextIndex
    AbsLogger.info(tag, "playNext: Started queue item $nextIndex (${next.libraryItemId})")
    onAdvanced?.invoke(nextIndex, next)
    return true
  }

  private fun canStreamOnCurrentNetwork(): Boolean {
    if (PlayerNotificationService.isUnmeteredNetwork) return true
    return DeviceManager.deviceData.deviceSettings?.streamingUsingCellular == StreamingUsingCellularSetting.ALWAYS
  }

  private fun matches(item: QueueItem, session: PlaybackSession): Boolean {
    val sessionItemIds = setOfNotNull(session.libraryItemId, session.localLibraryItem?.id, session.localLibraryItem?.libraryItemId)
    if (item.libraryItemId !in sessionItemIds && item.localLibraryItemId !in sessionItemIds) return false

    val sessionEpisodeIds = setOfNotNull(session.episodeId, session.localEpisodeId)
    if (item.episodeId == null && item.localEpisodeId == null) return sessionEpisodeIds.isEmpty()
    return item.episodeId in sessionEpisodeIds || item.localEpisodeId in sessionEpisodeIds
  }

  // Mirrors the local branch of AbsAudioPlayer.prepareLibraryItem
  private fun prepareLocal(item: QueueItem, playbackRate: Float): Boolean {
    val localLibraryItem = DeviceManager.dbManager.getLocalLibraryItem(item.localLibraryItemId ?: return false) ?: return false
    var episode: PodcastEpisode? = null
    if (item.localEpisodeId != null) {
      episode = (localLibraryItem.media as? Podcast)?.episodes?.find { it.id == item.localEpisodeId } ?: return false
    }
    if (!localLibraryItem.hasTracks(service, episode)) return false

    val playbackSession = localLibraryItem.getPlaybackSession(episode, service.getDeviceInfo())
    service.mediaProgressSyncer.stop {
      PlayerListener.lazyIsPlaying = false
      Handler(Looper.getMainLooper()).post { service.preparePlayer(playbackSession, true, playbackRate) }
    }
    return true
  }

  // Mirrors the server branch of AbsAudioPlayer.prepareLibraryItem
  private fun prepareServer(item: QueueItem, playbackRate: Float): Boolean {
    val playItemRequestPayload = service.getPlayItemRequestPayload(false)
    service.mediaProgressSyncer.stop {
      service.apiHandler.playLibraryItem(item.libraryItemId, item.episodeId ?: "", playItemRequestPayload) { playbackSession ->
        if (playbackSession == null) {
          AbsLogger.error(tag, "prepareServer: Server play request failed for ${item.libraryItemId}")
          service.clientEventEmitter?.onPlaybackFailed("Failed to start the next item in the queue")
        } else {
          Handler(Looper.getMainLooper()).post {
            PlayerListener.lazyIsPlaying = false
            service.preparePlayer(playbackSession, true, playbackRate)
          }
        }
      }
    }
    return true
  }
}
