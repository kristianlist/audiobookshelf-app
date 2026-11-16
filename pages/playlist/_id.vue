<template>
  <div class="w-full h-full">
    <div class="w-full h-full overflow-y-auto py-6 md:p-8">
      <div class="w-full flex justify-center">
        <covers-playlist-cover :items="playlistItems" :width="180" :height="180" />
      </div>
      <div class="flex-grow px-1 py-6">
        <div class="flex items-center px-3">
          <h1 class="text-xl font-sans">
            {{ playlistName }}
          </h1>
          <div class="flex-grow" />
          <ui-btn v-if="showPlayButton" color="success" :padding-x="4" :loading="playerIsStartingForThisMedia" small class="flex items-center justify-center mx-1 w-24" @click="playClick">
            <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
            <span class="px-1 text-sm">{{ playerIsPlaying ? $strings.ButtonPause : $strings.ButtonPlay }}</span>
          </ui-btn>
        </div>

        <div class="my-8 max-w-2xl px-3">
          <p class="text-base text-fg">{{ description }}</p>
        </div>

        <div v-if="totalCount" class="px-3 mb-6">
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-sm text-fg-muted">{{ $getString('LabelFinishedCount', [finishedCount, totalCount]) }}</p>
            <p v-if="totalRemainingDurationPretty" class="text-sm text-fg-muted">{{ $getString('LabelTimeRemaining', [totalRemainingDurationPretty]) }}</p>
          </div>
          <div class="h-1 w-full bg-track/50 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300" :class="overallProgressPercent >= 1 ? 'bg-success' : 'bg-yellow-400'" :style="{ width: overallProgressPercent * 100 + '%' }" />
          </div>
        </div>

        <tables-playlist-items-table :items="playlistItems" :playlist-id="playlist.id" @showMore="showMore" @playAtIndex="playItemAtIndex" />
      </div>
    </div>

    <modals-item-more-menu-modal v-model="showMoreMenu" :library-item="selectedLibraryItem" :episode="selectedEpisode" :playlist="playlist" hide-rss-feed-option :processing.sync="processing" />
    <div v-show="processing" class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center bg-black/50 z-50">
      <ui-loading-indicator />
    </div>
  </div>
</template>

