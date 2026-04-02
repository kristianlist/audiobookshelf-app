<template>
  <div class="w-full h-full flex flex-col">
    <div v-if="totalCount" class="px-3 py-2 flex-shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-sm text-fg-muted">{{ $getString('LabelFinishedCount', [finishedCount, totalCount]) }}</p>
        <div class="flex items-center">
          <p v-if="totalRemainingDurationPretty" class="text-sm text-fg-muted mr-2">{{ $getString('LabelTimeRemaining', [totalRemainingDurationPretty]) }}</p>
          <ui-btn v-if="showPlayButton" color="success" :padding-x="4" :loading="playerIsStartingForThisMedia" small class="flex items-center justify-center w-24" @click="playClick">
            <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
            <span class="px-1 text-sm">{{ playerIsPlaying ? $strings.ButtonPause : $strings.ButtonPlay }}</span>
          </ui-btn>
        </div>
      </div>
      <div class="h-1 w-full bg-track/50 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-300" :class="overallProgressPercent >= 1 ? 'bg-success' : 'bg-yellow-400'" :style="{ width: overallProgressPercent * 100 + '%' }" />
      </div>
    </div>
    <div class="flex-grow min-h-0">
      <bookshelf-lazy-bookshelf page="series-books" :series-id="seriesId" v-on:downloadSeriesClick="downloadSeriesClick" />
    </div>
  </div>
</template>

<script>
import { Dialog } from '@capacitor/dialog'
import { AbsDownloader } from '@/plugins/capacitor'
import cellularPermissionHelpers from '@/mixins/cellularPermissionHelpers'

