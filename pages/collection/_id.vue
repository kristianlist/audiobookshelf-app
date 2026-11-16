<template>
  <div class="w-full h-full">
    <div class="w-full h-full overflow-y-auto px-2 py-6 md:p-8">
      <div class="w-full flex justify-center md:block sm:w-32 md:w-52" style="min-width: 240px">
        <div class="relative" style="height: fit-content">
          <covers-collection-cover :book-items="bookItems" :width="240" :height="120 * bookCoverAspectRatio" :book-cover-aspect-ratio="bookCoverAspectRatio" />
        </div>
      </div>
      <div class="flex-grow py-6">
        <div class="flex items-center px-2">
          <h1 class="text-xl font-sans">
            {{ collectionName }}
          </h1>
          <div class="flex-grow" />
          <ui-btn v-if="showPlayButton" color="success" :padding-x="4" :loading="playerIsStartingForThisMedia" small class="flex items-center justify-center mx-1 w-24" @click="playClick">
            <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
            <span class="px-1 text-sm">{{ playerIsPlaying ? $strings.ButtonPause : $strings.ButtonPlay }}</span>
          </ui-btn>
        </div>

        <div class="my-8 max-w-2xl px-2">
          <p class="text-base text-fg">{{ description }}</p>
        </div>

        <div v-if="totalCount" class="px-2 mb-6">
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-sm text-fg-muted">{{ $getString('LabelFinishedCount', [finishedCount, totalCount]) }}</p>
            <p v-if="totalRemainingDurationPretty" class="text-sm text-fg-muted">{{ $getString('LabelTimeRemaining', [totalRemainingDurationPretty]) }}</p>
          </div>
          <div class="h-1 w-full bg-track/50 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300" :class="overallProgressPercent >= 1 ? 'bg-success' : 'bg-yellow-400'" :style="{ width: overallProgressPercent * 100 + '%' }" />
          </div>
        </div>

        <tables-collection-books-table :books="bookItems" :collection-id="collection.id" @playAtIndex="playBookAtIndex" />
      </div>
    </div>
    <div v-show="processingRemove" class="absolute top-0 left-0 w-full h-full z-10 bg-black bg-opacity-40 flex items-center justify-center">
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

    var collection = await app.$nativeHttp.get(`/api/collections/${params.id}`).catch((error) => {
      console.error('Failed', error)
      return false
    })

    if (!collection) {
      return redirect('/bookshelf')
    }

    // Lookup matching local items and attach to collection items
    if (collection.books.length) {
      const localLibraryItems = (await app.$db.getLocalLibraryItems('book')) || []
      if (localLibraryItems.length) {
        collection.books.forEach((collectionItem) => {
          const matchingLocalLibraryItem = localLibraryItems.find((lli) => lli.libraryItemId === collectionItem.id)
          if (!matchingLocalLibraryItem) return
          collectionItem.localLibraryItem = matchingLocalLibraryItem
        })
      }
    }

    return {
      collection
    }
  },
  data() {
    return {
      mediaIdStartingPlayback: null,
      processingRemove: false
    }
  },
  computed: {
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    bookItems() {
      return this.collection.books || []
    },
    collectionName() {
      return this.collection.name || ''
    },
    description() {
      return this.collection.description || ''
    },
    playableItems() {
      return this.bookItems.filter((book) => {
        return !book.isMissing && !book.isInvalid && book.media.tracks.length
      })
    },
    playerIsPlaying() {
      return this.$store.state.playerIsPlaying && this.isOpenInPlayer
    },
    isOpenInPlayer() {
      return !!this.playableItems.find((i) => {
        if (i.localLibraryItem && this.$store.getters['getIsMediaStreaming'](i.localLibraryItem.id)) return true
        return this.$store.getters['getIsMediaStreaming'](i.id)
      })
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
    showPlayButton() {
      return this.playableItems.length
    },
    finishedCount() {
      return this.bookItems.filter((book) => {
        const prog = this.$store.getters['user/getUserMediaProgress'](book.id)
        return prog?.isFinished
      }).length
    },
    totalCount() {
      return this.bookItems.length
    },
    overallProgressPercent() {
      if (!this.totalCount) return 0
      return this.finishedCount / this.totalCount
    },
    totalRemainingDuration() {
      let total = 0
      this.bookItems.forEach((book) => {
        const prog = this.$store.getters['user/getUserMediaProgress'](book.id)
        if (prog?.isFinished) return
        const duration = book.media?.duration || 0
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
      this.$store.dispatch('queue/loadCollectionAsQueue', { collection: this.collection, startIndex })
      const currentItem = this.$store.getters['queue/currentItem']
      if (currentItem) {
        this.mediaIdStartingPlayback = currentItem.libraryItemId
        this.$store.commit('setPlayerIsStartingPlayback', currentItem.libraryItemId)

        const payload = { libraryItemId: currentItem.libraryItemId }
        if (currentItem.localLibraryItemId) {
          payload.libraryItemId = currentItem.localLibraryItemId
          payload.serverLibraryItemId = currentItem.serverLibraryItemId || currentItem.libraryItemId
        }
        this.$eventBus.$emit('play-item', payload)
      }
    },
    playBookAtIndex(index) {
      this.playFromQueue(index)
    },
    libraryChanged(libraryId) {
      // A collection belongs to a single library, so leave this page when a different library is
      // selected rather than showing a collection that is not in the current library
      if (!libraryId || libraryId !== this.collection.libraryId) {
        this.$router.replace('/bookshelf/collections')
      }
    }
  },
  mounted() {
    this.$eventBus.$on('library-changed', this.libraryChanged)
  },
  beforeDestroy() {
    this.$eventBus.$off('library-changed', this.libraryChanged)
  }
}
</script>
