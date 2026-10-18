// The stand-in site (preview.html): it runs embed.js for the project in the
// address, opened at once, and dresses itself to match the panel's theme.
(function () {
  var project = new URLSearchParams(location.search).get('p') || ''
  if (!/^([a-z0-9]{8}|demo)$/.test(project)) return
  addEventListener('message', function (event) {
    var message = event.data
    if (event.origin !== location.origin || !message || message.source !== 'feedback-setup' || !message.config) return
    document.documentElement.dataset.site = message.config.theme || 'light'
  })
  var script = document.createElement('script')
  script.src = '/embed.js'
  script.dataset.project = project
  script.dataset.preview = ''
  document.body.appendChild(script)
})()
