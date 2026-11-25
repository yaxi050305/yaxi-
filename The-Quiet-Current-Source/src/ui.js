const icons = {
  river: '<path d="M3 13c3.5 0 4.7-2.7 8.2-2.7 3.6 0 4.9 2.7 9.8 2.7M3 17.2c3.5 0 4.7-2.6 8.2-2.6 3.6 0 4.9 2.6 9.8 2.6M6.8 7.3 11 3l4 4.3M13.7 6l2-2 4.6 5.2"/>',
  audio: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5.4a4 4 0 0 1 0 5.2m2.5-7.7a7.3 7.3 0 0 1 0 10.2"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 1 4 4m0-4-4 4"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  play: '<path d="M9 5.5 19 12 9 18.5Z" fill="currentColor" stroke="none"/>',
  paddle: '<path d="m21 3-11.8 11.8m0 0c-1.1-.6-2.3-.7-3.2.2l-2.2 2.2c-.9.9-.9 2.3 0 3.2.9.9 2.3.9 3.2 0l2.2-2.2c.9-.9.8-2.1 0-3.4Z"/>',
  mouse: '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 6.5v3.3"/>',
  dock: '<path d="M3 20c1.7 0 2.1-1 3.7-1s2 1 3.7 1 2.2-1 3.8-1 2.1 1 3.8 1 2.1-1 3-1M6 16V9m12 7V9M3.5 11 12 4l8.5 7M9 16v-4h6v4"/>',
  crossing: '<path d="M2.5 17c2 0 2.5-1.3 4.5-1.3s2.5 1.3 4.5 1.3 2.5-1.3 4.5-1.3 2.5 1.3 5.5 1.3M4 12l4-3 3 2 3-2 5.8 2.5M16.8 9.9l1-2.6"/>',
}

const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`

const controlsLegend = `
  <div class="control-item"><kbd>A</kbd><span>左桨</span></div>
  <div class="control-item"><kbd>D</kbd><span>右桨</span></div>
  <div class="control-item"><span class="control-mouse">${icon('mouse')}</span><span>观察四周</span></div>
