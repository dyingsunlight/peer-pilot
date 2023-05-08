export const raf = (func: (...args: any[]) => any) => {
  let ticking = false
  return (...args: any[]) => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(function () {
      func(...args)
      ticking = false
    })
  }
}
