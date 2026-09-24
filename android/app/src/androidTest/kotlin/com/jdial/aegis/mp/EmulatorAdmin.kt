package com.jdial.aegis.mp

import java.net.HttpURLConnection
import java.net.URL

/**
 * Reads the emulator's contents past the security rules.
 *
 * Clean-up tests have to check that something is *gone*, and after a room is
 * deleted nobody is a member of it any more, so no client is allowed to look.
 * The emulators accept `Bearer owner` as an admin credential, which is what
 * lets a test see the database as it really is.
 */
object EmulatorAdmin {
    private fun get(url: String): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.setRequestProperty("Authorization", "Bearer owner")
        val code = c.responseCode
        val body = (if (code in 200..299) c.inputStream else c.errorStream)
            ?.bufferedReader()?.readText().orEmpty()
        return code to body
    }

    /** True when the Firestore document exists. */
    fun firestoreHas(path: String): Boolean =
        get("http://127.0.0.1:8080/v1/projects/overheal-local/databases/(default)/documents/$path").first == 200

    /** True when the Realtime Database node holds anything. */
    fun databaseHas(path: String): Boolean {
        val (code, body) = get("http://127.0.0.1:9000/$path.json?ns=overheal-local-default-rtdb")
        check(code == 200) { "admin read of $path failed: $code $body" }
        return body.trim() != "null"
    }
}
