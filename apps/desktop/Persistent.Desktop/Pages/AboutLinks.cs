namespace Persistent.Desktop.Pages;

/// <summary>
/// Where the About page's support, licence and notices links go (BRAND-8, D-086). Pure, so the
/// portable harness can check them.
/// </summary>
public static class AboutLinks
{
    /// <summary>
    /// The repo-relative path of the generated third-party notices. windows-build.json names
    /// this file as `notices.about_source`, so `check:notices:desktop` fails if this constant
    /// and the generator's output ever part.
    /// </summary>
    public const string NoticesPath = "apps/desktop/Persistent.Desktop/THIRD-PARTY-NOTICES.txt";

    /// <summary>Support goes to the repository's issues, which carry the issue template.</summary>
    public static Uri Support(Uri repository) => new($"{repository.AbsoluteUri.TrimEnd('/')}/issues");

    /// <summary>The licence the app ships under.</summary>
    public static Uri License(Uri repository) => new($"{repository.AbsoluteUri.TrimEnd('/')}/blob/main/LICENSE");

    /// <summary>The generated notices, as committed on the default branch.</summary>
    public static Uri ThirdPartyNotices(Uri repository) =>
        new($"{repository.AbsoluteUri.TrimEnd('/')}/blob/main/{NoticesPath}");
}
