# AGENTS.md — audiobookshelf-app

## Project Overview

Mobile client for [audiobookshelf](https://github.com/advplyr/audiobookshelf), built with **Nuxt 2** (Vue 2 Options API), **Capacitor 7**, and **Tailwind CSS 3**. Targets Android and iOS via Capacitor; also runs in the browser for development. No TypeScript — pure JavaScript throughout.

## Build & Development Commands

```bash
npm ci                          # Install dependencies (use ci, not install, for reproducible builds)
npm run dev                     # Dev server at http://0.0.0.0:1337
npm run build                   # Production Nuxt build
npm run generate                # Static site generation
npm run sync                    # Generate + Capacitor sync (copies web assets to native projects)
npx cap sync                    # Sync web assets to Android/iOS without regenerating
```

### Android build (CI)

```bash
npm run generate
npx cap sync
./android/gradlew assembleDebug -p android --no-daemon
```

### No test suite or linter

This project has **no test framework, no ESLint, and no CI lint step**. Code style is enforced only by Prettier (see below). There is no single-test command.

### i18n CI check

A GitHub Actions workflow verifies that all JSON files in `strings/` are alphabetized using `audiobookshelf/audiobookshelf-i18n-updater`. Keep translation keys in alphabetical order.

## Code Style

### Prettier (authoritative config — `.prettierrc`)

| Setting         | Value   |
|-----------------|---------|
| Semicolons      | **No**  |
| Quotes          | Single  |
| Print width     | 400     |
| Trailing commas | None    |
| Prose wrap      | Never   |

HTML files use double quotes. All other files use single quotes.

### EditorConfig (`.editorconfig`)

- 2-space indentation (4-space for `.swift`)
- UTF-8, LF line endings, final newline, trim trailing whitespace

### Formatting rules (summary)

- **No semicolons** — omit them everywhere.
- **Single quotes** — except in HTML attributes.
- **No trailing commas** — `{ a: 1, b: 2 }` not `{ a: 1, b: 2, }`.
- **Very long lines are acceptable** — the print width is 400; do not manually wrap.
- **2-space indent** in JS/Vue/JSON. 4-space indent in Swift.

## Vue / Nuxt Conventions

### Component structure

Always order blocks: `<template>` → `<script>` → `<style>` (if present).

### Options API only

Every component uses Vue 2 Options API (`export default { ... }`). **Do not use Composition API or `<script setup>`.**

### Options ordering within `<script>`

```
props → mixins → data() → watch → computed → methods → mounted() → beforeDestroy()
```

(`asyncData` goes first when used in pages.)

### Props

Use type-only shorthand for simple props, object form when a default is needed:

```js
props: {
  libraryItemId: String,
  width: {
    type: Number,
    default: 120
  },
  bookmarks: {
    type: Array,
    default: () => []
  }
}
```

Prop names are always **camelCase**.

### Events

- `this.$emit('eventName', payload)` for parent communication.
- v-model pattern: `value` prop + `$emit('input', val)`, often via computed getter/setter.
- Cross-component: `this.$eventBus.$emit` / `$on` / `$off` (global event bus).
- Always clean up listeners in `beforeDestroy`.

### Component references in templates

Use **kebab-case with directory prefix** (Nuxt auto-import convention):

```html
<covers-book-cover />
<widgets-loading-spinner />
<modals-chapters-modal />
<ui-text-input />
```

### Component filenames

**PascalCase**: `LazyBookCard.vue`, `SleepTimerModal.vue`, `TextInput.vue`.

### Styling

Use **Tailwind utility classes** inline. Minimize `<style>` blocks. When needed, `<style scoped>` is preferred. CSS custom properties (e.g. `--cover-image-width`) are used for dynamic layout.

## JavaScript Conventions

### Naming

| Thing                | Convention          | Example                            |
|----------------------|---------------------|------------------------------------|
| Variables/functions  | camelCase           | `libraryItemId`, `onPlayingUpdate` |
| Constants/enums      | PascalCase object   | `DownloadStatus.PENDING`           |
| Enum values          | UPPER_SNAKE_CASE    | `SyncStatus.FAILED`                |
| Classes              | PascalCase          | `ServerSocket`, `DbService`        |
| Booleans             | `is`/`has`/`show`   | `isModalOpen`, `showReader`        |
| Toggle methods       | `toggle` prefix     | `toggleFinished`                   |
| Event handlers       | `on` prefix         | `onPlaybackSession`                |

### Variable declarations

`const` preferred; `let` when reassignment is needed. Legacy `var` exists in older code and is tolerated — do not introduce new `var` usage.

### Imports

- **ES `import`** is standard. Use `require()` only when necessary for CommonJS interop.
- Path alias: **`@/`** (e.g. `@/plugins/capacitor`, `@/mixins/jumpLabel`). Do not use `~/`.
- Relative paths (`./`, `../`) only within the same directory tree (e.g. inside `plugins/capacitor/`).
- No enforced import ordering; general convention: third-party → internal → local.

### Error handling

- `console.error('[Tag] message', error)` with a bracketed prefix for module identification.
- User-facing errors: `this.$toast.error(message)`.
- Use `.catch()` on promises or `try/catch` with async/await.

### Comments

- Line comments (`//`) only — no block comments.
- Comment the *why*, not the *what*.
- Use `// TODO:` for known missing functionality.
- Bracketed tags for log/error context: `[SOCKET]`, `[LocalStorage]`, `[nativeHttp]`.

## State Management (Vuex)

Four store modules: `index.js` (root), `user.js`, `libraries.js`, `globals.js`.

- State is always a factory function: `export const state = () => ({ ... })`.
- Mutations use camelCase with `set`/`add`/`update`/`remove` prefixes.
- Getters use camelCase; parameterized getters return a function.
- Actions use `async/await` and access injected services (`this.$nativeHttp`, `this.$db`, etc.).
- Components access store via `this.$store.state`, `this.$store.getters`, `this.$store.commit`, `this.$store.dispatch`.

## Capacitor / Native Patterns

Custom Capacitor plugins live in `plugins/capacitor/`:

| Module              | Purpose                          |
|---------------------|----------------------------------|
| `AbsAudioPlayer.js` | Audio playback control           |
| `AbsDownloader.js`  | File download management         |
| `AbsFileSystem.js`  | Local file system access         |
| `AbsDatabase.js`    | Device data, server config, etc. |
| `AbsLogger.js`      | Structured logging               |

Each plugin has a **Web fallback class** extending `WebPlugin` for browser testing. Registered via `registerPlugin('PluginName', { web: () => new PluginWeb() })`.

Higher-level services wrap these plugins and are injected into the Nuxt context:

| Injected as      | Source file             | Purpose                                    |
|------------------|-------------------------|--------------------------------------------|
| `this.$db`       | `plugins/db.js`         | Wraps AbsDatabase                          |
| `this.$nativeHttp` | `plugins/nativeHttp.js` | HTTP with auth, 401 retry, token refresh |
| `this.$localStore` | `plugins/localStore.js` | Key-value storage via Preferences         |
| `this.$socket`   | `plugins/server.js`     | Socket.io real-time communication          |
| `this.$hapticsImpact` | `plugins/haptics.js` | Haptic feedback                          |

Platform detection: `this.$platform` returns `'ios'`, `'android'`, or `'web'`.

## i18n

- Translation files are JSON in `strings/` (39 languages). Source of truth: `strings/en-us.json`.
- Keys must be **alphabetically sorted** (enforced by CI).
- In components, use `this.$strings.keyName` or `this.$getString('key', [substitutions])`.
- Custom i18n system in `plugins/i18n.js` — not vue-i18n.

## Directory Structure

```
components/
  app/          # App shell (Appbar, AudioPlayer, SideDrawer)
  bookshelf/    # Bookshelf views
  cards/        # Library item cards
  covers/       # Cover images
  modals/       # Modal dialogs (with sub-dirs: bookmarks, downloads, playlists, rssfeeds)
  readers/      # E-reader components (Epub, PDF, Comic, Mobi)
  tables/       # Data tables (with sub-dirs: collection, ebook, playlist, podcast)
  ui/           # Reusable primitives (Btn, TextInput, Checkbox, Dropdown)
  widgets/      # Small indicators (SpinnerIcon, CircleProgress)
layouts/        # Nuxt layouts
pages/          # File-based routing (dynamic routes use _param convention)
plugins/        # Nuxt plugins and Capacitor bridge
  capacitor/    # Native plugin wrappers
store/          # Vuex modules
mixins/         # Vue mixins
objects/        # Plain JS data classes
strings/        # i18n JSON files
assets/         # CSS and JS assets
static/         # Static files served as-is
android/        # Android native project
ios/            # iOS native project
```
