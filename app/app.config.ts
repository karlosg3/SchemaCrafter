export default defineAppConfig({
  ui: {
    colors: {
      primary: 'accent',
      neutral: 'slate'
    },

    // Map all built-in Nuxt UI icons to locally installed @iconify-json/ph
    // so zero external lucide fetches happen in offline Tauri desktop builds.
    icons: {
      arrowDown: 'i-ph-arrow-down',
      arrowLeft: 'i-ph-arrow-left',
      arrowRight: 'i-ph-arrow-right',
      arrowUp: 'i-ph-arrow-up',
      caution: 'i-ph-warning-circle',
      check: 'i-ph-check',
      chevronDoubleLeft: 'i-ph-caret-double-left',
      chevronDoubleRight: 'i-ph-caret-double-right',
      chevronDown: 'i-ph-caret-down',
      chevronLeft: 'i-ph-caret-left',
      chevronRight: 'i-ph-caret-right',
      chevronUp: 'i-ph-caret-up',
      close: 'i-ph-x',
      copy: 'i-ph-copy',
      copyCheck: 'i-ph-check',
      dark: 'i-ph-moon',
      drag: 'i-ph-dots-six-vertical',
      ellipsis: 'i-ph-dots-three',
      error: 'i-ph-x-circle',
      external: 'i-ph-arrow-up-right',
      eye: 'i-ph-eye',
      eyeOff: 'i-ph-eye-slash',
      file: 'i-ph-file',
      folder: 'i-ph-folder',
      folderOpen: 'i-ph-folder-open',
      hash: 'i-ph-hash',
      info: 'i-ph-info',
      light: 'i-ph-sun',
      loading: 'i-ph-spinner-gap',
      menu: 'i-ph-list',
      minus: 'i-ph-minus',
      panelClose: 'i-ph-sidebar-simple-fill',
      panelOpen: 'i-ph-sidebar-simple',
      plus: 'i-ph-plus',
      reload: 'i-ph-arrow-counter-clockwise',
      search: 'i-ph-magnifying-glass',
      stop: 'i-ph-square',
      star: 'i-ph-star',
      success: 'i-ph-check-circle',
      system: 'i-ph-monitor',
      tip: 'i-ph-lightbulb',
      upload: 'i-ph-upload-simple',
      warning: 'i-ph-warning'
    },

    /**
     * Nuxt UI's dashboard primitives assume they *are* the page: the group is
     * `fixed inset-0` and both sidebar and panel roots are `min-h-svh`. Our
     * shell puts a full-width navbar above them, so the group has to become an
     * ordinary flex child and the panels have to size to it rather than to the
     * viewport. tailwind-merge resolves each of these in favour of the override.
     */
    dashboardGroup: {
      base: 'relative flex-1 min-h-0 flex overflow-hidden'
    },
    dashboardSidebar: {
      slots: {
        // min-w-0 so `collapsedSize: 0` actually reaches zero. The theme's
        // min-w-16 exists for Nuxt UI's icon-rail collapse; our left sidebar
        // carries its own 56px rail, so a 64px stub would just be a clipped one.
        root: 'min-h-0 h-full min-w-0',
        // The sm: variants have to be restated: tailwind-merge only drops a
        // class a later one conflicts with at the *same* breakpoint, so a bare
        // `p-0` leaves the theme's `sm:p-6` to win on every real viewport.
        body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-hidden'
      }
    },
    dashboardPanel: {
      slots: {
        // The separator between canvas and code panel is the sidebar's own
        // 2px border; without this the panel draws a second 1px one beside it.
        root: 'min-h-0 h-full lg:not-last:border-e-0',
        // The sm: variants have to be restated: tailwind-merge only drops a
        // class a later one conflicts with at the *same* breakpoint, so a bare
        // `p-0` leaves the theme's `sm:p-6` to win on every real viewport.
        body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-hidden'
      }
    }
  }
})
