import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY = 'playbackQueue'

export const state = () => ({
  items: [], // Normalized queue items
  currentIndex: -1,
  originalOrder: [], // Stored when shuffle is activated, used to restore order
  shuffled: false,
  repeatMode: 'none', // 'none' | 'repeat-all' | 'repeat-one'
  source: null, // { type: 'collection'|'playlist'|'series', id: String, name: String }
  isActive: false
})

export const getters = {
  currentItem: (state) => {
    if (state.currentIndex < 0 || state.currentIndex >= state.items.length) return null
    return state.items[state.currentIndex]
  },
  nextItem: (state) => {
    if (state.repeatMode === 'repeat-one') return state.items[state.currentIndex] || null
    const nextIndex = state.currentIndex + 1
    if (nextIndex < state.items.length) return state.items[nextIndex]
    if (state.repeatMode === 'repeat-all' && state.items.length) return state.items[0]
    return null
  },
  previousItem: (state) => {
    const prevIndex = state.currentIndex - 1
    if (prevIndex >= 0) return state.items[prevIndex]
    if (state.repeatMode === 'repeat-all' && state.items.length) return state.items[state.items.length - 1]
    return null
  },
  hasNext: (state) => {
    if (state.repeatMode === 'repeat-one' || state.repeatMode === 'repeat-all') return state.items.length > 0
    return state.currentIndex < state.items.length - 1
  },
  hasPrevious: (state) => {
    if (state.repeatMode === 'repeat-all') return state.items.length > 0
    return state.currentIndex > 0
  },
  queueLength: (state) => {
    return state.items.length
  },
  isItemInQueue: (state) => (libraryItemId, episodeId) => {
    return state.items.some((item) => {
      if (episodeId) return item.libraryItemId === libraryItemId && item.episodeId === episodeId
      return item.libraryItemId === libraryItemId && !item.episodeId
    })
  },
  getQueueIndexForItem: (state) => (libraryItemId, episodeId) => {
    return state.items.findIndex((item) => {
      if (episodeId) return item.libraryItemId === libraryItemId && item.episodeId === episodeId
      return item.libraryItemId === libraryItemId && !item.episodeId
    })
  }
}

