package ir.learnbox.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PurchaseBridgeLogic.unavailable() is the fallback every flavor can hit (generic always, myket
 * if the Myket app isn't installed) — it must always report that honestly, with the current
 * flavor's channel (BuildConfig.STORE_CHANNEL), never a faked "succeeded". This test runs once
 * per flavor (testGenericDebugUnitTest, testMyketDebugUnitTest).
 *
 * The myket flavor's REAL purchase path (MyketBillingBridge, in src/myket/) needs a live
 * Activity + AIDL service connection and is verified on a real device instead — see the M2
 * device-test notes in the PR description, not a unit test here.
 */
class PurchaseBridgeLogicTest {
    @Test
    fun `unavailable reports the current flavor's channel, never success`() {
        val expected = """{"status":"unavailable","channel":"${BuildConfig.STORE_CHANNEL}"}"""
        assertEquals(expected, PurchaseBridgeLogic.unavailable())
    }
}
