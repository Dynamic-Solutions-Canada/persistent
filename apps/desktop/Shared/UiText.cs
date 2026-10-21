using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Persistent.Localization;

/// <summary>Display-only wording shared by the host and widget, including offline startup.</summary>
internal static class UiText
{
    private static readonly NLog.Logger Logger = NLog.LogManager.GetCurrentClassLogger();
    private static readonly Dictionary<string, Dictionary<string, string>> Catalogs = new(StringComparer.Ordinal);
    private static readonly string PreferencePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Persistent", "locale.json");
    private sealed record Preferences(JsonElement Value);
    private static Preferences _preferences = new(ReadPreferences());
    internal static event Action? Changed;

    /// <summary>Resolve current ordered Windows preferences without changing process culture or serialized values.</summary>
    internal static string Locale => SupportedLanguages.NormalizeOverride(ReadString(Volatile.Read(ref _preferences).Value, "languageOverride"))
        ?? SupportedLanguages.Resolve(PreferredLanguages());

    private static IEnumerable<string> PreferredLanguages()
    {
        try { return Windows.Globalization.ApplicationLanguages.Languages.ToArray(); }
        catch { return [CultureInfo.CurrentUICulture.Name]; }
    }

    /// <summary>Validate and persist only a versioned presentation payload. No reminder state or credentials enter it.</summary>
    internal static bool Apply(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("version", out var version) || !version.TryGetInt32(out int number) || number != 1) return false;
        string? choice = ReadString(value, "languageOverride");
        if (choice is not null && SupportedLanguages.NormalizeOverride(choice) is null) return false;
        if (!SupportedLanguages.Catalogs.ContainsKey(ReadString(value, "resolvedLocale") ?? "")) return false;
        string? formatting = ReadString(value, "formattingLocale");
        string? regionOverride = ReadString(value, "formattingLocaleOverride");
        string? timeFormat = ReadString(value, "timeFormat");
        if (formatting is null || formatting.Length > 100 || regionOverride?.Length > 100 || timeFormat is not ("12h" or "24h")) return false;
        // Persist only the canonical display fields, never arbitrary fields from hosted content.
        string raw = JsonSerializer.Serialize(new {
            version = 1, languageOverride = choice, formattingLocaleOverride = regionOverride,
            resolvedLocale = ReadString(value, "resolvedLocale"), formattingLocale = formatting, timeFormat,
            timeFormatChosen = value.TryGetProperty("timeFormatChosen", out var chosen) && chosen.ValueKind == JsonValueKind.True
        });
        JsonElement previous = Volatile.Read(ref _preferences).Value;
        if (previous.ValueKind == JsonValueKind.Object && previous.GetRawText() == raw) return true;
        Directory.CreateDirectory(Path.GetDirectoryName(PreferencePath)!);
        string temporary = PreferencePath + ".tmp";
        File.WriteAllText(temporary, raw);
        File.Move(temporary, PreferencePath, true);
        using var document = JsonDocument.Parse(raw);
        Volatile.Write(ref _preferences, new Preferences(document.RootElement.Clone()));
        Changed?.Invoke();
        return true;
    }

    /// <summary>Look up only application-owned keys. User-authored content is passed as a parameter, never a key.</summary>
    internal static string Get(string key)
    {
        string catalog = SupportedLanguages.Catalogs[Locale];
        return ReadCatalog(catalog).GetValueOrDefault(key) ?? ReadCatalog("en-US").GetValueOrDefault(key) ?? key;
    }

    /// <summary>Read a fixed English source template for exact matching in trusted bundled promo adapters.</summary>
    internal static string Source(string key) => ReadCatalog("en-US").GetValueOrDefault(key) ?? key;

    /// <summary>Insert named values once so user text cannot become another template or markup.</summary>
    internal static string Format(string key, params (string Name, object? Value)[] values)
    {
        var parameters = values.ToDictionary(pair => pair.Name, pair => pair.Value, StringComparer.Ordinal);
        return Regex.Replace(Get(key), @"\{\{\s*(\w+)\s*}}", match => parameters.TryGetValue(match.Groups[1].Value, out var value) ? Convert.ToString(value, CultureInfo.CurrentCulture) ?? "" : match.Value);
    }

    /// <summary>Widget rendering re-reads the host's display-only mirror across the process boundary.</summary>
    internal static void ReloadPreferences() => Volatile.Write(ref _preferences, new Preferences(ReadPreferences()));

    private static Dictionary<string, string> ReadCatalog(string locale)
    {
        lock (Catalogs)
        {
            if (Catalogs.TryGetValue(locale, out var catalog)) return catalog;
            try
            {
                using Stream source = typeof(UiText).Assembly.GetManifestResourceStream($"Persistent.Localization.{locale}.json")
                    ?? throw new InvalidDataException("Missing bundled language catalog");
                catalog = JsonSerializer.Deserialize<Dictionary<string, string>>(source) ?? [];
            }
            catch (Exception error)
            {
                Logger.Warn("Language catalog {0} unavailable: {1}", locale, error.GetType().Name);
                catalog = [];
            }
            Catalogs.Add(locale, catalog);
            return catalog;
        }
    }

    private static JsonElement ReadPreferences()
    {
        try
        {
            if (File.Exists(PreferencePath))
            {
                using var document = JsonDocument.Parse(File.ReadAllText(PreferencePath));
                return document.RootElement.Clone();
            }
        }
        catch (Exception error) { Logger.Warn("Language preference could not be read: {0}", error.GetType().Name); }
        return default;
    }

    private static string? ReadString(JsonElement value, string property) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
}
