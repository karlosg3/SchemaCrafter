import type { HttpMethod } from '#shared/types/workspace'

/**
 * Architectural-ink HTTP method badge styles harmonized with Blueprint Dark and
 * Drafting Paper Light while maintaining immediate Scalar/Swagger scannability
 * and WCAG AA contrast.
 */
export const HTTP_METHOD_BADGE: Record<HttpMethod, string> = {
  GET: 'bg-[#3B82BA]/16 text-[#8BC8F5] border-[#5BA4DA]/35 [.light_&]:text-[#18527D] [.light_&]:bg-[#265385]/10 [.light_&]:border-[#265385]/30',
  POST: 'bg-[#2A7B5B]/18 text-[#7AD3AE] border-[#3FA079]/35 [.light_&]:text-[#17593E] [.light_&]:bg-[#2A7B5B]/10 [.light_&]:border-[#2A7B5B]/30',
  PUT: 'bg-[#D99426]/16 text-[#F2C36B] border-[#D99426]/35 [.light_&]:text-[#8C5606] [.light_&]:bg-[#D99426]/12 [.light_&]:border-[#B47415]/30',
  PATCH: 'bg-[#EA6A38]/16 text-[#F79C75] border-[#EA6A38]/35 [.light_&]:text-[#A93514] [.light_&]:bg-[#EA6A38]/11 [.light_&]:border-[#C8431F]/30',
  DELETE: 'bg-[#A63A50]/18 text-[#F08E9E] border-[#C45067]/35 [.light_&]:text-[#8E2237] [.light_&]:bg-[#A63A50]/10 [.light_&]:border-[#A63A50]/30'
}

export const HTTP_METHOD_TEXT: Record<HttpMethod, string> = {
  GET: 'text-[#8BC8F5] [.light_&]:text-[#18527D]',
  POST: 'text-[#7AD3AE] [.light_&]:text-[#17593E]',
  PUT: 'text-[#F2C36B] [.light_&]:text-[#8C5606]',
  PATCH: 'text-[#F79C75] [.light_&]:text-[#A93514]',
  DELETE: 'text-[#F08E9E] [.light_&]:text-[#8E2237]'
}
