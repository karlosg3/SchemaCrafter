<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const props = defineProps<{ search: string }>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()

// Scoped to the active schema, matching the prototype's "Tables · <schema>".
const tables = computed(() => ui.activeSchemaId ? workspace.tablesOfSchema(ui.activeSchemaId) : [])

const visible = computed(() =>
  tables.value.filter(t => t.name.toLowerCase().includes(props.search.trim().toLowerCase()))
)
</script>

<template>
  <PanelShell
    add-label="Add table"
    empty-message="No tables match."
    :can-add="!!ui.activeSchemaId"
    :is-empty="visible.length === 0"
    @add="ui.activeSchemaId && dialogs.createTable(ui.activeSchemaId)"
  >
    <SidebarRow
      v-for="t in visible"
      :key="t.id"
      :label="t.name"
      :gradient="t.gradient"
      :count="t.columns.length"
      :active="ui.focusTargetId === t.id"
      @select="ui.openTableInDatabase(t.id)"
      @edit="dialogs.editTable(t.id)"
      @remove="dialogs.remove('table', t.id)"
    />
  </PanelShell>
</template>
