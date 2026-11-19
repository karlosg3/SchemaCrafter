<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-surface-canvas">
    <SchemaCanvas v-if="ui.state.workspaceMode === 'database'" />
    <ModulesCanvas v-else-if="ui.state.workspaceMode === 'modules'" />
    <EndpointsView v-else />
  </div>
</template>
