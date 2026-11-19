<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const props = defineProps<{ search: string }>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const apiDialogs = useApiDialogs()

const modules = computed(() =>
  ui.activeDbId ? workspace.modulesOfDatabase(ui.activeDbId) : []
)

const visible = computed(() => {
  const q = props.search.trim().toLowerCase()
  if (!q) return modules.value
  return modules.value.filter(m =>
    m.name.toLowerCase().includes(q)
    || m.basePath.toLowerCase().includes(q)
    || (m.description?.toLowerCase().includes(q) ?? false)
  )
})

function onSelect(moduleId: string) {
  if (ui.state.workspaceMode === 'endpoints') {
    ui.openEndpointsForModule(moduleId)
  } else {
    ui.openModuleInCanvas(moduleId)
  }
}
</script>

<template>
  <PanelShell
    add-label="Add module"
    empty-message="No modules yet. Create one to group API endpoints."
    :can-add="!!ui.activeDbId"
    :is-empty="visible.length === 0"
    @add="ui.activeDbId && apiDialogs.createModule(ui.activeDbId)"
  >
    <SidebarRow
      v-for="mod in visible"
      :key="mod.id"
      :label="mod.name"
      :gradient="mod.gradient"
      :count="`${mod.endpointIds.length} ep`"
      :active="ui.selectedModuleId === mod.id || ui.endpointFilterModuleId === mod.id"
      @select="onSelect(mod.id)"
      @edit="apiDialogs.editModule(mod.id)"
      @remove="apiDialogs.removeModule(mod.id)"
    />
  </PanelShell>
</template>
