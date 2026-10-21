using System.Text.Json;
using Persistent.Build;

if (args.Length == 3 && args[0] == "--configure-package")
{
    PackageResources.Configure(args[1], args[2]);
}
else if (args.Length == 5 && args[0] == "--verify-package")
{
    Console.WriteLine(JsonSerializer.Serialize(PackageResources.Verify(args[1], args[2], args[3], args[4])));
}
else if (args.Length == 3)
{
    ManifestResources.Generate(Path.GetFullPath(args[0]), Path.GetFullPath(args[1]), Path.GetFullPath(args[2]));
    Console.WriteLine("Generated native manifest resources from the canonical catalogs for all nine locale identities.");
}
else
{
    throw new ArgumentException("Expected catalogs/manifest/output, --configure-package config/source, or --verify-package catalogs/layout/root-dump/host-dump.");
}
