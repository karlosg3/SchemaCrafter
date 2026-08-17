export default defineAppConfig({
  ui: {
    colors: {
      primary: 'accent',
      neutral: 'slate'
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
