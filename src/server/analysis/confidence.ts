import type { Confidence } from '../../domain/analysis'

const ORDER: Confidence[] = ['low', 'medium', 'high']

export function downgrade(c: Confidence, steps = 1): Confidence {
  return ORDER[Math.max(0, ORDER.indexOf(c) - steps)]
}

export function upgrade(c: Confidence, steps = 1): Confidence {
  return ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(c) + steps)]
}

// The weakest (most cautious) of several confidence levels.
export function weakest(first: Confidence, ...rest: Confidence[]): Confidence {
  return [first, ...rest].reduce(
    (acc, c) => (ORDER.indexOf(c) < ORDER.indexOf(acc) ? c : acc),
    first,
  )
}
