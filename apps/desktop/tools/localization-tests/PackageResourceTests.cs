using System.Xml.Linq;
using Persistent.Build;
using Persistent.Localization;

/// <summary>Exercise actual manifest-to-primary-map validation, including the Store rejection and XAML preservation.</summary>
internal sealed class PackageResourceTests
{
    private readonly string _catalogs;
    private readonly string _layout;
    private readonly string _manifest;
    private readonly string _packageDump;
    private readonly string _hostDump;
    private readonly string[] _keys;

    private PackageResourceTests(string profile, string catalogs, string manifest)
    {
        _catalogs = catalogs;
        _layout = Path.Combine(profile, "package-resources");
        Directory.CreateDirectory(_layout);
        _manifest = File.ReadAllText(manifest);
        _keys = ManifestResources.ReadManifest(manifest).Keys;
        _packageDump = Path.Combine(_layout, "package.xml");
        _hostDump = Path.Combine(_layout, "host.xml");
    }

    /// <summary>Use canonical translations, but synthetic PRI dumps and files; this does not claim SDK or runtime proof.</summary>
    internal static void Run(string profile, string catalogs, string manifest)
    {
        var tests = new PackageResourceTests(profile, catalogs, manifest);
        tests.VerifyIdentity("27766TechnicallyReal.Persistent");
        tests.VerifyIdentity(PackageResources.HostMap);
        tests.VerifyInputBoundary();
        Console.WriteLine("Package resource regressions passed: both identities, actual manifest references, nine locales/default, primary-map XAML bytes/paths/qualifiers, and isolated indexing inputs.");
    }

    private void VerifyIdentity(string identity)
    {
        Reset(identity);
        Verify();
        Reject(identity, "Package root resources.pri is missing", () => File.Delete(Path.Combine(_layout, "resources.pri")));
        Reject(identity, "primary package identity map", () => EditPackage(document => Primary(document).SetAttributeValue("name", "Wrong.Identity")));
        Reject(identity, "Manifest reference cannot resolve", () => EditPackage(document =>
        {
            var primary = Primary(document);
            var secondary = new XElement("ResourceMap", new XAttribute("name", "Old.Map"));
            foreach (var resource in primary.Descendants("NamedResource").Where(node => Uri(node).Contains("/Resources/")).ToArray())
            {
                resource.Remove();
                secondary.Add(resource);
            }
            document.Root!.Add(secondary);
        }));
        Reject(identity, "package-relative", () =>
        {
            string path = Path.Combine(_layout, "AppxManifest.xml");
            File.WriteAllText(path, File.ReadAllText(path).Replace("ms-resource:Resources/", "ms-resource://Persistent.Desktop/Resources/"));
        });
        Reject(identity, "declared language or English default", () => EditPackage(document => Metadata(document).Elements("Candidate").Last().Remove()));
        Reject(identity, "declared language or English default", () => EditPackage(document =>
            Metadata(document).Descendants("Qualifier").Single(node => (string?)node.Attribute("value") == "en-US").SetAttributeValue("scoreAsDefault", "0.0")));
        Reject(identity, "Invalid, missing or duplicate", () => EditPackage(document => Metadata(document).Elements("Candidate").First().Element("Value")!.Value = "Incorrect copy"));
        Reject(identity, "disable AutoMerge", () => EditPackage(document => document.Root!.Element("PriHeader")!.Element("AutoMerge")!.Value = "true"));
        Reject(identity, "disable AutoMerge", () => EditPackage(document => document.Root!.Element("PriHeader")!.Element("ReverseMap")!.Value = "true"));
        Reject(identity, "PRIMARY package map", () => EditPackage(document => Xaml(document).Descendants("Base64Value").Single().Value = Convert.ToBase64String([9, 9, 9])));
        Reject(identity, "PRIMARY package map", () => EditPackage(document => Framework(document).Descendants("Qualifier").Single().SetAttributeValue("value", "FR-FR")));
        Reject(identity, "PRIMARY package map", () => EditPackage(document => Image(document).Descendants("Value").Single().Value = "Assets/changed.png"));
        Reject(identity, "PRIMARY package map", () => EditPackage(document =>
        {
            var xaml = Xaml(document);
            xaml.Remove();
            document.Root!.Add(new XElement("ResourceMap", new XAttribute("name", "Old.Map"), xaml));
        }));
        Reject(identity, "compiled XAML is missing", () => File.Delete(Path.Combine(_layout, "App.xbf")));
        // Index/default score changes are expected when MakePri merges. Values and qualifiers are not.
        Reset(identity);
        EditPackage(document =>
        {
            Framework(document).SetAttributeValue("index", "990");
            Framework(document).Descendants("Qualifier").Single().SetAttributeValue("scoreAsDefault", "0.5");
        });
        Verify();
    }

