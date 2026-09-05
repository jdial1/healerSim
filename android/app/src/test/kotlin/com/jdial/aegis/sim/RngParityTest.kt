package com.jdial.aegis.sim

import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The foundation of every stochastic parity scenario: both engines must draw the
 * same numbers. If this fails, nothing built on top of it means anything.
 */
class RngParityTest {

    private val golden = Fixtures.golden

    @Test
    fun doubleStreamsMatchTheJsEngine() {
        val streams = golden.getValue("rngStreams").jsonObject
        streams.forEach { (seedText, values) ->
            val seed = seedText.toInt()
            val rng = Rng(seed)
            values.jsonArray.forEachIndexed { i, expected ->
                assertEquals(
                    "seed $seed draw $i",
                    expected.jsonPrimitive.double,
                    rng.nextDouble(),
                    0.0,
                )
            }
        }
    }

    @Test
    fun intStreamsMatchTheJsEngine() {
        val streams = golden.getValue("rngInts").jsonObject
        streams.forEach { (seedText, values) ->
            val seed = seedText.toInt()
            val rng = Rng(seed)
            values.jsonArray.forEachIndexed { i, expected ->
                assertEquals("seed $seed int $i", expected.jsonPrimitive.int, rng.nextInt(20, 50))
            }
        }
    }
}
