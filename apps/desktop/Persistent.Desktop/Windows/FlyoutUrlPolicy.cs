namespace Persistent.Desktop.Windows;

/// <summary>
/// Which URLs the flyout keeps, hands to the default browser, or posts messages to (host bridge
/// contract gaps #9 and #10). Pure, so the portable harness can test it; every check parses the
/// URL with <see cref="Uri"/>, never compares text.
/// </summary>
public static class FlyoutUrlPolicy
{
    /// <summary>
    /// True for a URL on the configured server's origin: same scheme, host and port, and no
    /// user info. This is the page the bridge talks to and the one navigation that stays in-app.
    /// </summary>
    /// <param name="uri">The candidate URL.</param>
    /// <param name="server">The configured server URL (its origin is what counts).</param>
    public static bool IsAppUrl(string? uri, string? server)
    {
        if (!TryParse(uri, out var parsed) || !TryParse(server, out var origin)) return false;
        return parsed.UserInfo.Length == 0
            && string.Equals(parsed.Scheme, origin.Scheme, StringComparison.OrdinalIgnoreCase)
            && string.Equals(parsed.Host, origin.Host, StringComparison.OrdinalIgnoreCase)
            && parsed.Port == origin.Port;
    }

    /// <summary>
    /// True only for Google's sign-in origin, https://accounts.google.com, which stays in the
    /// flyout so its popup can post the credential back to the page.
    /// </summary>
    public static bool IsSignInUrl(string? uri) =>
        TryParse(uri, out var parsed)
        && parsed.UserInfo.Length == 0
        && parsed.Scheme == Uri.UriSchemeHttps
        && parsed.Host.Equals("accounts.google.com", StringComparison.OrdinalIgnoreCase)
        && parsed.IsDefaultPort;

    /// <summary>
    /// True for a URL the default browser may open: https only, with no user info. Anything else
    /// (another scheme, such as file: or a custom protocol) is never handed to the shell.
    /// </summary>
    public static bool IsBrowserUrl(string? uri) =>
        TryParse(uri, out var parsed)
        && parsed.Scheme == Uri.UriSchemeHttps
        && parsed.UserInfo.Length == 0;

    private static bool TryParse(string? value, out Uri parsed)
    {
        parsed = null!;
        return !string.IsNullOrWhiteSpace(value) && Uri.TryCreate(value, UriKind.Absolute, out parsed!);
    }
}
