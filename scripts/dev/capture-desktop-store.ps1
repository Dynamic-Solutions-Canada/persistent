<#
Capture Persistent's four Microsoft Store tray-flyout views for ONE listing locale, in the test VM's
desktop session (windows-build-tools app-test; run by scripts/dev/capture-desktop-store.sh through
app_test_ui, never on a personal desktop). Untested: written before the localized capture session,
so its first run is supervised.

Nothing here looks an element up by its English name. Native parts are found by automation ID or
class (the tray icon by AutomationId NotifyItemIcon and the app's non-localized tooltip
"Persistent"), and the flyout's web content is driven through the WebView2 debug port by URL,
with the reminder ids from store-assets/fixture.json, so the same script works in every Windows
display language.

Inputs come from C:\apptest\capture-inputs.json (app_test_ui passes no arguments):
  locale      the listing locale, which must also be Windows' display language and the app's
  debugPort   the WebView2 remote debugging port the HKLM policy enables (README)
  scale       the display scale every capture must report (200)
  reminders   { "outTheDoor": id, "vitamin": id } from fixture.json
  hour12      true for en-US (the approved 12-hour look); false lets the locale decide
Writes C:\apptest\out\<locale>\0N-<view>-dark.png and .json, through Save-DesktopCapture.
#>
$ErrorActionPreference = 'Stop'
. C:\apptest\ui-lib.ps1

$inputs = Get-Content C:\apptest\capture-inputs.json -Raw -Encoding utf8 | ConvertFrom-Json
$locale = [string]$inputs.locale
$UiOut = "C:\apptest\out\$locale"
New-Item -ItemType Directory -Force $UiOut | Out-Null

<# The one page target in the flyout's WebView2, as a connected CDP session object. #>
function Connect-Flyout([int]$Port) {
    $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json"
    $page = @($targets | Where-Object { $_.type -eq 'page' }) | Select-Object -First 1
    if (-not $page) { throw "No WebView2 page on debug port $Port; is the debug policy set and the app running?" }
    $socket = New-Object System.Net.WebSockets.ClientWebSocket
    $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
    [pscustomobject]@{ Socket = $socket; NextId = 1 }
}

<#
Evaluate a JavaScript expression in the flyout page and return its value (awaiting a promise).
Throws on a JavaScript exception, so a missing route or element fails the run.
#>
function Invoke-FlyoutScript($Session, [string]$Expression) {
    $id = $Session.NextId++
    $message = @{ id = $id; method = 'Runtime.evaluate'; params = @{ expression = $Expression; awaitPromise = $true; returnByValue = $true } } |
        ConvertTo-Json -Depth 5 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $Session.Socket.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, [Threading.CancellationToken]::None).Wait()

    # Read frames until the reply with our id (events may arrive in between).
    $buffer = New-Object byte[] 65536
    while ($true) {
        $text = New-Object Text.StringBuilder
        do {
            $result = $Session.Socket.ReceiveAsync([ArraySegment[byte]]$buffer, [Threading.CancellationToken]::None).Result
            [void]$text.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
        } while (-not $result.EndOfMessage)
        $reply = $text.ToString() | ConvertFrom-Json
        if ($reply.id -ne $id) { continue }
        if ($reply.result.exceptionDetails) { throw "Flyout script failed: $($reply.result.exceptionDetails.text) in: $Expression" }
        return $reply.result.result.value
    }
}

<# Navigate the single-page app to a route without a reload, then let it render. #>
function Open-FlyoutRoute($Session, [string]$Path) {
    Invoke-FlyoutScript $Session "history.pushState({}, '', '$Path'); dispatchEvent(new PopStateEvent('popstate')); true" | Out-Null
    Start-Sleep -Seconds 3
}

<# The flyout: Persistent.Desktop's visible top-level window nearest the bottom-right of the work area. #>
function Get-FlyoutWindow {
    $work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    @(Get-AppWindows 'Persistent.Desktop') |
        Where-Object { -not $_.Current.IsOffscreen -and $_.Current.BoundingRectangle.Width -gt 0 } |
        Sort-Object { ($work.Right - $_.Current.BoundingRectangle.Right) + ($work.Bottom - $_.Current.BoundingRectangle.Bottom) } |
        Select-Object -First 1
}