export const actions = {
  /**
   * Load a collection's books into the queue
   *
   * @param {Object} context - Vuex action context
   * @param {Object} payload
   * @param {Object} payload.collection - Collection object with books array
   * @param {number} [payload.startIndex] - Index to start playing from (in playable items)
   */
  loadCollectionAsQueue({ commit, dispatch, rootGetters }, { collection, startIndex }) {
    const playableBooks = (collection.books || []).filter((book) => {
      return !book.isMissing && !book.isInvalid && book.media?.tracks?.length
    })

    const items = playableBooks.map((book) => ({
      libraryItemId: book.id,
      episodeId: null,
      title: book.media?.metadata?.title || '',
      author: book.media?.metadata?.authorName || '',
      duration: book.media?.duration || 0,
      localLibraryItemId: book.localLibraryItem?.id || null,
      serverLibraryItemId: book.id
    }))

    let index = startIndex
    if (index === undefined || index === null) {
      // Find first unfinished item
      index = playableBooks.findIndex((book) => {
        const prog = rootGetters['user/getUserMediaProgress'](book.id)
        return !prog?.isFinished
      })
      if (index < 0) index = 0
    }

    commit('setQueue', {
      items,
      currentIndex: index,
      source: { type: 'collection', id: collection.id, name: collection.name || '' }
    })

    dispatch('persistQueue')
  },

  /**
   * Load a playlist's items into the queue
   *
   * @param {Object} context - Vuex action context
   * @param {Object} payload
   * @param {Object} payload.playlist - Playlist object with items array
   * @param {number} [payload.startIndex] - Index to start playing from (in playable items)
   */
  loadPlaylistAsQueue({ commit, dispatch, rootGetters }, { playlist, startIndex }) {
    const playableItems = (playlist.items || []).filter((item) => {
      const libraryItem = item.libraryItem
      if (libraryItem.isMissing || libraryItem.isInvalid) return false
      if (item.episode) return !!item.episode.audioFile
      return libraryItem.media?.tracks?.length > 0
    })

    const items = playableItems.map((item) => ({
      libraryItemId: item.libraryItemId,
      episodeId: item.episodeId || null,
      title: item.episode ? item.episode.title : item.libraryItem?.media?.metadata?.title || '',
      author: item.episode ? item.libraryItem?.media?.metadata?.author || '' : (item.libraryItem?.media?.metadata?.authors || []).map((a) => a.name).join(', '),
      duration: item.episode ? item.episode.duration : item.libraryItem?.media?.duration || 0,
      localLibraryItemId: item.localLibraryItem?.id || null,
      localEpisodeId: item.localEpisode?.id || null,
      serverLibraryItemId: item.libraryItemId,
      serverEpisodeId: item.episodeId || null
    }))

    let index = startIndex
    if (index === undefined || index === null) {
      // Find first unfinished item
      index = playableItems.findIndex((item) => {
        const prog = rootGetters['user/getUserMediaProgress'](item.libraryItemId, item.episodeId)
        return !prog?.isFinished
      })
      if (index < 0) index = 0
    }

    commit('setQueue', {
      items,
      currentIndex: index,
      source: { type: 'playlist', id: playlist.id, name: playlist.name || '' }
    })

    dispatch('persistQueue')
  },

  /**
   * Load a series' books into the queue
   *
   * @param {Object} context - Vuex action context
   * @param {Object} payload
   * @param {Object} payload.series - Series object with books array
   * @param {number} [payload.startIndex] - Index to start playing from (in playable items)
   */
  loadSeriesAsQueue({ commit, dispatch, rootGetters }, { series, startIndex }) {
    const playableBooks = (series.books || []).filter((book) => {
      return !book.isMissing && !book.isInvalid && book.media?.tracks?.length
    })

    const items = playableBooks.map((book) => ({
      libraryItemId: book.id,
      episodeId: null,
      title: book.media?.metadata?.title || '',
      author: book.media?.metadata?.authorName || '',
      duration: book.media?.duration || 0,
      localLibraryItemId: book.localLibraryItem?.id || null,
      serverLibraryItemId: book.id
    }))

    let index = startIndex
    if (index === undefined || index === null) {
      // Find first unfinished item
      index = playableBooks.findIndex((book) => {
        const prog = rootGetters['user/getUserMediaProgress'](book.id)
        return !prog?.isFinished
      })
      if (index < 0) index = 0
    }

    commit('setQueue', {
      items,
      currentIndex: index,
      source: { type: 'series', id: series.id, name: series.name || '' }
    })

    dispatch('persistQueue')
  },

  /**
   * Build the play-item event payload for a queue item
   *
   * @param {Object} context - Vuex action context
   * @param {Object} queueItem - Normalized queue item
   * @returns {Object} Payload for the play-item event
   */
  getPlayItemPayload(_, queueItem) {
    if (!queueItem) return null

    if (queueItem.localLibraryItemId) {
      return {
        libraryItemId: queueItem.localLibraryItemId,
        episodeId: queueItem.localEpisodeId || undefined,
        serverLibraryItemId: queueItem.serverLibraryItemId || queueItem.libraryItemId,
        serverEpisodeId: queueItem.serverEpisodeId || queueItem.episodeId || undefined
      }
    }

    return {
      libraryItemId: queueItem.libraryItemId,
      episodeId: queueItem.episodeId || undefined
    }
  },

  /**
   * Advance to the next item in the queue
   *
   * @param {Object} context - Vuex action context
   * @returns {Object|null} The play-item payload, or null if no next item
   */
  async playNext({ state, commit, dispatch }) {
    if (!state.isActive || !state.items.length) return null

    if (state.repeatMode === 'repeat-one') {
      const currentItem = state.items[state.currentIndex]
      const payload = await dispatch('getPlayItemPayload', currentItem)
      if (payload) payload.startTime = 0
      return payload
    }

    let nextIndex = state.currentIndex + 1
    if (nextIndex >= state.items.length) {
      if (state.repeatMode === 'repeat-all') {
        nextIndex = 0
      } else {
        return null
      }
    }

    commit('setCurrentIndex', nextIndex)
    dispatch('persistQueue')
    return dispatch('getPlayItemPayload', state.items[nextIndex])
  },

  /**
   * Go to the previous item in the queue
   *
   * @returns {Object|null} The play-item payload, or null if no previous item
   */
  async playPrevious({ state, commit, dispatch }) {
    if (!state.isActive || !state.items.length) return null

    let prevIndex = state.currentIndex - 1
    if (prevIndex < 0) {
      if (state.repeatMode === 'repeat-all') {
        prevIndex = state.items.length - 1
      } else {
        return null
      }
    }

    commit('setCurrentIndex', prevIndex)
    dispatch('persistQueue')
    return dispatch('getPlayItemPayload', state.items[prevIndex])
  },

  /**
   * Jump to a specific item in the queue by index
   *
   * @returns {Object|null} The play-item payload
   */
  async jumpToIndex({ state, commit, dispatch }, index) {
    if (index < 0 || index >= state.items.length) return null

    commit('setCurrentIndex', index)
    dispatch('persistQueue')
    return dispatch('getPlayItemPayload', state.items[index])
  },

  /**
   * Toggle shuffle mode. When enabling, shuffles items but keeps current item at current position.
   * When disabling, restores original order and finds the current item's new position.
   */
  toggleShuffle({ state, commit, dispatch }) {
    if (state.shuffled) {
      // Unshuffle: restore original order
      const currentItem = state.items[state.currentIndex]
      const restoredItems = [...state.originalOrder]
      let newIndex = 0
      if (currentItem) {
        newIndex = restoredItems.findIndex((item) => item.libraryItemId === currentItem.libraryItemId && item.episodeId === currentItem.episodeId)
        if (newIndex < 0) newIndex = 0
      }

      commit('unshuffle', { items: restoredItems, currentIndex: newIndex })
    } else {
      // Shuffle: save original order, then Fisher-Yates shuffle
      const originalOrder = [...state.items]
      const currentItem = state.items[state.currentIndex]
      const shuffledItems = [...state.items]

      // Fisher-Yates shuffle
      for (let i = shuffledItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffledItems[i], shuffledItems[j]] = [shuffledItems[j], shuffledItems[i]]
      }

      // Move current item to current index position
      if (currentItem) {
        const currentItemShuffledIndex = shuffledItems.findIndex((item) => item.libraryItemId === currentItem.libraryItemId && item.episodeId === currentItem.episodeId)
        if (currentItemShuffledIndex >= 0 && currentItemShuffledIndex !== state.currentIndex) {
          ;[shuffledItems[state.currentIndex], shuffledItems[currentItemShuffledIndex]] = [shuffledItems[currentItemShuffledIndex], shuffledItems[state.currentIndex]]
        }
      }

      commit('shuffle', { items: shuffledItems, originalOrder })
    }

    dispatch('persistQueue')
  },

  /**
   * Cycle through repeat modes: none -> repeat-all -> repeat-one -> none
   */
  cycleRepeatMode({ state, commit, dispatch }) {
    const modes = ['none', 'repeat-all', 'repeat-one']
    const currentModeIndex = modes.indexOf(state.repeatMode)
    const nextMode = modes[(currentModeIndex + 1) % modes.length]
    commit('setRepeatMode', nextMode)
    dispatch('persistQueue')
  },

  /**
   * Persist the current queue state to local storage
   */
  async persistQueue({ state }) {
    try {
      const queueData = {
        items: state.items,
        currentIndex: state.currentIndex,
        originalOrder: state.originalOrder,
        shuffled: state.shuffled,
        repeatMode: state.repeatMode,
        source: state.source,
        isActive: state.isActive
      }
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(queueData) })
    } catch (error) {
      console.error('[Queue] Failed to persist queue', error)
    }
  },

  /**
   * Restore the queue state from local storage
   */
  async restoreQueue({ commit }) {
    try {
      const result = await Preferences.get({ key: STORAGE_KEY })
      if (!result?.value) return false

      const queueData = JSON.parse(result.value)
      if (!queueData || !queueData.items?.length) return false

      commit('restoreQueue', queueData)
      return true
    } catch (error) {
      console.error('[Queue] Failed to restore queue', error)
      return false
    }
  },

  /**
   * Update the current index to match a currently playing item
   * Called when playback starts to keep queue in sync
   */
  syncCurrentIndex({ state, commit, dispatch }, { libraryItemId, episodeId }) {
    const index = state.items.findIndex((item) => {
      // Match by server IDs or local IDs
      const matchesLibraryItem = item.libraryItemId === libraryItemId || item.localLibraryItemId === libraryItemId || item.serverLibraryItemId === libraryItemId
      if (!matchesLibraryItem) return false
      if (episodeId) return item.episodeId === episodeId || item.localEpisodeId === episodeId || item.serverEpisodeId === episodeId
      return !item.episodeId
    })

    if (index >= 0 && index !== state.currentIndex) {
      commit('setCurrentIndex', index)
      dispatch('persistQueue')
    }
  },

  /**
   * Clear the queue
   */
  clearQueue({ commit, dispatch }) {
    commit('clearQueue')
    dispatch('persistQueue')
  }
}

