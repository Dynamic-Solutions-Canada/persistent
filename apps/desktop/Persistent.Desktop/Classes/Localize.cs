using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Persistent.Localization;

namespace Persistent.Desktop.Classes;

/// <summary>Bound application labels refresh in place, preserving native form values and navigation.</summary>
public static class Localize
{
    private sealed record Binding(WeakReference<DependencyObject> Target, DependencyProperty Property);
    private static readonly List<Binding> Bindings = [];
    public static readonly DependencyProperty TextProperty = Register("Text");
    public static readonly DependencyProperty ContentProperty = Register("Content");
    public static readonly DependencyProperty ToolTipProperty = Register("ToolTip");
    public static readonly DependencyProperty PlaceholderProperty = Register("Placeholder");
    public static readonly DependencyProperty NameProperty = Register("Name");

    static Localize()
    {
        UiText.Changed += () => App.MainDispatcherQueue.TryEnqueue(() =>
        {
            Bindings.RemoveAll(binding => !binding.Target.TryGetTarget(out _));
            foreach (var binding in Bindings)
                if (binding.Target.TryGetTarget(out var target)) Apply(target, binding.Property);
        });
    }

    private static DependencyProperty Register(string name) => DependencyProperty.RegisterAttached(name, typeof(string), typeof(Localize), new PropertyMetadata(null, (target, args) =>
    {
        Bindings.Add(new Binding(new WeakReference<DependencyObject>(target), args.Property));
        Apply(target, args.Property);
    }));

    private static void Apply(DependencyObject target, DependencyProperty property)
    {
        if (target.GetValue(property) is not string key) return;
        string value = UiText.Get(key);
        if (property == TextProperty && target is TextBlock text) text.Text = value;
        else if (property == ContentProperty && target is ContentControl content) content.Content = value;
        else if (property == ToolTipProperty) ToolTipService.SetToolTip(target, value);
        else if (property == PlaceholderProperty && target is TextBox input) input.PlaceholderText = value;
        else if (property == NameProperty) AutomationProperties.SetName(target, value);
    }

    public static string GetText(DependencyObject target) => (string)target.GetValue(TextProperty);
    public static void SetText(DependencyObject target, string value) => target.SetValue(TextProperty, value);
    public static string GetContent(DependencyObject target) => (string)target.GetValue(ContentProperty);
    public static void SetContent(DependencyObject target, string value) => target.SetValue(ContentProperty, value);
    public static string GetToolTip(DependencyObject target) => (string)target.GetValue(ToolTipProperty);
    public static void SetToolTip(DependencyObject target, string value) => target.SetValue(ToolTipProperty, value);
    public static string GetPlaceholder(DependencyObject target) => (string)target.GetValue(PlaceholderProperty);
    public static void SetPlaceholder(DependencyObject target, string value) => target.SetValue(PlaceholderProperty, value);
    public static string GetName(DependencyObject target) => (string)target.GetValue(NameProperty);
    public static void SetName(DependencyObject target, string value) => target.SetValue(NameProperty, value);
}
