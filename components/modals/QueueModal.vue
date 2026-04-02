<template>
  <modals-modal v-model="show" :width="400" max-width="95%" height="100%">
    <template #outer>
      <div class="absolute top-10 left-4 z-40 pt-1" style="max-width: 80%">
        <p class="text-white text-lg truncate">{{ queueSourceName }}</p>
        <p class="text-white text-opacity-60 text-xs">{{ $getString('LabelItems', [queueLength]) }}</p>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div ref="container" class="w-full overflow-x-hidden overflow-y-auto bg-secondary rounded-lg border border-fg/20" style="max-height: 75%" @click.stop>
        <!-- Header with shuffle/repeat controls -->
        <div class="sticky top-0 z-10 bg-secondary flex items-center justify-between px-3 py-2 border-b border-fg/10 transition-shadow" :class="{ 'shadow-md': isScrolled }">
          <div class="flex items-center">
            <span class="material-symbols text-2xl cursor-pointer mr-3" :class="shuffled ? 'text-success' : 'text-fg-muted'" @click="toggleShuffle">shuffle</span>
            <span class="material-symbols text-2xl cursor-pointer" :class="repeatMode !== 'none' ? 'text-success' : 'text-fg-muted'" @click="cycleRepeatMode">{{ repeatModeIcon }}</span>
          </div>
          <p class="text-fg-muted text-sm font-mono">{{ currentIndex + 1 }} / {{ queueLength }}</p>
        </div>

        <!-- Queue items list -->
        <ul class="h-full w-full" role="listbox">
          <li v-for="(item, index) in items" :key="index" :id="`queue-row-${index}`" class="text-fg select-none relative cursor-pointer" :class="index === currentIndex ? 'bg-primary bg-opacity-80' : ''" role="option" @click="jumpToIndex(index)">
            <div class="flex items-center px-3 py-3">
              <div class="w-6 min-w-6 mr-2 text-center">
                <span v-if="index === currentIndex && isPlaying" class="material-symbols text-lg text-success fill">graphic_eq</span>
                <span v-else class="text-sm font-mono text-fg-muted">{{ index + 1 }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm truncate" :class="index === currentIndex ? 'text-fg font-medium' : 'text-fg/80'">{{ item.title }}</p>
                <p v-if="item.author" class="text-xs text-fg-muted truncate">{{ item.author }}</p>
              </div>
              <div class="ml-2 text-right min-w-[50px]">
                <span class="font-mono text-fg-muted text-xs">{{ $elapsedPretty(item.duration) }}</span>
              </div>
            </div>

            <div v-show="index === currentIndex" class="w-0.5 h-full absolute top-0 left-0 bg-yellow-400" />
          </li>
        </ul>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  data() {
    return {
      isScrolled: false
    }
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.$nextTick(this.scrollToCurrent)
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.globals.showQueueModal
      },
      set(val) {
        this.$store.commit('globals/setShowQueueModal', val)
      }
    },
    items() {
      return this.$store.state.queue.items
    },
    currentIndex() {
      return this.$store.state.queue.currentIndex
    },
    queueLength() {
      return this.$store.getters['queue/queueLength']
    },
    shuffled() {
      return this.$store.state.queue.shuffled
    },
    repeatMode() {
      return this.$store.state.queue.repeatMode
    },
    repeatModeIcon() {
      if (this.repeatMode === 'repeat-one') return 'repeat_one'
      return 'repeat'
    },
    queueSource() {
      return this.$store.state.queue.source
    },
    queueSourceName() {
      if (!this.queueSource) return this.$strings.HeaderQueue
      return this.queueSource.name || this.$strings.HeaderQueue
    },
    isPlaying() {
      return this.$store.state.playerIsPlaying
    }
  },
  methods: {
    async jumpToIndex(index) {
      if (index === this.currentIndex) return
      await this.$hapticsImpact()
      const payload = await this.$store.dispatch('queue/jumpToIndex', index)
      if (payload) {
        this.$store.commit('setPlayerIsStartingPlayback', payload.episodeId || payload.libraryItemId)
        this.$eventBus.$emit('play-item', payload)
      }
      this.show = false
    },
    toggleShuffle() {
      this.$store.dispatch('queue/toggleShuffle')
    },
    cycleRepeatMode() {
      this.$store.dispatch('queue/cycleRepeatMode')
    },
    scrollToCurrent() {
      if (this.currentIndex < 0) return
      const container = this.$refs.container
      if (container) {
        const currentEl = document.getElementById(`queue-row-${this.currentIndex}`)
        if (currentEl) {
          const offsetTop = currentEl.offsetTop
          const containerHeight = container.clientHeight
          container.scrollTo({ top: offsetTop - containerHeight / 2 })
        }
      }
    },
    handleScroll() {
      const container = this.$refs.container
      if (container) {
        this.isScrolled = container.scrollTop > 0
      }
    }
  },
  mounted() {
    const container = this.$refs.container
    if (container) {
      container.addEventListener('scroll', this.handleScroll)
    }
  },
  beforeDestroy() {
    const container = this.$refs.container
    if (container) {
      container.removeEventListener('scroll', this.handleScroll)
    }
  }
}
</script>
