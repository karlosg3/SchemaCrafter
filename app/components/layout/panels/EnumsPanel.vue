<script setup lang="ts">
import { ENUM_GRADIENT } from '#shared/types/workspace'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'

const props = defineProps<{ search: string }>()

const ui = useUiStore()
const workspace = useWorkspaceStore()
const dialogs = useEntityDialogs()

const enums = computed(() => ui.activeSchemaId ? workspace.enumsOfSchema(ui.activeSchemaId) : [])

const visible = computed(() =>
  enums.value.filter(e => e.name.toLowerCase().includes(props.search.trim().toLowerCase()))
)
</script>

<template>
  <PanelShell
    add-label="Add enum"
    empty-message="No enums match."
    :can-add="!!ui.activeSchemaId"
    :is-empty="visible.length === 0"
    @add="ui.activeSchemaId && dialogs.createEnum(ui.activeSchemaId)"
  >
    <SidebarRow
      v-for="e in visible"
      :key="e.id"
      :label="e.name"
      :gradient="ENUM_GRADIENT"
      :count="e.values.length"
      @select="dialogs.editEnum(e.id)"
      @edit="dialogs.editEnum(e.id)"
      @remove="dialogs.remove('enum', e.id)"
    />
  </PanelShell>
</template>