    /// <summary>Index the published host PRI once; never discover loose XBFs or another framework PRI.</summary>
    private void VerifyInputBoundary()
    {
        string input = Path.Combine(_layout, "input");
        string config = Path.Combine(_layout, "priconfig.xml");
        Directory.CreateDirectory(input);
        File.WriteAllText(Path.Combine(input, PackageResources.HostMap + ".pri"), "synthetic PRI");
        ManifestResources.Generate(_catalogs, Path.Combine(_layout, "AppxManifest.xml"), Path.Combine(input, "Strings"));
        File.WriteAllText(config, """
            <resources targetOsVersion="10.0.0"><packaging><autoResourcePackage qualifier="Language"/></packaging>
            <index root="\" startIndexAt="\"><default><qualifier name="Language" value="en-US"/></default>
            <indexer-config type="folder"/><indexer-config type="resw"/><indexer-config type="resjson"/><indexer-config type="PRI"/>
            </index></resources>
            """);
        PackageResources.Configure(config, input);
        var configured = XDocument.Load(config);
        Require(configured.Root!.Element("packaging") == null, "All languages stay in the main package.");
        Require((string?)configured.Root.Element("index")!.Attribute("root") == Path.GetFullPath(input), "Input root is isolated.");
        Require(configured.Descendants("indexer-config").Select(node => (string?)node.Attribute("type")).SequenceEqual(["folder", "resw", "PRI"]), "Only the supported merge indexers remain.");
        foreach (string extra in new[] { "App.xbf", "Microsoft.UI.Xaml.pri" })
        {
            string path = Path.Combine(input, extra);
            File.WriteAllText(path, "unexpected broad scan input");
            ExpectRejected("exactly one host PRI", () => PackageResources.Configure(config, input));
            File.Delete(path);
        }
        File.Delete(Path.Combine(input, "Strings", "en-CA", "Resources.resw"));
        ExpectRejected("exactly one host PRI", () => PackageResources.Configure(config, input));
    }

    /// <summary>Regenerate a valid package fixture before each independent failure to prevent false positives.</summary>
    private void Reset(string identity)
    {
        File.WriteAllText(Path.Combine(_layout, "resources.pri"), "synthetic package PRI");
        File.WriteAllText(Path.Combine(_layout, PackageResources.HostMap + ".pri"), "synthetic host PRI");
        File.WriteAllBytes(Path.Combine(_layout, "App.xbf"), [1, 2, 3, 255]);
        var manifest = XDocument.Parse(_manifest);
        manifest.Root!.Element(manifest.Root.Name.Namespace + "Identity")!.SetAttributeValue("Name", identity);
        manifest.Save(Path.Combine(_layout, "AppxManifest.xml"));
        var hostResources = new[]
        {
            Named("Files/App.xbf", new XElement("Candidate", new XAttribute("type", "EmbeddedData"), new XElement("QualifierSet"), new XElement("Base64Value", "AQID/w=="))),
            Named("Framework/AccessibleName", new XElement("Candidate", new XAttribute("type", "String"), Qualifiers("EN-US"), new XElement("Value", "Framework text"))),
            Named("Files/Assets/Logo.png", new XElement("Candidate", new XAttribute("type", "Path"),
                new XElement("QualifierSet", new XElement("Qualifier", new XAttribute("name", "Scale"), new XAttribute("value", "200"), new XAttribute("priority", "500"))),
                new XElement("Value", "Assets/Logo.scale-200.png")))
        };
        var hostMap = new XElement("ResourceMap", new XAttribute("name", PackageResources.HostMap), hostResources);
        new XDocument(new XElement("PriInfo", hostMap)).Save(_hostDump);
        var primary = new XElement(hostMap);
        primary.SetAttributeValue("name", identity);
        primary.SetAttributeValue("primary", "true");
        foreach (var resource in primary.Descendants("NamedResource"))
            resource.SetAttributeValue("uri", Uri(resource).Replace("//" + PackageResources.HostMap + "/", "//" + identity + "/"));
        foreach (string key in _keys)
        {
            var candidates = SupportedLanguages.Catalogs.Select(pair => new XElement("Candidate", new XAttribute("type", "String"),
                Qualifiers(pair.Key), new XElement("Value", ManifestResources.ReadValues(Path.Combine(_catalogs, pair.Value + ".json"), [key])[key])));
            primary.Add(new XElement("NamedResource", new XAttribute("uri", "ms-resource://" + identity + "/Resources/" + key), candidates));
        }
        new XDocument(new XElement("PriInfo", new XElement("PriHeader", new XElement("AutoMerge", "false"), new XElement("ReverseMap", "false")), primary)).Save(_packageDump);
    }

    private static XElement Named(string path, XElement candidate) => new("NamedResource", new XAttribute("uri", "ms-resource://" + PackageResources.HostMap + "/" + path), candidate);
    private static XElement Qualifiers(string tag) => new("QualifierSet", new XElement("Qualifier", new XAttribute("name", "Language"), new XAttribute("value", tag), new XAttribute("priority", "700"), new XAttribute("scoreAsDefault", tag.Equals("en-US", StringComparison.OrdinalIgnoreCase) ? "1.0" : "0.0")));
    private static string Uri(XElement resource) => (string)resource.Attribute("uri")!;
    private static XElement Primary(XDocument document) => document.Descendants("ResourceMap").Single(node => (string?)node.Attribute("primary") == "true");
    private static XElement Metadata(XDocument document) => Primary(document).Descendants("NamedResource").First(node => Uri(node).Contains("/Resources/"));
    private static XElement Xaml(XDocument document) => Primary(document).Descendants("NamedResource").Single(node => Uri(node).EndsWith("/Files/App.xbf"));
    private static XElement Framework(XDocument document) => Primary(document).Descendants("NamedResource").Single(node => Uri(node).EndsWith("/Framework/AccessibleName"));
    private static XElement Image(XDocument document) => Primary(document).Descendants("NamedResource").Single(node => Uri(node).EndsWith("/Files/Assets/Logo.png"));
    private void Verify() => PackageResources.Verify(_catalogs, _layout, _packageDump, _hostDump);
    private void EditPackage(Action<XDocument> edit)
    {
        var document = XDocument.Load(_packageDump);
        edit(document);
        document.Save(_packageDump);
    }

    private void Reject(string identity, string message, Action mutate)
    {
        Reset(identity);
        mutate();
        ExpectRejected(message, Verify);
    }

    private static void ExpectRejected(string message, Action action)
    {
        try { action(); }
        catch (InvalidDataException error) when (error.Message.Contains(message, StringComparison.Ordinal)) { return; }
        throw new InvalidOperationException("Expected resource validation failure: " + message);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
