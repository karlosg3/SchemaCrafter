<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const props = defineProps<{ search: string }>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()

const visible = computed(() =>
  workspace.databases.filter(d => d.name.toLowerCase().includes(props.search.trim().toLowerCase()))
)
</script>

<template>
  <PanelShell
    add-label="Add database"
    empty-message="No databases match."
    :is-empty="visible.length === 0"
    @add="dialogs.createDatabase()"
  >
    <SidebarRow
      v-for="db in visible"
      :key="db.id"
      :label="db.name"
      :gradient="db.gradient"
      :count="workspace.schemasOfDatabase(db.id).length"
      :active="db.id === ui.activeDbId"
      :deletable="workspace.databases.length > 1"
      delete-hint="The last database cannot be deleted"
      @select="ui.selectDatabase(db.id); ui.requestFocus(db.id)"
      @edit="dialogs.editDatabase(db.id)"
      @remove="dialogs.remove('database', db.id)"
    />
  </PanelShell>
</template>
