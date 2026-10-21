using System.Text.Json;
using Persistent.Desktop.Notifications;
using Persistent.Localization;
using Persistent.Build;
using System.Xml.Linq;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static JsonElement Preference(string locale) => JsonSerializer.SerializeToElement(new
{
    version = 1, languageOverride = locale, formattingLocaleOverride = "de-DE",
    resolvedLocale = locale, formattingLocale = "de-DE", timeFormat = "12h", timeFormatChosen = true
});

string profile = Environment.GetEnvironmentVariable("PERSISTENT_LOCALIZATION_TEST_PROFILE")
    ?? throw new InvalidOperationException("Set an isolated XDG_CONFIG_HOME and matching PERSISTENT_LOCALIZATION_TEST_PROFILE before running these tests.");
Directory.CreateDirectory(profile);
Check(Path.GetFullPath(profile) == Path.GetFullPath(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)), "Refusing to test against the installed application's preference directory.");
string path = Path.Combine(profile, "Persistent", "locale.json");
Directory.CreateDirectory(Path.GetDirectoryName(path)!);
File.WriteAllText(path, "corrupt saved preferences");
Check(UiText.Get("Done") == "Done", "Corrupt preferences must not crash startup.");

foreach (var (preferences, expected) in new (string[], string)[] {
    (["zh-Hant-CN", "fr-FR"], "fr-FR"),
    (["zh-Hans-TW"], "zh-CN"),
    (["en-Latn-CA"], "en-CA"),
    (["en-CA-u-ca-islamic-nu-arab"], "en-CA"),
    (["unknown", "pt-PT"], "pt-BR"),
    (["zh-TW"], "en-US")
})
{
    Check(SupportedLanguages.Resolve(preferences) == expected, "Ordered script-aware matching: " + string.Join(",", preferences));
}

Check(UiText.Apply(Preference("de-DE")), "Valid preferences should apply.");
Check(UiText.Get("Done") == "Erledigt", "Host uses the explicit language.");
File.WriteAllText(path, Preference("fr-CA").GetRawText());
UiText.ReloadPreferences();
Check(UiText.Locale == "fr-CA" && UiText.Get("Done") == "Terminé", "Widget process re-reads a newly published preference.");
UiText.Apply(Preference("ja-JP"));
Check(UiText.Get("Done") == "Done", "A corrupt translation falls back to bundled English.");
UiText.Apply(Preference("es-ES"));
Check(UiText.Get("Done") == "Done", "A missing translation falls back to bundled English.");
UiText.Apply(Preference("pt-BR"));
Check(UiText.Format("{{body}} (escalated)", ("body", "Insulin 10 units {{body}} <name>")) == "Insulin 10 units {{body}} <name> (alerta intensificado)", "User content is inserted once and stays literal.");

// Exercise the real build generator against every canonical catalog and alias.
string catalogs = Path.GetFullPath("packages/shared/src/messages");
string manifest = Path.GetFullPath("apps/desktop/Persistent.DesktopMSIX/Package.appxmanifest");
string nativeOutput = Path.Combine(profile, "native-resources");
ManifestResources.Generate(catalogs, manifest, nativeOutput);
Check(Directory.GetDirectories(nativeOutput).Length == 9, "All nine native locale identities are generated.");
foreach (var (locale, catalogName) in SupportedLanguages.Catalogs)
{
    using var catalog = JsonDocument.Parse(File.ReadAllText(Path.Combine(catalogs, catalogName + ".json")));
    var generated = XDocument.Load(Path.Combine(nativeOutput, locale, "Resources.resw"));
    var entries = generated.Root!.Elements("data").ToArray();
    Check(entries.Length == 4, "All manifest resource keys are generated for " + locale);
    foreach (var entry in entries)
    {
        string key = entry.Attribute("name")!.Value;
        Check(entry.Element("value")!.Value == catalog.RootElement.GetProperty(key).GetString(), "Native resource matches canonical catalog: " + locale + "/" + key);
    }
}
string incomplete = Path.Combine(profile, "incomplete-catalogs");
Directory.CreateDirectory(incomplete);
File.WriteAllText(Path.Combine(incomplete, "en-US.json"), "{}");
bool incompleteRejected = false;
try { ManifestResources.Generate(incomplete, manifest, Path.Combine(profile, "incomplete-output")); }
catch (InvalidDataException) { incompleteRejected = true; }
Check(incompleteRejected && !Directory.Exists(Path.Combine(profile, "incomplete-output")), "Missing native translations fail without partial output.");
PackageResourceTests.Run(profile, catalogs, manifest);

