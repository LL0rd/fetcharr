import { describe, expect, it } from 'vitest'
import { createThrottle } from '../src/throttle.ts'

/** Injizierte Uhr statt fake timers — der Runner-Test läuft gegen echte Prozesse. */
function clock(start = 0) {
  let value = start
  return {
    now: () => value,
    advance(ms: number) {
      value += ms
    },
  }
}

describe('createThrottle', () => {
  it('lets the first call through', () => {
    const time = clock()
    const throttle = createThrottle(time.now, 1000)

    expect(throttle()).toBe(true)
  })

  it('drops calls inside the interval', () => {
    const time = clock()
    const throttle = createThrottle(time.now, 1000)

    throttle()
    time.advance(400)
    expect(throttle()).toBe(false)
    time.advance(599)
    expect(throttle()).toBe(false)
  })

  it('lets a call through once the interval has passed', () => {
    const time = clock()
    const throttle = createThrottle(time.now, 1000)

    throttle()
    time.advance(1000)
    expect(throttle()).toBe(true)
    time.advance(999)
    expect(throttle()).toBe(false)
    time.advance(1)
    expect(throttle()).toBe(true)
  })
})