<#
Whether a Windows language tag is the listing locale. Windows reports some without the region or
with a script ("ja" for ja-JP, "zh-Hans-CN" for zh-CN), so the language must match and the region,
when the tag names one, too.
#>
function Test-LanguageTag([string]$Tag, [string]$Locale) {
    $wanted = $Locale.Split('-')
    $parts = $Tag.Split('-')
    if ($parts[0] -ne $wanted[0]) { return $false }
    $region = $parts | Select-Object -Skip 1 | Where-Object { $_.Length -eq 2 }
    return (-not $region) -or ($region -eq $wanted[1])
}

# 1. Windows must already be in this locale (the capture owner switches it between locales).
$windowsLanguage = (Get-WinUserLanguageList)[0].LanguageTag
if (-not (Test-LanguageTag $windowsLanguage $locale)) { throw "Windows' display language is $windowsLanguage, not $locale. Switch it first." }

# 2. Open the flyout from the tray icon, found by automation ID and the product-name tooltip.
$icon = Find-TrayIcon 'Persistent'
if (-not $icon) { throw 'No Persistent tray icon; is the app running?' }
# The previous locale's run leaves the flyout open, and a click on the icon would close it.
if (-not (Get-FlyoutWindow)) { Invoke-Click $icon }
# Park the pointer on empty desktop, so the tray icon's hover and (on the VM's software cursor) the
# pointer itself stay out of the captures.
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
[UiNative]::SetCursorPos([int]($screen.Width * 0.2), [int]($screen.Height * 0.3)) | Out-Null
Start-Sleep -Seconds 2
$flyout = Get-FlyoutWindow
if (-not $flyout) { throw 'The flyout did not open.' }

# 3. The web app must follow the device: no per-device language or format override, and the app's
#    wording in this locale. en-US keeps the approved 12-hour look; other locales use their own.
$session = Connect-Flyout ([int]$inputs.debugPort)
$hour12 = if ($inputs.hour12) { 'true' } else { 'false' }
Invoke-FlyoutScript $session @"
(() => {
  const key = 'persistent-settings'
  const settings = JSON.parse(localStorage.getItem(key) || '{}')
  delete settings.languageOverride
  delete settings.formattingLocaleOverride
  if ($hour12) { settings.timeFormat = '12h'; settings.timeFormatChosen = true }
  else { delete settings.timeFormat; settings.timeFormatChosen = false }
  localStorage.setItem(key, JSON.stringify(settings))
  // The native-app promotion is dismissed in every capture (README, "Prepare the demo").
  localStorage.setItem('persistent-hide-native-apps-banner', '1')
  location.reload()
  return true
})()
"@ | Out-Null
Start-Sleep -Seconds 5
$session.Socket.Dispose()
$session = Connect-Flyout ([int]$inputs.debugPort)
$pageLanguage = Invoke-FlyoutScript $session 'document.documentElement.lang || navigator.language'
if (-not ([string]$pageLanguage).StartsWith($locale.Split('-')[0])) {
    throw "The flyout shows $pageLanguage, not $locale; the capture would mix languages."
}

# 4. The four views, in manifest order, each by route and fixture id.
$views = @(
    @{ name = '01-current-dark'; path = '/' },
    @{ name = '02-checklist-dark'; path = "/reminders/$($inputs.reminders.outTheDoor)" },
    @{ name = '03-medication-dark'; path = "/reminders/$($inputs.reminders.vitamin)/edit" },
    @{ name = '04-assigned-dark'; path = '/assigned' }
)
foreach ($view in $views) {
    Open-FlyoutRoute $session $view.path
    $flyout = Get-FlyoutWindow
    Save-DesktopCapture $view.name $flyout
    # The flyout's web content is out of UI Automation's reach, so its element dump is empty; save the
    # page's visible text beside the capture for the localization checks instead (not committed).
    $text = Invoke-FlyoutScript $session 'document.body.innerText'
    [IO.File]::WriteAllText("$UiOut\$($view.name).text.txt", [string]$text, (New-Object Text.UTF8Encoding $false))

    # Every capture must be at the agreed display scale, or the renderer's crop is wrong.
    $sidecar = Get-Content "$UiOut\$($view.name).json" -Raw | ConvertFrom-Json
    if ([int]$sidecar.scale -ne [int]$inputs.scale) {
        throw "$($view.name) was captured at $($sidecar.scale)%, not $($inputs.scale)%."
    }
}

# Leave the flyout on Current for the next locale, and close the debug connection.
Open-FlyoutRoute $session '/'
$session.Socket.Dispose()
Write-Output "captured: $locale ($($views.Count) views)"
