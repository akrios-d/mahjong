"use strict";
/* Small floating "there's more below" indicator. Tall game screens (a
   panel + a full hand of tiles/cards) can end up taller than the
   viewport with no visual cue that scrolling reveals more — this shows
   a bouncing arrow whenever the page is scrollable and not yet scrolled
   near the bottom, and hides itself once you're there. */
(function () {
  function init() {
    const el = document.createElement("button");
    el.id = "scrollHint";
    el.type = "button";
    el.setAttribute("aria-label", "Scroll down");
    el.textContent = "▼";
    document.body.appendChild(el);

    const style = document.createElement("style");
    style.textContent =
      "#scrollHint{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);" +
      "width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;" +
      "background:#e8c060;color:#1a1a1a;font-size:15px;line-height:1;" +
      "display:none;align-items:center;justify-content:center;" +
      "box-shadow:0 3px 10px rgba(0,0,0,0.45);z-index:80;" +
      "animation:scrollHintBounce 1.4s ease-in-out infinite;}" +
      "@keyframes scrollHintBounce{0%,100%{transform:translateX(-50%) translateY(0);}50%{transform:translateX(-50%) translateY(-6px);}}";
    document.head.appendChild(style);

    el.addEventListener("click", () => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    });

    function update() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight > 40;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 20;
      el.style.display = scrollable && !atBottom ? "flex" : "none";
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    new MutationObserver(update).observe(document.body, { childList: true, subtree: true, attributes: true });
    update();
    setInterval(update, 800); // layout changes from render() don't always trigger a mutation event
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
