package ca.persistent.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

class LocaleMatcherTest {
    @Test fun matchingHonorsPreferenceOrderAndScriptBoundaries() {
        assertEquals("fr-FR", LocaleMatcher.resolve(listOf("zh-Hant-CN", "fr-FR")))
        assertEquals("zh-CN", LocaleMatcher.resolve(listOf("zh-Hans-TW")))
        assertEquals("en-CA", LocaleMatcher.resolve(listOf("en-Latn-CA")))
        assertEquals("ja-JP", LocaleMatcher.resolve(listOf("xx", "ja-JP")))
        assertEquals("en-US", LocaleMatcher.resolve(listOf("zh-TW")))
        assertEquals("fr-CA", LocaleMatcher.resolve(listOf("en-US"), "fr-CA"))
    }
    @Test fun systemPickerSupersedesPrivateOverrideAndResetReturnsToDevice() {
        assertEquals("ja-JP", LocaleMatcher.applicationOverride(true, listOf("ja-JP"), "fr-CA"))
        assertEquals(null, LocaleMatcher.applicationOverride(true, emptyList(), "fr-CA"))
        assertEquals("fr-CA", LocaleMatcher.applicationOverride(false, emptyList(), "fr-CA"))
        assertEquals("fr-FR", LocaleMatcher.applicationOverride(true, listOf("zh-Hant-CN", "fr-FR"), "de-DE"))
    }

    @Test fun firstUpgradeMigratesAnExistingChoiceWithoutOverwritingTheOsPicker() {
        assertEquals("fr-CA", LocaleMatcher.migrationChoice(emptyList(), "fr-CA", "de-DE"))
        assertEquals("de-DE", LocaleMatcher.migrationChoice(emptyList(), null, "de-DE"))
        assertEquals(null, LocaleMatcher.migrationChoice(listOf("ja-JP"), "fr-CA", "de-DE"))
    }

    @Test fun pre13UpgradeImportsWebChoiceOnceAndNeverRestoresAnExplicitReset() {
        assertEquals("fr-CA", LocaleMatcher.privateMigrationChoice(false, false, "fr-CA"))
        assertEquals(null, LocaleMatcher.privateMigrationChoice(false, true, "fr-CA"))
        assertEquals(null, LocaleMatcher.privateMigrationChoice(true, false, "fr-CA"))
        assertEquals(null, LocaleMatcher.privateMigrationChoice(false, false, "zh-TW"))
        assertEquals(null, LocaleMatcher.privateMigrationChoice(false, false, null))
    }
}
