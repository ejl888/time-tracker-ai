/** Scrolls the page to the top. Through the root element, as jsdom does not implement `window.scrollTo`. */
export function scrollToTop() {
  document.documentElement.scrollTop = 0
}
