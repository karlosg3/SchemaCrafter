import type { HttpMethod } from '#shared/types/workspace'

/**
 * Semantic HTTP method badge colours matching Scalar / Swagger visual conventions
 * across both dark and light modes.
 */
export const HTTP_METHOD_BADGE: Record<HttpMethod, string> = {
  GET: 'bg-sky-500/14 text-sky-400 border-sky-500/30 [.light_&]:text-sky-700 [.light_&]:bg-sky-500/10 [.light_&]:border-sky-600/25',
  POST: 'bg-emerald-500/14 text-emerald-400 border-emerald-500/30 [.light_&]:text-emerald-700 [.light_&]:bg-emerald-500/10 [.light_&]:border-emerald-600/25',
  PUT: 'bg-amber-500/14 text-amber-400 border-amber-500/30 [.light_&]:text-amber-700 [.light_&]:bg-amber-500/10 [.light_&]:border-amber-600/25',
  PATCH: 'bg-violet-500/14 text-violet-400 border-violet-500/30 [.light_&]:text-violet-700 [.light_&]:bg-violet-500/10 [.light_&]:border-violet-600/25',
  DELETE: 'bg-rose-500/14 text-rose-400 border-rose-500/30 [.light_&]:text-rose-700 [.light_&]:bg-rose-500/10 [.light_&]:border-rose-600/25'
}

export const HTTP_METHOD_TEXT: Record<HttpMethod, string> = {
  GET: 'text-sky-400 [.light_&]:text-sky-700',
  POST: 'text-emerald-400 [.light_&]:text-emerald-700',
  PUT: 'text-amber-400 [.light_&]:text-amber-700',
  PATCH: 'text-violet-400 [.light_&]:text-violet-700',
  DELETE: 'text-rose-400 [.light_&]:text-rose-700'
}