export const mutations = {
  setQueue(state, { items, currentIndex, source }) {
    state.items = items
    state.currentIndex = currentIndex
    state.source = source
    state.isActive = true
    state.shuffled = false
    state.originalOrder = []
  },
  clearQueue(state) {
    state.items = []
    state.currentIndex = -1
    state.originalOrder = []
    state.shuffled = false
    state.repeatMode = 'none'
    state.source = null
    state.isActive = false
  },
  setCurrentIndex(state, index) {
    state.currentIndex = index
  },
  setRepeatMode(state, mode) {
    state.repeatMode = mode
  },
  shuffle(state, { items, originalOrder }) {
    state.originalOrder = originalOrder
    state.items = items
    state.shuffled = true
  },
  unshuffle(state, { items, currentIndex }) {
    state.items = items
    state.currentIndex = currentIndex
    state.originalOrder = []
    state.shuffled = false
  },
  removeItem(state, index) {
    if (index < 0 || index >= state.items.length) return
    state.items.splice(index, 1)
    if (state.originalOrder.length) {
      // Also remove from original order
      const item = state.items[index]
      if (item) {
        const origIndex = state.originalOrder.findIndex((oi) => oi.libraryItemId === item.libraryItemId && oi.episodeId === item.episodeId)
        if (origIndex >= 0) state.originalOrder.splice(origIndex, 1)
      }
    }
    // Adjust current index if needed
    if (index < state.currentIndex) {
      state.currentIndex--
    } else if (index === state.currentIndex) {
      // Current item was removed
      if (state.currentIndex >= state.items.length) {
        state.currentIndex = Math.max(0, state.items.length - 1)
      }
    }
    if (!state.items.length) {
      state.isActive = false
      state.currentIndex = -1
    }
  },
  restoreQueue(state, queueData) {
    state.items = queueData.items || []
    state.currentIndex = queueData.currentIndex ?? -1
    state.originalOrder = queueData.originalOrder || []
    state.shuffled = !!queueData.shuffled
    state.repeatMode = queueData.repeatMode || 'none'
    state.source = queueData.source || null
    state.isActive = !!queueData.isActive
  }
}
