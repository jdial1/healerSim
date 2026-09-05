package com.jdial.aegis.sim

/**
 * A seeded xorshift128 PRNG, duplicated bit-for-bit in `parity/rng.mjs`.
 *
 * The engines cannot share `Math.random` / `kotlin.random.Random` — they are
 * different algorithms — so parity scenarios drive both sides through this one
 * instead. Production play just seeds it from the clock.
 */
class Rng(seed: Int) {
    private var x = 0
    private var y = 0
    private var z = 0
    private var w = 0

    init {
        // Splitmix-style seeding so adjacent seeds do not produce similar streams.
        var s = if (seed == 0) 0x9E3779B9.toInt() else seed
        x = mix(s.also { s = it * 1664525 + 1013904223 })
        y = mix(s.also { s = it * 1664525 + 1013904223 })
        z = mix(s.also { s = it * 1664525 + 1013904223 })
        w = mix(s * 1664525 + 1013904223)
        if (x or y or z or w == 0) x = 1
    }

    private fun mix(v: Int): Int {
        var h = v
        h = h xor (h ushr 16)
        h *= 0x7FEB352D
        h = h xor (h ushr 15)
        h *= 0x846CA68B.toInt()
        h = h xor (h ushr 16)
        return h
    }

    private fun nextBits(): Int {
        val t = x xor (x shl 11)
        x = y; y = z; z = w
        w = (w xor (w ushr 19)) xor (t xor (t ushr 8))
        return w
    }

    /** Uniform in [0, 1), matching `Math.random`'s contract. */
    fun nextDouble(): Double = (nextBits().toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0

    /** Uniform integer in [min, max], inclusive — the `randInt` of the JS engine. */
    fun nextInt(min: Int, max: Int): Int {
        if (max <= min) return min
        return min + (nextDouble() * (max - min + 1)).toInt().coerceAtMost(max - min)
    }

    fun <T> pick(items: List<T>): T = items[(nextDouble() * items.size).toInt().coerceAtMost(items.size - 1)]

    /** Fisher-Yates, iterating downwards exactly as `shuffleArray` does. */
    fun <T> shuffled(items: List<T>): List<T> {
        val copy = items.toMutableList()
        for (i in copy.indices.reversed()) {
            if (i == 0) break
            val j = (nextDouble() * (i + 1)).toInt().coerceAtMost(i)
            val tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
        }
        return copy
    }
}

/**
 * Mirrors `generateCombatUid`, which draws one value from the same stream. The
 * string itself does not matter, but the draw does — omitting it desynchronises
 * the two engines.
 */
fun Rng.nextUid(): String =
    (nextDouble() * 4294967296.0).toLong().toString(36)
