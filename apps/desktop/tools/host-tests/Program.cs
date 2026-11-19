using Persistent.Desktop.Pages;
using Persistent.Desktop.Windows;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

const string server = "https://persistent.dynamic-solutions.ca";

// The page the bridge talks to: the server's origin only (gap #9).
Check(FlyoutUrlPolicy.IsAppUrl($"{server}/settings", server), "The app's own page is the app origin.");
Check(FlyoutUrlPolicy.IsAppUrl("https://PERSISTENT.dynamic-solutions.ca:443/", server), "Host case and the default port are the same origin.");
foreach (var other in new[] {
    "https://accounts.google.com/signin",
    "https://persistent.dynamic-solutions.ca.evil.example/",
    "https://user:pass@persistent.dynamic-solutions.ca/",
    "http://persistent.dynamic-solutions.ca/",
    "https://persistent.dynamic-solutions.ca:8443/",
    "about:blank",
    "",
})
{
    Check(!FlyoutUrlPolicy.IsAppUrl(other, server), $"Not the app origin: {other}");
}

// Google sign-in stays in the flyout only on its exact https origin (gap #10).
Check(FlyoutUrlPolicy.IsSignInUrl("https://accounts.google.com/o/oauth2/v2/auth"), "Google sign-in is recognised.");
foreach (var other in new[] {
    "http://accounts.google.com/",
    "https://accounts.google.com:8443/",
    "https://evil@accounts.google.com/",
    "https://accounts.google.com.evil.example/",
    "ftp://accounts.google.com/",
})
{
    Check(!FlyoutUrlPolicy.IsSignInUrl(other), $"Not Google sign-in: {other}");
}

// Only https links reach the default browser (gap #10).
Check(FlyoutUrlPolicy.IsBrowserUrl("https://play.google.com/store/apps"), "An https link opens in the browser.");
foreach (var other in new[] {
    "http://example.com/",
    "file:///C:/Windows/System32/calc.exe",
    "ms-settings:privacy",
    "mailto:someone@example.com",
    "https://user:pass@example.com/",
    "javascript:alert(1)",
    "relative/path",
})
{
    Check(!FlyoutUrlPolicy.IsBrowserUrl(other), $"Not handed to the browser: {other}");
}

// About links (BRAND-8, D-086).
var repository = new Uri("https://github.com/Dynamic-Solutions-Canada/persistent");
Check(AboutLinks.Support(repository).AbsoluteUri == "https://github.com/Dynamic-Solutions-Canada/persistent/issues", "Support goes to the issues.");
Check(AboutLinks.License(repository).AbsoluteUri == "https://github.com/Dynamic-Solutions-Canada/persistent/blob/main/LICENSE", "License links the LICENSE.");
Check(AboutLinks.ThirdPartyNotices(repository).AbsoluteUri
    == "https://github.com/Dynamic-Solutions-Canada/persistent/blob/main/apps/desktop/Persistent.Desktop/THIRD-PARTY-NOTICES.txt",
    "Third-party notices link the generated file.");

Console.WriteLine("Host tests passed.");
