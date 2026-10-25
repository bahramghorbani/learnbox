package ir.learnbox.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The one check for the M1 purchase bridge: it must never answer "succeeded" before a real
 * store is wired up, no matter what sku is asked for.
 */
class PurchaseBridgeLogicTest {
    @Test
    fun `purchase requests are unavailable before a real store is wired up`() {
        assertEquals("""{"status":"unavailable"}""", PurchaseBridgeLogic.handlePurchaseRequest("pack.b1"))
        assertEquals("""{"status":"unavailable"}""", PurchaseBridgeLogic.handlePurchaseRequest(""))
    }
}
