using Persistent.Build;

if (args.Length != 3)
    throw new ArgumentException("Expected catalog directory, package manifest and generated output directory.");

ManifestResources.Generate(Path.GetFullPath(args[0]), Path.GetFullPath(args[1]), Path.GetFullPath(args[2]));
Console.WriteLine("Generated native manifest resources from the canonical catalogs for all nine locale identities.");
