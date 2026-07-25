import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Il service worker richiede un "contesto sicuro" (HTTPS o localhost): su LAN via
// semplice HTTP il browser lo ignora silenziosamente, il gioco funziona comunque.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
