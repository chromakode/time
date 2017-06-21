import './ui.less'

export default function initUI() {
  window.addEventListener('keydown', ({key}) => {
    let dest
    if (key === 'ArrowLeft') {
      dest = document.getElementById('prev')
    } else if (key === 'ArrowRight') {
      dest = document.getElementById('next')
    }
    if (dest) {
      dest.click()
    }
  })

  const footerEl = document.createElement('footer')
  footerEl.innerHTML = `
    <a class="logo" href="http://chromakode.com">
      <svg viewBox="0 0 32 32">
        <circle r="4.8156" cy="6.2955" cx="10.3971" />
        <circle r="4.8156" cy="6.2955" cx="21.6028" />
        <circle r="4.8156" cx="4.794302" cy="16" />
        <circle r="4.8156" cx="16" cy="16" />
        <circle r="4.8156" cx="27.2057" cy="16" />
        <circle r="4.8156" cx="21.6028" cy="25.7045" />
        <circle r="4.8156" cx="10.3971" cy="25.7045" />
      </svg>
    </a>
  `
  document.body.appendChild(footerEl)
}
