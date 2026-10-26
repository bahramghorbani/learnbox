package ir.learnbox.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The one check for the M1/M2 purchase bridge: it must never answer "succeeded" before a real
 * store is wired up, no matter what sku is asked for, and it must report which store flavor
 * (BuildConfig.STORE_CHANNEL) asked — this test runs once per flavor (testGenericDebugUnitTest,
 * testMyketDebugUnitTest, ...), so the expected channel always matches the variant under test.
 */
class PurchaseBridgeLogicTest {
    @Test
    fun `purchase requests are unavailable before a real store is wired up`() {
        val expected = """{"status":"unavailable","channel":"${BuildConfig.STORE_CHANNEL}"}"""
        assertEquals(expected, PurchaseBridgeLogic.handlePurchaseRequest("pack.b1"))
        assertEquals(expected, PurchaseBridgeLogic.handlePurchaseRequest(""))
    }
}
