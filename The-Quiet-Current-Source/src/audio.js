export class RiverAudio {
  constructor() {
    this.enabled = false
    this.paused = false
  }

  async toggle() {
    if (this.enabled) {
      this.enabled = false
      this.sync()
      return false
    }
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) return false
    try {
      if (!this.context) this.create(new Context())
      await this.context.resume()
      this.enabled = true
      this.sync()
      return true
    } catch {
      return false
    }
  }

  create(context) {
    this.context = context
    this.master = context.createGain()
    this.master.gain.value = 0
    this.master.connect(context.destination)
    this.noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
    const samples = this.noise.getChannelData(0)
    let previous = 0
    for (let i = 0; i < samples.length; i++) {
      previous = previous * 0.75 + (Math.random() * 2 - 1) * 0.25
      samples[i] = previous
    }
    this.makeLoop('lowpass', 415, 0.32, 0.37, 0.04)
    this.makeLoop('bandpass', 1320, 0.12, 0.16, 0.067)
    const insect = context.createOscillator()
    const insectGain = context.createGain()
    insect.type = 'triangle'
    insect.frequency.value = 3580
    insectGain.gain.value = 0.006
    insect.connect(insectGain).connect(this.master)
    insect.start()
    this.modulate(insectGain.gain, 13.4, 0.004)
    this.modulate(insectGain.gain, 0.66, 0.0028)
  }

  modulate(parameter, rate, level) {
    const oscillator = this.context.createOscillator()
    const depth = this.context.createGain()
    oscillator.frequency.value = rate
    depth.gain.value = level
    oscillator.connect(depth).connect(parameter)
    oscillator.start()
  }

  makeLoop(type, frequency, level, rate, depth) {
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = 0.55
    gain.gain.value = level
    source.connect(filter).connect(gain).connect(this.master)
    source.start(0, Math.random() * 2)
    this.modulate(gain.gain, rate, depth)
  }

  sync() {
    if (!this.context) return
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(this.enabled ? (this.paused ? 0.14 : 0.62) : 0, now, 0.16)
    if (!this.enabled || this.paused) {
      window.clearTimeout(this.birdTimer)
      this.birdTimer = undefined
    } else if (!this.birdTimer) {
      this.scheduleBird()
    }
  }

  setPaused(paused) {
    this.paused = paused
    this.sync()
  }

  scheduleBird() {
    this.birdTimer = window.setTimeout(() => {
      const pitch = 980 + Math.random() * 1150
      const pan = Math.random() * 1.7 - 0.85
      this.chirp(0, pitch, pan)
      this.chirp(0.19, pitch * 1.19, pan)
      if (Math.random() > 0.50) this.chirp(0.35, pitch * 0.91, pan)
      this.scheduleBird()
    }, 2900 + Math.random() * 5700)
  }

  chirp(delay, pitch, pan) {
    const context = this.context
    const oscillator = context.createOscillator()
    const loudness = context.createGain()
    const stereo = context.createStereoPanner()
    const start = context.currentTime + delay
    const length = 0.15
    stereo.pan.value = pan
    oscillator.frequency.setValueAtTime(pitch, start)
    oscillator.frequency.exponentialRampToValueAtTime(pitch * 1.22, start + length * 0.36)
    oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.71, start + length)
    loudness.gain.setValueAtTime(0.001, start)
    loudness.gain.exponentialRampToValueAtTime(0.032, start + 0.028)
    loudness.gain.exponentialRampToValueAtTime(0.001, start + length)
    oscillator.connect(loudness).connect(stereo).connect(this.master)
    oscillator.start(start)
    oscillator.stop(start + length + 0.04)
  }

  splash(side) {
    this.burst(0.34, 940, 290, 0.40, side === 0 ? -0.56 : 0.56)
  }

  collision(kind, strength) {
    const hard = kind === 'rock'
    this.burst(0.22, hard ? 290 : 170, hard ? 92 : 63, 0.56 * strength, 0)
    this.burst(0.35, 620, 160, 0.26 * strength, 0)
  }

  burst(duration, frequency, endFrequency, volume, pan) {
    if (!this.enabled || this.paused) return
    const context = this.context
    const start = context.currentTime
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    const stereo = context.createStereoPanner()
    source.buffer = this.noise
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(frequency, start)
    filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration)
    envelope.gain.setValueAtTime(0.001, start)
    envelope.gain.exponentialRampToValueAtTime(volume + 0.001, start + 0.027)
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
    stereo.pan.value = pan
    source.connect(filter).connect(envelope).connect(stereo).connect(this.master)
    source.start(start, Math.random() * 2, duration)
  }
}