export default {
  async asyncData({ params, app, store, redirect }) {
    var series = await app.$nativeHttp.get(`/api/series/${params.id}`).catch((error) => {
      console.error('Failed', error)
      return false
    })
    if (!series) {
      return redirect('/oops?message=Series not found')
    }

    // Lookup matching local items and attach to series books
    if (series.books && series.books.length) {
      const localLibraryItems = (await app.$db.getLocalLibraryItems('book')) || []
      if (localLibraryItems.length) {
        series.books.forEach((book) => {
          const matchingLocalLibraryItem = localLibraryItems.find((lli) => lli.libraryItemId === book.id)
          if (!matchingLocalLibraryItem) return
          book.localLibraryItem = matchingLocalLibraryItem
        })
      }
    }

    store.commit('globals/setSeries', series)
    return {
      series,
      seriesId: params.id
    }
  },
  data() {
    return {
      mediaIdStartingPlayback: null,
      startingDownload: false,
      mediaType: 'book',
      booksPerFetch: 20,
      books: 0,
      missingFiles: 0,
      missingFilesSize: 0,
      libraryIds: []
    }
  },
  mixins: [cellularPermissionHelpers],
  computed: {
    isIos() {
      return this.$platform === 'ios'
    },
    bookItems() {
      return this.series?.books || []
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
    },
    playableItems() {
      return this.bookItems.filter((book) => {
        return !book.isMissing && !book.isInvalid && book.media?.tracks?.length
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
      return this.$store.state.playerIsStartingPlayback
    },
    playerIsStartingForThisMedia() {
      if (!this.mediaIdStartingPlayback) return false
      const mediaId = this.$store.state.playerStartingPlaybackMediaId
      return mediaId === this.mediaIdStartingPlayback
    },
    showPlayButton() {
      return this.playableItems.length
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
      this.$store.dispatch('queue/loadSeriesAsQueue', { series: this.series, startIndex })
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
    onPlaySeriesItem({ libraryItemId }) {
      // Find the index in playable items matching this library item
      const playableIndex = this.playableItems.findIndex((book) => book.id === libraryItemId)
      if (playableIndex >= 0) {
        this.playFromQueue(playableIndex)
      }
    },
    async downloadSeriesClick() {
      console.log('Download Series clicked')
      if (this.startingDownload) return

      const hasPermission = await this.checkCellularPermission('download')
      if (!hasPermission) return

      this.startingDownload = true
      setTimeout(() => {
        this.startingDownload = false
      }, 1000)

      await this.$hapticsImpact()
      this.download()
    },
    buildSearchParams() {
      let searchParams = new URLSearchParams()
      searchParams.set('filter', `series.${this.$encode(this.seriesId)}`)
      return searchParams.toString()
    },
    async fetchSeriesEntities(page) {
      const startIndex = page * this.booksPerFetch

      this.currentSFQueryString = this.buildSearchParams()

      const entityPath = `items`
      const sfQueryString = this.currentSFQueryString ? this.currentSFQueryString + '&' : ''
      const fullQueryString = `?${sfQueryString}limit=${this.booksPerFetch}&page=${page}&minified=1&include=rssfeed,numEpisodesIncomplete`

      const payload = await this.$nativeHttp.get(`/api/libraries/${this.series.libraryId}/${entityPath}${fullQueryString}`).catch((error) => {
        console.error('failed to fetch books', error)
        return null
      })

      if (payload && payload.results) {
        console.log('Received payload', payload)
        this.books = payload.total

        for (let i = 0; i < payload.results.length; i++) {
          if (!(await this.$db.getLocalLibraryItem(`local_${payload.results[i].id}`))) {
            this.missingFiles += payload.results[i].numFiles
            this.missingFilesSize += payload.results[i].size
            this.libraryIds.push(payload.results[i].id)
          }
        }
      }
      let totalPages = Math.ceil(this.books / this.booksPerFetch)
      if (totalPages > page + 1) {
        return false
      }
      return true
    },
    async download(selectedLocalFolder = null) {
      // Get the local folder to download to
      let localFolder = selectedLocalFolder
      if (!this.isIos && !localFolder) {
        const localFolders = (await this.$db.getLocalFolders()) || []
        console.log('Local folders loaded', localFolders.length)
        const foldersWithMediaType = localFolders.filter((lf) => {
          console.log('Checking local folder', lf.mediaType)
          return lf.mediaType == this.mediaType
        })
        console.log('Folders with media type', this.mediaType, foldersWithMediaType.length)
        const internalStorageFolder = foldersWithMediaType.find((f) => f.id === `internal-${this.mediaType}`)
        if (!foldersWithMediaType.length) {
          localFolder = {
            id: `internal-${this.mediaType}`,
            name: this.$strings.LabelInternalAppStorage,
            mediaType: this.mediaType
          }
        } else if (foldersWithMediaType.length === 1 && internalStorageFolder) {
          localFolder = internalStorageFolder
        } else {
          this.$store.commit('globals/showSelectLocalFolderModal', {
            mediaType: this.mediaType,
            callback: (folder) => {
              this.download(folder)
            }
          })
          return
        }
      }

      // Fetch series data from server
      let page = 0
      let fetchFinished = false
      this.missingFiles = 0
      this.missingFilesSize = 0
      while (fetchFinished === false) {
        fetchFinished = await this.fetchSeriesEntities(page)
        page += 1
      }
      if (fetchFinished !== true) {
        console.error('failed to fetch series books data')
        return null
      }
      if (this.missingFiles == 0) {
        alert(this.$getString('MessageSeriesAlreadyDownloaded'))
      }

      // Format message for dialog
      let startDownloadMessage = this.$getString('MessageSeriesDownloadConfirmIos', [this.libraryIds.length, this.missingFiles, this.$bytesPretty(this.missingFilesSize)])
      if (!this.isIos) {
        startDownloadMessage = this.$getString('MessageSeriesDownloadConfirm', [this.libraryIds.length, this.missingFiles, this.$bytesPretty(this.missingFilesSize), localFolder.name])
      }

      // Show confirmation dialog and start downloading if user chooses so
      const { value } = await Dialog.confirm({
        title: this.$strings.HeaderConfirm,
        message: startDownloadMessage
      })
      if (value) {
        for (let i = 0; i < this.libraryIds.length; i++) {
          this.startDownload(localFolder, this.libraryIds[i])
        }
      }
      this.libraryIds = []
    },
    async startDownload(localFolder = null, libraryItemId) {
      const payload = {
        libraryItemId: libraryItemId
      }
      if (localFolder) {
        console.log('Starting download to local folder', localFolder.name)
        payload.localFolderId = localFolder.id
      }
      var downloadRes = await AbsDownloader.downloadLibraryItem(payload)
      if (downloadRes && downloadRes.error) {
        var errorMsg = downloadRes.error || 'Unknown error'
        console.error('Download error', errorMsg)
        this.$toast.error(errorMsg)
      }
    }
  },
  mounted() {
    this.$eventBus.$on('download-series-click', this.downloadSeriesClick)
    this.$eventBus.$on('play-series-item', this.onPlaySeriesItem)
  },
  beforeDestroy() {
    this.$eventBus.$off('download-series-click', this.downloadSeriesClick)
    this.$eventBus.$off('play-series-item', this.onPlaySeriesItem)
  }
}
</script>