var first = new NotificationOccurrence("occurrence-a", "reminder", "Medicine", "Insulin 10 units", true, true, 0);
var second = first with { OccurrenceId = "occurrence-b", CanSilence = false };
var calls = new List<(string Id, bool Confirming, bool Alarm)>();
var visible = new HashSet<string>();
using var showEntered = new ManualResetEventSlim();
using var allowShow = new ManualResetEventSlim();
bool blockShow = false;
bool failPresentation = false;
bool Normal(NotificationOccurrence occurrence)
{
    if (blockShow) { showEntered.Set(); allowShow.Wait(); }
    if (failPresentation) return false;
    calls.Add((occurrence.OccurrenceId, false, occurrence.Alarm));
    visible.Add(occurrence.OccurrenceId);
    return true;
}
bool Confirm(NotificationOccurrence occurrence)
{
    if (failPresentation) return false;
    calls.Add((occurrence.OccurrenceId, true, occurrence.Alarm));
    visible.Add(occurrence.OccurrenceId);
    return true;
}
var presentation = new NotificationPresentation(Normal, Confirm,
    id => { visible.Remove(id); return Task.CompletedTask; },
    () => { visible.Clear(); return Task.CompletedTask; }, () => true);
await presentation.ShowAsync(first);
await presentation.ShowAsync(second);
await presentation.ConfirmAsync(first.OccurrenceId);
calls.Clear();
await presentation.RelabelAsync();
Check(calls.Contains(("occurrence-a", true, true)) && calls.Contains(("occurrence-b", false, true)), "Immediate repost keeps independent alarm scenarios and confirmation variants.");
Check(presentation.TryGet(first.OccurrenceId, out var armed) && armed.ConfirmingDone && armed.Occurrence == first, "Armed Done retains identical action IDs and alarm semantics.");

// Pause inside the actual native-show callback, then race a successful Done/WS removal.
// Removal must wait for repost and then clear both native state and tracking.
blockShow = true;
var relabel = Task.Run(presentation.RelabelAsync);
Check(showEntered.Wait(TimeSpan.FromSeconds(5)), "Relabel entered the native presentation callback.");
var dismissal = presentation.RemoveAsync(second.OccurrenceId);
Check(!dismissal.IsCompleted, "Dismissal is serialized with an in-flight native repost.");
allowShow.Set();
await Task.WhenAll(relabel, dismissal);
Check(!visible.Contains(second.OccurrenceId) && !presentation.TryGet(second.OccurrenceId, out _), "Dismissal racing relabel cannot resurrect an untracked toast.");
Check(visible.Contains(first.OccurrenceId) && presentation.TryGet(first.OccurrenceId, out armed) && armed.ConfirmingDone, "Independent armed alarm survives another occurrence's dismissal.");
failPresentation = true;
await presentation.RelabelAsync();
failPresentation = false;
await presentation.RetryPendingAsync();
Check(presentation.TryGet(first.OccurrenceId, out armed) && armed.ConfirmingDone, "Failed language replacement retries the armed confirmation variant.");
failPresentation = true;
await presentation.RelabelAsync();
await presentation.RemoveAsync(first.OccurrenceId);
failPresentation = false;
await presentation.RetryPendingAsync();
Check(!visible.Contains(first.OccurrenceId), "A failed relabel retry cannot revive a removed obligation.");
await presentation.ClearAsync();
await presentation.ShowAsync(second, requireTracked: true);
Check(visible.Count == 0 && !presentation.Values.Any(), "Sign-out clears all presentation and stale monitor restores are fenced.");
await presentation.ShowAsync(second, () => false);
Check(!presentation.Values.Any(), "A departed session's in-flight server response cannot restore notifications.");
Console.WriteLine("Windows localization regression checks passed: matching, process refresh, safe fallback, literal content, nine-locale native resources, immediate variants, dismissal race and departed-session fencing.");

// The test is run in an isolated XDG profile, never the installed host's settings.
namespace Windows.Globalization
{
    internal static class ApplicationLanguages
    {
        internal static IReadOnlyList<string> Languages => ["en-US"];
    }
}
