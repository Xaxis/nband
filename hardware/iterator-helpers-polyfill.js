// Iterator Helpers, for the autorouter.
//
// tscircuit's good autorouter — capacity-mesh, the default — dies with
// "o.entries().map is not a function" and takes the whole routing pass with it.
// The cause is not tscircuit. `Map.prototype.entries()` returns an Iterator, and
// calling `.map()` on an Iterator is ES2025 Iterator Helpers, which Bun 1.1.18
// does not implement. The tscircuit CLI carries `#!/usr/bin/env bun`, so it runs
// on whatever Bun is installed, and Node cannot be substituted because only Bun
// transpiles the .tsx board sources.
//
// The visible symptom was worse than a crash. The export printed "Exported to
// t3.glb!" and exited zero, having laid down no copper at all, so the failure
// looked like a limitation of the boards rather than a missing method. Falling
// back to the sequential router got 65 percent of nets placed and no further:
// enlarging the board from 65 x 56 to 110 x 90 mm changed that by three points,
// which is what ruled out area and pointed back at the router.
//
// So the missing methods are installed on %IteratorPrototype% before the CLI
// loads, via `bun --preload`. Nothing here is clever; it is the specified
// behaviour of each helper, and it can be deleted the day the pinned Bun is new
// enough. `make boards` checks that.

const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))

function define(name, fn) {
  if (typeof IteratorPrototype[name] === 'function') return
  Object.defineProperty(IteratorPrototype, name, {
    value: fn,
    writable: true,
    enumerable: false,
    configurable: true,
  })
}

define('map', function* (fn) {
  let i = 0
  for (const v of this) yield fn(v, i++)
})

define('filter', function* (fn) {
  let i = 0
  for (const v of this) if (fn(v, i++)) yield v
})

define('flatMap', function* (fn) {
  let i = 0
  for (const v of this) yield* fn(v, i++)
})

define('take', function* (n) {
  if (n <= 0) return
  let i = 0
  for (const v of this) {
    yield v
    if (++i >= n) return
  }
})

define('drop', function* (n) {
  let i = 0
  for (const v of this) {
    if (i++ < n) continue
    yield v
  }
})

define('toArray', function () {
  return Array.from(this)
})

define('forEach', function (fn) {
  let i = 0
  for (const v of this) fn(v, i++)
})

define('reduce', function (fn, ...init) {
  let acc
  let i = 0
  let started = false
  if (init.length) {
    acc = init[0]
    started = true
  }
  for (const v of this) {
    if (!started) {
      acc = v
      started = true
      i++
      continue
    }
    acc = fn(acc, v, i++)
  }
  if (!started) throw new TypeError('reduce of empty iterator with no initial value')
  return acc
})

define('some', function (fn) {
  let i = 0
  for (const v of this) if (fn(v, i++)) return true
  return false
})

define('every', function (fn) {
  let i = 0
  for (const v of this) if (!fn(v, i++)) return false
  return true
})

define('find', function (fn) {
  let i = 0
  for (const v of this) if (fn(v, i++)) return v
  return undefined
})