`

export function createUI(root, actions) {
  root.innerHTML = `
    <div class="view" id="view" aria-label="河道场景"></div>
    <div class="vignette" aria-hidden="true"></div>
    <div class="impact" aria-hidden="true"></div>
    <header class="topbar">
      <div class="identity"><span class="identity-mark">${icon('river')}</span><span>THE QUIET CURRENT</span></div>
      <div class="top-actions">
        <button class="outline-button sound" type="button" aria-pressed="false">${icon('mute')}<span>环境音</span></button>
        <button class="outline-button pause" type="button" aria-label="暂停" title="暂停 (Esc)" hidden>${icon('pause')}</button>
      </div>
    </header>

    <section class="intro" aria-labelledby="title">
      <div class="intro-inner">
        <div class="eyebrow"><span></span>夕阳下的热带雨林</div>
        <h1 id="title">雾隐<br><em>深流</em></h1>
        <p>夕阳沉向林梢，清水映着晚霞。<br>等鳄鱼游过，再划向河湾里的古老码头。</p>
        <button class="primary start" type="button">${icon('paddle')}<span>开始划船</span></button>
      </div>
    </section>

    <div class="opening-footer">
      <div class="legend" aria-label="游戏操作">${controlsLegend}</div>
      <div class="destination"><span class="destination-icon">${icon('dock')}</span><span><small>目的地</small><b>古老码头</b></span></div>
    </div>

    <section class="progress-panel" aria-label="航程进度" hidden>
      <div class="progress-top"><span>${icon('dock')} 古老码头</span><b class="meters"></b></div>
      <progress class="progress" max="100" value="0" aria-label="航程进度"></progress>
    </section>
    <div class="guide" hidden>
      <span><kbd>A</kbd> / 鼠标左键划左桨</span>
      <span><kbd>D</kbd> / 鼠标右键划右桨</span>
      <span>${icon('mouse')} 移动鼠标观察</span>
    </div>
    <div class="touch-controls" hidden>
      <button type="button" data-oar="0">${icon('paddle')} 左桨</button>
      <button type="button" data-oar="1">${icon('paddle')} 右桨</button>
    </div>
    <div class="dock-hint" aria-hidden="true" hidden>${icon('dock')}<span>古老码头</span></div>
    <div class="crossing-warning" role="status" hidden>${icon('crossing')}<span>前方有鳄鱼经过，提前松桨避让</span></div>
    <div class="docking-status" role="status" hidden>${icon('dock')}<span>正在靠岸</span></div>

    <div class="dialog-overlay" hidden>
      <section class="dialog" aria-labelledby="dialog-title" role="dialog" aria-modal="true">
        <div class="dialog-badge"><span class="dialog-icon"></span></div>
        <div class="arrival-label" hidden>航程完成</div>
        <h2 id="dialog-title"></h2>
        <p></p>
        <dl class="arrival-stats" hidden>
          <div><dt>航程</dt><dd data-stat="distance"></dd></div>
          <div><dt>用时</dt><dd data-stat="seconds"></dd></div>
          <div><dt>划桨</dt><dd data-stat="strokes"></dd></div>
        </dl>
        <button class="primary dialog-action" type="button"></button>
      </section>
    </div>
  `
  const find = name => root.querySelector(name)
  const sound = find('.sound')
  const overlay = find('.dialog-overlay')
  const guide = find('.guide')
  const progress = find('.progress')
  const meters = find('.meters')
  const marker = find('.dock-hint')
  const dialogAction = find('.dialog-action')
  const impact = find('.impact')
  const pause = find('.pause')
  const warning = find('.crossing-warning')
  const dockingStatus = find('.docking-status')
  const stats = find('.arrival-stats')
  let mode = 'intro'
  let previousMeters = -1
  const view = find('#view')

  find('.start').addEventListener('click', actions.start)
  pause.addEventListener('click', actions.pause)
  dialogAction.addEventListener('click', () => mode === 'paused' ? actions.pause() : actions.start())
  sound.addEventListener('click', async () => {
    const enabled = await actions.sound()
    sound.setAttribute('aria-pressed', String(enabled))
    sound.title = enabled ? '关闭环境音' : '开启环境音'
    sound.innerHTML = icon(enabled ? 'audio' : 'mute') + `<span>环境音</span>`
  })
  sound.title = '开启环境音'
  for (const button of root.querySelectorAll('[data-oar]')) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      actions.touch(Number(button.dataset.oar), true)
    })
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, () => actions.touch(Number(button.dataset.oar), false))
    }
  }

  return {
    view,
    setMode(state, result) {
      mode = state
      root.dataset.mode = mode
      const playing = mode === 'playing'
      const intro = mode === 'intro'
      const docking = mode === 'docking'
      const arrived = mode === 'finished'
      const failed = mode === 'failed'
      const dialog = mode === 'paused' || arrived || failed
      find('.intro').hidden = !intro
      find('.opening-footer').hidden = !intro
      find('.progress-panel').hidden = !playing
      pause.hidden = !playing
      guide.hidden = !playing
      find('.touch-controls').hidden = !playing
      dockingStatus.hidden = !docking
      overlay.hidden = !dialog
      marker.hidden = true
      warning.hidden = true
      if (dialog) {
        find('.dialog-icon').innerHTML = icon(arrived ? 'dock' : failed ? 'crossing' : 'pause')
        find('#dialog-title').textContent = arrived ? '已抵达古老码头' : failed ? '航行失败' : '划行已暂停'
        find('.dialog p').textContent = arrived ? '小船已停稳。暮色落在河面，码头的灯亮了起来。'
          : failed ? '船身碰到了鳄鱼。下次提早松桨，等它游过再继续。' : '河水还在等你。'
        find('.arrival-label').hidden = !arrived
        stats.hidden = !arrived
        if (arrived) {
          const seconds = Math.floor(result.seconds)
          find('[data-stat="distance"]').textContent = `${result.distance} 米`
          find('[data-stat="seconds"]').textContent =
            `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
          find('[data-stat="strokes"]').textContent = `${result.strokes} 次`
        }
        dialogAction.innerHTML = mode === 'paused'
          ? icon('play') + '继续划船'
          : icon('paddle') + '重新开始'
        dialogAction.focus({ preventScroll: true })
      } else if (playing) {
        document.activeElement?.blur()
      }
    },
    crossing(nearby) {
      warning.hidden = !nearby
    },
    update(distance, percent, showGuide, point) {
      const rounded = Math.max(0, Math.round(distance))
      if (rounded !== previousMeters) {
        meters.textContent = `${rounded} 米`
        previousMeters = rounded
      }
      progress.value = percent
      guide.classList.toggle('faded', !showGuide)
      marker.hidden = !point
      if (point) {
        marker.style.left = `${point.x}%`
        marker.style.top = `${point.y}%`
      }
    },
    collision(strength) {
      impact.animate([{ opacity: strength * 0.63 }, { opacity: 0 }], {
        duration: 460, easing: 'ease-out',
      })
    },
    error() {
      find('.start').disabled = true
      find('.intro p').textContent = '无法建立 WebGL 2 场景。请使用支持 WebGL 2 的浏览器，并检查硬件加速设置。'
    },
  }
}
