using System.Text.Json;
using System.Xml.Linq;
using Persistent.Localization;

namespace Persistent.Build;

/// <summary>Generate native shell resources from the same catalogs and aliases as the host.</summary>
internal static class ManifestResources
{
    private const string ResourcePrefix = "ms-resource://Persistent.Desktop/Resources/";

    /// <summary>
    /// Write one RESW per declared supported identity, including Canadian aliases.
    /// Missing catalog entries or mismatched declarations fail the build rather than ship unresolved UI.
    /// The explicit URI authority preserves the existing WinUI PRI map name and XAML resource paths.
    /// </summary>
    internal static void Generate(string catalogDirectory, string manifestPath, string outputDirectory)
    {
        var manifest = XDocument.Load(manifestPath);
        string[] languages = manifest.Descendants().Where(node => node.Name.LocalName == "Resource")
            .Select(node => (string?)node.Attribute("Language") ?? "").ToArray();
        if (!languages.Order().SequenceEqual(SupportedLanguages.Catalogs.Keys.Order()))
            throw new InvalidDataException("Manifest language declarations differ from the supported contract.");

        string[] keys = manifest.Descendants().Attributes()
            .Select(attribute => attribute.Value)
            .Where(value => value.StartsWith(ResourcePrefix, StringComparison.Ordinal))
            .Select(value => value[ResourcePrefix.Length..]).Distinct().Order().ToArray();
        if (keys.Length == 0 || keys.Any(key => key.Length == 0 || !key.All(char.IsAsciiLetterOrDigit)))
            throw new InvalidDataException("Manifest must contain named native shell resource bindings.");

        // Validate all languages before touching output, so incomplete input leaves no partial generation.
        var resources = languages.ToDictionary(language => language, language => ReadValues(
            Path.Combine(catalogDirectory, SupportedLanguages.Catalogs[language] + ".json"), keys));
        foreach (string language in languages)
        {
            string directory = Path.Combine(outputDirectory, language);
            Directory.CreateDirectory(directory);
            var document = new XDocument(new XElement("root",
                new XElement("resheader", new XAttribute("name", "resmimetype"), new XElement("value", "text/microsoft-resx")),
                new XElement("resheader", new XAttribute("name", "version"), new XElement("value", "2.0")),
                keys.Select(key => new XElement("data", new XAttribute("name", key),
                    new XAttribute(XNamespace.Xml + "space", "preserve"), new XElement("value", resources[language][key])))));
            document.Save(Path.Combine(directory, "Resources.resw"));
        }
    }

    /// <summary>Only exact application-owned keys enter native resources, never user or provider text.</summary>
    private static Dictionary<string, string> ReadValues(string path, string[] keys)
    {
        using var catalog = JsonDocument.Parse(File.ReadAllText(path));
        var values = new Dictionary<string, string>();
        foreach (string key in keys)
        {
            if (!catalog.RootElement.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(value.GetString()))
                throw new InvalidDataException($"Missing native resource {key} in {Path.GetFileName(path)}.");
            values.Add(key, value.GetString()!);
        }
        return values;
    }
}
