using System.Collections.Concurrent;

namespace Persistent.Desktop.Notifications;

/// <summary>
/// Serializes native presentation and removal with their tracking changes. A language
/// refresh cannot repost an obligation after Done, sign-out or a realtime dismissal.
/// Server authorization and all occurrence policy remain outside this class.
/// </summary>
internal sealed class NotificationPresentation(
    Func<NotificationOccurrence, bool> showOccurrence,
    Func<NotificationOccurrence, bool> showConfirmation,
    Func<string, Task> remove,
    Func<Task> clear,
    Func<bool> canPresent)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ConcurrentDictionary<string, TrackedNotification> _live = new();
    private readonly HashSet<string> _pendingRelabel = new(StringComparer.Ordinal);

    internal IEnumerable<TrackedNotification> Values => _live.Values;
    internal bool TryGet(string id, out TrackedNotification tracked) => _live.TryGetValue(id, out tracked!);

    /// <summary>Present a current server projection, optionally fenced against a departed session.</summary>
    internal async Task ShowAsync(NotificationOccurrence occurrence, Func<bool>? stillCurrent = null, bool requireTracked = false)
    {
        await _gate.WaitAsync();
        try
        {
            if (!canPresent() || stillCurrent?.Invoke() == false) return;
            if (requireTracked && !_live.ContainsKey(occurrence.OccurrenceId)) return;
            if (!showOccurrence(occurrence)) return;
            _live[occurrence.OccurrenceId] = new(occurrence, DateTimeOffset.UtcNow);
        }
        finally { _gate.Release(); }
    }

    /// <summary>Arm the existing two-tap Done presentation without submitting an action.</summary>
    internal async Task ConfirmAsync(string id)
    {
        await _gate.WaitAsync();
        try
        {
            if (!canPresent() || !_live.TryGetValue(id, out var tracked)) return;
            if (showConfirmation(tracked.Occurrence))
                _live[id] = tracked with { ConfirmingDone = true, LastShownAt = DateTimeOffset.UtcNow };
        }
        finally { _gate.Release(); }
    }

    /// <summary>
    /// Immediately repost current wording, preserving armed Done and alarm scenarios.
    /// Windows may restart audio and reset an unsubmitted snooze selection. Failed posts
    /// retain tracking so ordinary persistence can retry. Removals use this same gate.
    /// </summary>
    internal async Task RelabelAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (!canPresent()) return;
            foreach (var (id, tracked) in _live)
            {
                Repost(id, tracked);
            }
        }
        finally { _gate.Release(); }
    }

    /// <summary>Retry a failed language replacement without resetting an armed Done or restoring a removed obligation.</summary>
    internal async Task RetryPendingAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (!canPresent()) return;
            foreach (string id in _pendingRelabel.ToArray())
            {
                if (_live.TryGetValue(id, out var tracked)) Repost(id, tracked);
                else _pendingRelabel.Remove(id);
            }
        }
        finally { _gate.Release(); }
    }

    private void Repost(string id, TrackedNotification tracked)
    {
        bool shown = tracked.ConfirmingDone
            ? showConfirmation(tracked.Occurrence)
            : showOccurrence(tracked.Occurrence);
        if (shown)
        {
            _live[id] = tracked with { LastShownAt = DateTimeOffset.UtcNow };
            _pendingRelabel.Remove(id);
        }
        else _pendingRelabel.Add(id);
    }

    /// <summary>Remove both tracking and the native toast before a later presentation can proceed.</summary>
    internal async Task RemoveAsync(string id)
    {
        await _gate.WaitAsync();
        try
        {
            _live.TryRemove(id, out _);
            _pendingRelabel.Remove(id);
            await remove(id);
        }
        finally { _gate.Release(); }
    }

    /// <summary>Clear a departed account or disabled service atomically with any in-flight relabel.</summary>
    internal async Task ClearAsync()
    {
        await _gate.WaitAsync();
        try
        {
            _live.Clear();
            _pendingRelabel.Clear();
            await clear();
        }
        finally { _gate.Release(); }
    }
}
