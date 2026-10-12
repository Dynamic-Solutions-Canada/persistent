/* Audio belongs to a local resident renderer, never to a hosted page that can be hidden or reloaded. */
const alarm = document.querySelector('#alarm')
window.persistentLocal.onAudio(async (active) => {
  if (active) {
    try {
      await alarm.play()
    } catch {
      await window.persistentLocal.request({ type: 'audioFailed' })
    }
  } else {
    alarm.pause()
    alarm.currentTime = 0
  }
})
void window.persistentLocal.request({ type: 'audioReady' })
