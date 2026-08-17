<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const props = defineProps<{ search: string }>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()

const schemas = computed(() => ui.activeDbId ? workspace.schemasOfDatabase(ui.activeDbId) : [])

const visible = computed(() =>
  schemas.value.filter(s => s.name.toLowerCase().includes(props.search.trim().toLowerCase()))
)

/** refactor-plan.md:46 — a schema is only deletable while it holds nothing. */
function deletable(id: string) {
  const schema = workspace.schema(id)
  return !!schema && schema.tableIds.length === 0 && schema.enumIds.length === 0
}
</script>

<template>
  <PanelShell
    add-label="Add schema"
    empty-message="No schemas match."
    :can-add="!!ui.activeDbId"
    :is-empty="visible.length === 0"
    @add="ui.activeDbId && dialogs.createSchema(ui.activeDbId)"
  >
    <SidebarRow
      v-for="s in visible"
      :key="s.id"
      :label="s.name"
      :gradient="s.gradient"
      :count="workspace.tablesOfSchema(s.id).length"
      :active="s.id === ui.activeSchemaId"
      :deletable="deletable(s.id)"
      delete-hint="Schema is not empty"
      @select="ui.drillInto('tables', s.id)"
      @edit="dialogs.editSchema(s.id)"
      @remove="dialogs.remove('schema', s.id)"
    />
  </PanelShell>
</template>
