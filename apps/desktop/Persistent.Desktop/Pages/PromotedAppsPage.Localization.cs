using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Persistent.Desktop.Classes;
using Persistent.Localization;

namespace TechnicallyReal.Promo;

/// <summary>
/// Consuming adapter for the shared page. Its original loader still owns remote
/// refresh, cached/bundled fallback, ordering, icons and destinations. Only exact
/// catalogued display copy is substituted; brand names and new remote copy stay literal.
/// </summary>
public sealed partial class PromotedAppsPage
{
    private static readonly string[] PromoCopyKeys = [
        "Our other apps", "promo.store-subtitle", "promo.website", "promo.view-store",
        "promo.printstream", "promo.little-launcher", "promo.immichdrive", "promo.repilot", "promo.persistent"
    ];
    private object? _promoOriginalItems;
    private object? _promoPresentedItems;
    private bool _promoApplying;
    private bool _promoAttached;
    private long _promoSourceCallback;

    /// <summary>Attach once to this page's named ItemsControl and known header labels.</summary>
    internal void EnableLocalization()
    {
        Loaded -= PromoLoaded;
        Loaded += PromoLoaded;
        Unloaded -= PromoUnloaded;
        Unloaded += PromoUnloaded;
        AttachPromoLocalization();
    }

    private void PromoLoaded(object sender, RoutedEventArgs args) => AttachPromoLocalization();

    private void AttachPromoLocalization()
    {
        if (_promoAttached) return;
        _promoAttached = true;
        if (!ReferenceEquals(AppList.ItemsSource, _promoPresentedItems))
            _promoOriginalItems = AppList.ItemsSource;
        _promoSourceCallback = AppList.RegisterPropertyChangedCallback(ItemsControl.ItemsSourceProperty, (_, _) =>
        {
            if (_promoApplying) return;
            _promoOriginalItems = AppList.ItemsSource;
            RefreshPromoCopy();
        });
        UiText.Changed += RefreshPromoCopy;

        // These are the two headers in the shared page's local content panel,
        // not a traversal of arbitrary windows or reminder/user-authored content.
        if (Content is ScrollViewer viewer && viewer.Content is Panel panel)
        {
            foreach (var text in panel.Children.OfType<TextBlock>())
            {
                string? key = KnownPromoKey(text.Text);
                if (key != null) Localize.SetText(text, key);
            }
        }
        RefreshPromoCopy();
    }

    /// <summary>Keep the original English model so language changes never translate a prior translation.</summary>
    private void RefreshPromoCopy()
    {
        if (_promoOriginalItems is not IEnumerable<PromotedApp> apps) return;
        _promoApplying = true;
        try
        {
            _promoPresentedItems = apps.Select(app => new PromotedApp
            {
                Name = app.Name,
                Destination = app.Destination,
                Icon = app.Icon,
                Blurb = PromoCopy(app.Blurb),
                ActionLabel = PromoCopy(app.ActionLabel)
            }).ToList();
            AppList.ItemsSource = _promoPresentedItems;
        }
        finally { _promoApplying = false; }
    }

    private static string? KnownPromoKey(string value) => PromoCopyKeys.FirstOrDefault(key => UiText.Source(key) == value);
    private static string PromoCopy(string value) => KnownPromoKey(value) is string key ? UiText.Get(key) : value;

    private void PromoUnloaded(object sender, RoutedEventArgs args)
    {
        UiText.Changed -= RefreshPromoCopy;
        AppList.UnregisterPropertyChangedCallback(ItemsControl.ItemsSourceProperty, _promoSourceCallback);
        _promoAttached = false;
    }
}
