using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Persistent.Desktop.Classes;
using Persistent.Localization;

namespace TechnicallyReal.Promo;

/// <summary>
/// Temporary consuming adapter for the shared page: translates each app's blurb through this
/// app's catalog. Since apps-promo v2 the page localizes its own title, subtitle and action
/// labels (through <see cref="PromoLocalization"/>, wired in App.OnLaunched), but it shows
/// blurbs in English from the manifest. Delete this file at the apps-promo pin that ships
/// translated blurbs. Only exact catalogued blurbs are substituted; new remote copy stays literal.
/// </summary>
public sealed partial class PromotedAppsPage
{
    private static readonly string[] PromoBlurbKeys = [
        "promo.printstream", "promo.little-launcher", "promo.immichdrive", "promo.repilot", "promo.persistent"
    ];
    private object? _promoOriginalItems;
    private object? _promoPresentedItems;
    private bool _promoApplying;
    private bool _promoAttached;
    private long _promoSourceCallback;

    /// <summary>Attach once to this page's named ItemsControl.</summary>
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
            RefreshPromoBlurbs();
        });
        UiText.Changed += RefreshPromoBlurbs;
        RefreshPromoBlurbs();
    }

    /// <summary>Keep the original English model so language changes never translate a prior translation.</summary>
    private void RefreshPromoBlurbs()
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
                Blurb = PromoBlurb(app.Blurb),
                ActionLabel = app.ActionLabel
            }).ToList();
            AppList.ItemsSource = _promoPresentedItems;
        }
        finally { _promoApplying = false; }
    }

    private static string PromoBlurb(string value) =>
        PromoBlurbKeys.FirstOrDefault(key => UiText.Source(key) == value) is string key ? UiText.Get(key) : value;

    private void PromoUnloaded(object sender, RoutedEventArgs args)
    {
        UiText.Changed -= RefreshPromoBlurbs;
        AppList.UnregisterPropertyChangedCallback(ItemsControl.ItemsSourceProperty, _promoSourceCallback);
        _promoAttached = false;
    }
}
