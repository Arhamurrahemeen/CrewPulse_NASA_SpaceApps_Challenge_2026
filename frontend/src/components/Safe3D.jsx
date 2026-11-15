import { Component } from 'react'

// If WebGL is missing or a scene throws, show the fallback instead of breaking the page.
export default class Safe3D extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e) { console.warn('3D view disabled:', e?.message) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