<script>
export default {
  async asyncData({ store, params, app, redirect, route }) {
    if (!store.state.user.user) {
      return redirect(`/connect?redirect=${route.path}`)
    }

    const playlist = await app.$nativeHttp.get(`/api/playlists/${params.id}`).catch((error) => {
      console.error('Failed', error)
      return false
    })

    if (!playlist) {
      return redirect('/bookshelf/playlists')
    }

    // Lookup matching local items & episodes and attach to playlist items
    if (playlist.items.length) {
      const localLibraryItems = (await app.$db.getLocalLibraryItems(playlist.items[0].libraryItem.mediaType)) || []
      if (localLibraryItems.length) {
        playlist.items.forEach((playlistItem) => {
          const matchingLocalLibraryItem = localLibraryItems.find((lli) => lli.libraryItemId === playlistItem.libraryItemId)
          if (!matchingLocalLibraryItem) return
          if (playlistItem.episode) {
            const matchingLocalEpisode = matchingLocalLibraryItem.media.episodes?.find((lep) => lep.serverEpisodeId === playlistItem.episodeId)
            if (matchingLocalEpisode) {
              playlistItem.localLibraryItem = matchingLocalLibraryItem
              playlistItem.localEpisode = matchingLocalEpisode
            }
          } else {
            playlistItem.localLibraryItem = matchingLocalLibraryItem
          }
        })
      }
    }

    return {
      playlist
    }
  },
  data() {
    return {
      showMoreMenu: false,
      processing: false,
      selectedLibraryItem: null,
      selectedEpisode: null,
      mediaIdStartingPlayback: null
    }
  },
  computed: {
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    playlistItems() {
      return this.playlist.items || []
    },
    playlistName() {
      return this.playlist.name || ''
    },
    description() {
      return this.playlist.description || ''
    },
    playableItems() {
      return this.playlistItems.filter((item) => {
        const libraryItem = item.libraryItem
        if (libraryItem.isMissing || libraryItem.isInvalid) return false
        if (item.episode) return item.episode.audioFile
        return libraryItem.media.tracks.length
      })
    },
    playerIsPlaying() {
      return this.$store.state.playerIsPlaying && this.isOpenInPlayer
    },
    isOpenInPlayer() {
      return !!this.playableItems.find((i) => {
        if (i.localLibraryItem && this.$store.getters['getIsMediaStreaming'](i.localLibraryItem.id, i.localEpisode?.id)) return true
        return this.$store.getters['getIsMediaStreaming'](i.libraryItemId, i.episodeId)
      })
    },
    showPlayButton() {
      return this.playableItems.length
    },
    playerIsStartingPlayback() {
      // Play has been pressed and waiting for native play response
      return this.$store.state.playerIsStartingPlayback
    },
    playerIsStartingForThisMedia() {
      if (!this.mediaIdStartingPlayback) return false
      const mediaId = this.$store.state.playerStartingPlaybackMediaId
      return mediaId === this.mediaIdStartingPlayback
    },
    finishedCount() {
      return this.playlistItems.filter((item) => {
        const prog = this.$store.getters['user/getUserMediaProgress'](item.libraryItemId, item.episodeId)
        return prog?.isFinished
      }).length
    },
    totalCount() {
      return this.playlistItems.length
    },
    overallProgressPercent() {
      if (!this.totalCount) return 0
      return this.finishedCount / this.totalCount
    },
    totalRemainingDuration() {
      let total = 0
      this.playlistItems.forEach((item) => {
        const prog = this.$store.getters['user/getUserMediaProgress'](item.libraryItemId, item.episodeId)
        if (prog?.isFinished) return
        const duration = item.episode ? (item.episode.duration || 0) : (item.libraryItem?.media?.duration || 0)
        const currentTime = prog?.currentTime || 0
        total += Math.max(0, duration - currentTime)
      })
      return total
    },
    totalRemainingDurationPretty() {
      if (!this.totalRemainingDuration) return ''
      return this.$elapsedPrettyExtended(this.totalRemainingDuration)
    }
  },
  methods: {
    showMore(playlistItem) {
      this.selectedLibraryItem = playlistItem.libraryItem
      this.selectedEpisode = playlistItem.episode
      this.showMoreMenu = true
    },
    async playClick() {
      if (this.playerIsStartingPlayback) return
      await this.$hapticsImpact()

      if (this.playerIsPlaying) {
        this.$eventBus.$emit('pause-item')
      } else {
        this.playFromQueue()
      }
    },
    playFromQueue(startIndex) {
      this.$store.dispatch('queue/loadPlaylistAsQueue', { playlist: this.playlist, startIndex })
      const currentItem = this.$store.getters['queue/currentItem']
      if (currentItem) {
        this.mediaIdStartingPlayback = currentItem.episodeId || currentItem.libraryItemId
        this.$store.commit('setPlayerIsStartingPlayback', this.mediaIdStartingPlayback)

        const payload = {
          libraryItemId: currentItem.libraryItemId,
          episodeId: currentItem.episodeId || undefined
        }
        if (currentItem.localLibraryItemId) {
          payload.libraryItemId = currentItem.localLibraryItemId
          payload.episodeId = currentItem.localEpisodeId || undefined
          payload.serverLibraryItemId = currentItem.serverLibraryItemId || currentItem.libraryItemId
          payload.serverEpisodeId = currentItem.serverEpisodeId || currentItem.episodeId || undefined
        }
        this.$eventBus.$emit('play-item', payload)
      }
    },
    playItemAtIndex(index) {
      // The row index counts every playlist item, but the queue only holds playable ones
      const playableIndex = this.playableItems.indexOf(this.playlistItems[index])
      if (playableIndex < 0) return
      this.playFromQueue(playableIndex)
    },
    playlistUpdated(playlist) {
      if (this.playlist.id !== playlist.id) return
      this.playlist = playlist
    },
    playlistRemoved(playlist) {
      if (this.playlist.id === playlist.id) {
        this.$router.replace('/bookshelf/playlists')
      }
    },
    libraryChanged() {
      // Playlist contents are shown in the context of the selected library, so leave this page
      // when the library changes rather than showing stale items
      this.$router.replace('/bookshelf/playlists')
    }
  },
  mounted() {
    this.$eventBus.$on('library-changed', this.libraryChanged)
    this.$socket.$on('playlist_updated', this.playlistUpdated)
    this.$socket.$on('playlist_removed', this.playlistRemoved)
  },
  beforeDestroy() {
    this.$eventBus.$off('library-changed', this.libraryChanged)
    this.$socket.$off('playlist_updated', this.playlistUpdated)
    this.$socket.$off('playlist_removed', this.playlistRemoved)
  }
}
</script>
