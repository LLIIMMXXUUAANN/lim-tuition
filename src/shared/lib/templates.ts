export const TEMPLATE_META: Record<string, { title: string; description: string }> = {
  payment:               { title: 'Payment Request 1',         description: 'Monthly fee reminder (standard).' },
  payment2:              { title: 'Payment Request 2',         description: 'Monthly fee reminder with carried-over sessions.' },
  review_request1:       { title: 'Review Request 1',          description: 'For students tutored directly.' },
  review_request2:       { title: 'Review Request 2',          description: 'For students tutored through a parent.' },
  recommendation_request1: { title: 'Recommendation Request 1', description: 'For students tutored directly.' },
  recommendation_request2: { title: 'Recommendation Request 2', description: 'For students tutored through a parent.' },
  first_approach:        { title: 'First Approach',            description: 'Initial outreach to prospective students via Superprof.' },
}

export function templateMeta(id: string) {
  const m = TEMPLATE_META[id]
  return { title: m?.title ?? id, description: m?.description ?? '' }
}
