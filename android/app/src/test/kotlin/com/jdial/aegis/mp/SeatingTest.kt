package com.jdial.aegis.mp

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.Participant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** The host's seating as guests arrive and drop mid-run. */
class SeatingTest {
    private val host = Participant(unitId = "5", playerClass = PlayerClass.PRIEST, mana = 40.0)
    private val guest = Participant(unitId = "1", playerClass = PlayerClass.WARRIOR, mana = 200.0)

    @Test
    fun `a guest whose profile arrives after the run began is seated`() {
        val seated = mergeSeats(mapOf("5" to host), mapOf("1" to guest), localSlot = "5")
        assertEquals(guest, seated["1"])
        assertEquals(host, seated["5"])
    }

    @Test
    fun `a seated guest keeps their fight, and only their presence changes`() {
        val mid = guest.copy(mana = 12.0, classResource = 60.0, spellCooldowns = mapOf("taunt" to 30))
        val dropped = mergeSeats(mapOf("5" to host, "1" to mid), mapOf("1" to guest.copy(isHuman = false)), "5")
        assertEquals(mid.copy(isHuman = false), dropped["1"])
        assertFalse(dropped.getValue("1").isHuman)

        val back = mergeSeats(dropped, mapOf("1" to guest), "5")
        assertEquals(mid, back["1"])
    }

    @Test
    fun `the host's own seat is never replaced from a profile`() {
        // Even one saying the host has gone quiet: the host is the one asking.
        val stale = host.copy(mana = 999.0, isHuman = false)
        assertEquals(host, mergeSeats(mapOf("5" to host), mapOf("5" to stale), "5")["5"])
    }
}
