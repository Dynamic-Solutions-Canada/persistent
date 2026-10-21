using System.Globalization;
using System.Xml.Linq;
using Persistent.Localization;

namespace Persistent.Build;

/// <summary>Package-root MRT contract: consolidate the host resources under the final identity without changing their content.</summary>
internal static class PackageResources
{
    internal const string HostMap = "Persistent.Desktop";

    /// <summary>Index one host PRI plus canonical RESWs, without loose XBFs, framework PRIs or language splitting.</summary>
    internal static void Configure(string configPath, string sourceDirectory)
    {
        var config = XDocument.Load(configPath);
        var resources = config.Root ?? throw new InvalidDataException("SDK PRI configuration is empty.");
        var index = resources.Elements("index").Single();
        resources.Elements("packaging").Remove();
        resources.SetAttributeValue("targetOsVersion", "10.0.0");
        index.SetAttributeValue("root", Path.GetFullPath(sourceDirectory));
        index.SetAttributeValue("startIndexAt", "");
        var allowed = new HashSet<string>(["folder", "resw", "PRI"], StringComparer.OrdinalIgnoreCase);
        index.Elements("indexer-config").Where(node => !allowed.Contains((string?)node.Attribute("type") ?? "")).Remove();
        foreach (string type in allowed)
            if (!index.Elements("indexer-config").Any(node => string.Equals((string?)node.Attribute("type"), type, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidDataException("SDK PRI configuration lacks required " + type + " indexer.");
        var language = index.Element("default")?.Elements("qualifier")
            .SingleOrDefault(node => (string?)node.Attribute("name") == "Language");
        if (!string.Equals((string?)language?.Attribute("value"), "en-US", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Package PRI requires the English default qualifier.");
        // The input directory is built from scratch by the packaging driver.
        // Reject accidental broad layout indexing, the cause of PRI175/PRI277.
        var expected = new HashSet<string>(SupportedLanguages.Catalogs.Keys.Select(tag =>
            "Strings/" + tag + "/Resources.resw"), StringComparer.OrdinalIgnoreCase) { HostMap + ".pri" };
        var actual = Directory.GetFiles(sourceDirectory, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(sourceDirectory, path).Replace('\\', '/')).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!expected.SetEquals(actual))
            throw new InvalidDataException("Package PRI input must be exactly one host PRI and nine generated RESWs.");
        config.Save(configPath);
    }

    /// <summary>
    /// Follow the actual layout's manifest references into its root PRI's identity map.
    /// Dumps must come from that layout's resources.pri and unmodified host PRI, not another index.
    /// The packaging driver repeats this after unpacking the finished MSIX.
    /// </summary>
    internal static object Verify(string catalogDirectory, string layout, string packageDump, string hostDump)
    {
        if (!File.Exists(Path.Combine(layout, "resources.pri")))
            throw new InvalidDataException("Package root resources.pri is missing.");
        if (!File.Exists(Path.Combine(layout, HostMap + ".pri")))
            throw new InvalidDataException("Host runtime PRI is missing.");
        var (identity, languages, keys) = ManifestResources.ReadManifest(Path.Combine(layout, "AppxManifest.xml"));
        var package = XDocument.Load(packageDump);
        var header = package.Root?.Element("PriHeader");
        if ((string?)header?.Element("AutoMerge") != "false" || (string?)header?.Element("ReverseMap") != "false")
            throw new InvalidDataException("Package PRI must disable AutoMerge and reverse mapping.");
        var map = package.Descendants("ResourceMap").SingleOrDefault(node =>
            string.Equals((string?)node.Attribute("name"), identity, StringComparison.OrdinalIgnoreCase)
            && (string?)node.Attribute("primary") == "true")
            ?? throw new InvalidDataException("Root PRI lacks the primary package identity map: " + identity);
        var expected = languages.ToDictionary(language => language, language => ManifestResources.ReadValues(
            Path.Combine(catalogDirectory, SupportedLanguages.Catalogs[language] + ".json"), keys), StringComparer.OrdinalIgnoreCase);
        foreach (string key in keys)
            VerifyString(map, identity, key, expected);

        var (xamlCount, hostResources) = VerifyHost(layout, XDocument.Load(hostDump), map, identity);
        return new { identity, languages, manifestResources = keys, englishDefault = true, autoMerge = false,
            hostMap = HostMap, compiledXaml = xamlCount, consolidatedHostResources = hostResources };
    }

    /// <summary>Each manifest URI needs an exact literal candidate for all nine languages and an English default.</summary>
    private static void VerifyString(XElement map, string identity, string key, Dictionary<string, Dictionary<string, string>> expected)
    {
        string uri = "ms-resource://" + identity + "/Resources/" + key;
        var resource = map.Descendants("NamedResource").SingleOrDefault(node =>
            string.Equals((string?)node.Attribute("uri"), uri, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidDataException("Manifest reference cannot resolve through root PRI: " + uri);
        var candidates = resource.Elements("Candidate").ToArray();
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        bool englishDefault = false;
        foreach (var candidate in candidates)
        {
            var qualifiers = candidate.Element("QualifierSet")?.Elements("Qualifier").ToArray() ?? [];
            var language = qualifiers.SingleOrDefault(node => (string?)node.Attribute("name") == "Language");
            string tag = (string?)language?.Attribute("value") ?? "";
            if (qualifiers.Length != 1 || !expected.TryGetValue(tag, out var values) || !found.Add(tag)
                || (string?)candidate.Attribute("type") != "String" || candidate.Element("Value")?.Value != values[key])
                throw new InvalidDataException("Invalid, missing or duplicate language candidate: " + uri + "/" + tag);
            if (tag.Equals("en-US", StringComparison.OrdinalIgnoreCase))
                englishDefault = double.TryParse((string?)language?.Attribute("scoreAsDefault"),
                    CultureInfo.InvariantCulture, out double score) && score > 0;
        }
        if (found.Count != expected.Count || !englishDefault)
            throw new InvalidDataException("Manifest resource lacks a declared language or English default: " + uri);
    }

    /// <summary>Require all host names/qualifiers/values in the PRIMARY package map, not a secondary map.</summary>
    private static (int Xaml, int Resources) VerifyHost(string layout, XDocument dump, XElement packageMap, string identity)
    {
        var map = dump.Descendants("ResourceMap").SingleOrDefault(node => (string?)node.Attribute("name") == HostMap)
            ?? throw new InvalidDataException("Host PRI map was renamed or removed.");
        var packaged = packageMap.Descendants("NamedResource").ToDictionary(node =>
            (string?)node.Attribute("uri") ?? "", StringComparer.OrdinalIgnoreCase);
        int count = 0;
        foreach (var original in map.Descendants("NamedResource"))
        {
            string uri = (string?)original.Attribute("uri") ?? "";
            string prefix = "ms-resource://" + HostMap + "/";
            if (!uri.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Unexpected host resource URI: " + uri);
            string target = "ms-resource://" + identity + "/" + uri[prefix.Length..];
            if (!packaged.TryGetValue(target, out var resource)
                || !CandidateSignatures(original).SequenceEqual(CandidateSignatures(resource)))
                throw new InvalidDataException("Host resource changed or absent from PRIMARY package map: " + target);
            count++;
        }
        string[] files = Directory.GetFiles(layout, "*.xbf", SearchOption.AllDirectories);
        if (files.Length == 0) throw new InvalidDataException("Packaged compiled XAML is missing.");
        foreach (string file in files)
        {
            string relative = Path.GetRelativePath(layout, file).Replace('\\', '/');
            string uri = "ms-resource://" + identity + "/Files/" + relative;
            if (!packaged.TryGetValue(uri, out var resource) || !resource.Elements("Candidate").Any(node =>
                (string?)node.Attribute("type") is "EmbeddedData" or "Path"))
                throw new InvalidDataException("Packaged XAML cannot resolve through the default map: " + uri);
        }
        return (files.Length, count);
    }

    /// <summary>Ignore recomputed index numbers/default scores; retain every type, qualifier, path/string and embedded byte.</summary>
    private static IEnumerable<string> CandidateSignatures(XElement resource) => resource.Elements("Candidate")
        .Select(candidate =>
        {
            var qualifiers = candidate.Element("QualifierSet")?.Elements("Qualifier").Select(node =>
                new { name = (string?)node.Attribute("name"), value = (string?)node.Attribute("value"),
                    priority = (string?)node.Attribute("priority") }).OrderBy(node => node.name).ToArray();
            string? embedded = candidate.Element("Base64Value")?.Value;
            return System.Text.Json.JsonSerializer.Serialize(new { type = (string?)candidate.Attribute("type"), qualifiers,
                value = candidate.Element("Value")?.Value,
                embedded = embedded == null ? null : Convert.ToBase64String(Convert.FromBase64String(embedded)) });
        }).Order(StringComparer.Ordinal);
}
