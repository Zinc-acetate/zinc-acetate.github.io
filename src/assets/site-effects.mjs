const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(pointer: fine)";

export function initRevealEffects({
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
} = {}) {
  const root = documentObject?.documentElement;
  documentObject?.querySelectorAll?.("[data-reveal-content]").forEach((container) => {
    [...container.children].forEach((child) => {
      if (!child.matches("script, style, hr")) child.setAttribute("data-reveal", "");
    });
  });
  const targets = [...(documentObject?.querySelectorAll?.("[data-reveal]") ?? [])];

  if (!root || !targets.length || root.dataset.revealEffects === "ready") {
    return { active: false, disconnect() {} };
  }

  root.dataset.revealEffects = "ready";
  const revealAll = () => {
    root.classList.remove("reveal-ready");
    targets.forEach((target) => target.classList.add("is-revealed"));
  };
  if (typeof windowObject?.IntersectionObserver !== "function") {
    revealAll();
    return { active: false, disconnect() {} };
  }

  const preference = windowObject.matchMedia?.(REDUCED_MOTION_QUERY);
  let frame = 0;
  let active = false;
  const viewportHeight = () => windowObject.innerHeight || root.clientHeight;
  const reveal = (target, delay = 0) => {
    target.style.setProperty("--reveal-delay", `${delay}ms`);
    target.classList.add("is-revealed");
  };
  // Read geometry together, then write styles. DOM order and observer callback
  // order need not match a responsive grid's visual reading order.
  const flush = () => {
    frame = 0;
    if (!active) return;
    const height = viewportHeight();
    const batch = targets
      .filter((target) => !target.classList.contains("is-revealed"))
      .map((target) => ({ target, bounds: target.getBoundingClientRect() }))
      .filter(({ bounds }) => bounds.bottom >= 0 && bounds.top <= height - 24)
      .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
    batch.forEach(({ target }, index) => reveal(target, Math.min(index * 55, 220)));
  };
  const schedule = () => {
    if (active && !frame) frame = windowObject.requestAnimationFrame(flush);
  };
  const enterObserver = new windowObject.IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) schedule();
    },
    { rootMargin: "0px 0px -24px 0px", threshold: 0 },
  );
  // A separate exit boundary provides hysteresis: changing opacity/translate
  // near the screen edge cannot repeatedly toggle the entrance animation.
  const exitObserver = new windowObject.IntersectionObserver(
    (entries) => {
      if (!active) return;
      entries.forEach(({ target, isIntersecting, boundingClientRect }) => {
        if (isIntersecting || target.contains(documentObject.activeElement)) return;
        const bounds = boundingClientRect || target.getBoundingClientRect();
        if (bounds.bottom < -80 || bounds.top > viewportHeight() + 80) {
          target.classList.remove("is-revealed");
          target.style.removeProperty("--reveal-delay");
        }
      });
    },
    { rootMargin: "80px 0px 80px 0px", threshold: 0 },
  );
  const revealContaining = (element) => {
    if (!element) return;
    targets.filter((target) => target.contains(element)).forEach((target) => reveal(target));
  };
  const handleFocus = (event) => revealContaining(event.target);
  const handleHash = () => {
    try {
      revealContaining(documentObject.getElementById(decodeURIComponent(windowObject.location.hash.slice(1))));
    } catch { /* A malformed URL fragment must not hide readable content. */ }
  };
  const syncPreference = () => {
    enterObserver.disconnect();
    exitObserver.disconnect();
    if (frame) windowObject.cancelAnimationFrame(frame);
    frame = 0;
    active = !preference?.matches;
    if (!active) {
      revealAll();
      return;
    }
    root.classList.add("reveal-ready");
    targets.forEach((target) => {
      enterObserver.observe(target);
      exitObserver.observe(target);
    });
    schedule();
    handleHash();
  };
  documentObject.addEventListener("focusin", handleFocus);
  windowObject.addEventListener("hashchange", handleHash);
  windowObject.addEventListener("pageshow", schedule);
  preference?.addEventListener?.("change", syncPreference);
  syncPreference();

  return {
    get active() { return active; },
    disconnect() {
      active = false;
      if (frame) windowObject.cancelAnimationFrame(frame);
      enterObserver.disconnect();
      exitObserver.disconnect();
      documentObject.removeEventListener("focusin", handleFocus);
      windowObject.removeEventListener("hashchange", handleHash);
      windowObject.removeEventListener("pageshow", schedule);
      preference?.removeEventListener?.("change", syncPreference);
      delete root.dataset.revealEffects;
      revealAll();
    },
  };
}

export function initScrollProgress({
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
} = {}) {
  const root = documentObject?.documentElement;
  const indicator = documentObject?.querySelector?.("[data-scroll-progress]");

  if (!root || !indicator || indicator.dataset.progressEffects === "ready") {
    return { active: false, update() {}, disconnect() {} };
  }

  indicator.dataset.progressEffects = "ready";
  let frame = 0;

  const update = () => {
    frame = 0;
    const scrollable = Math.max(0, root.scrollHeight - root.clientHeight);
    const current = Math.max(0, windowObject.scrollY || root.scrollTop || 0);
    const progress = scrollable ? Math.min(1, current / scrollable) : 1;
    indicator.style.setProperty("--scroll-progress", progress.toFixed(4));
  };

  const schedule = () => {
    if (frame) return;
    frame = windowObject.requestAnimationFrame(update);
  };

  windowObject.addEventListener("scroll", schedule, { passive: true });
  windowObject.addEventListener("resize", schedule, { passive: true });
  const resizeObserver = typeof windowObject.ResizeObserver === "function"
    ? new windowObject.ResizeObserver(schedule)
    : null;
  resizeObserver?.observe(documentObject.body);
  schedule();

  return {
    active: true,
    update,
    disconnect() {
      if (frame) windowObject.cancelAnimationFrame(frame);
      windowObject.removeEventListener("scroll", schedule);
      windowObject.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
    },
  };
}

function createSignalPaths(width, height) {
  const paths = [];
  const lanes = width < 720 ? 4 : 7;

  for (let index = 0; index < lanes; index += 1) {
    const y = ((index + 0.8) / (lanes + 0.4)) * height;
    const direction = index % 2 === 0 ? 1 : -1;
    const bend = Math.min(54, height * 0.085) * direction;
    const start = -48;
    const end = width + 48;
    const firstX = width * (0.16 + (index % 3) * 0.09);
    const secondX = width * (0.62 + (index % 2) * 0.11);

    paths.push([
      { x: start, y },
      { x: firstX, y },
      { x: firstX + 28, y: y + bend },
      { x: secondX, y: y + bend },
      { x: secondX + 28, y },
      { x: end, y },
    ]);
  }

  return paths.map((points) => {
    let total = 0;
    const segments = points.slice(1).map((to, index) => {
      const from = points[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      total += length;
      return { from, to, length };
    });
    return { points, segments, total };
  });
}

function pointAlongPath({ points, segments, total }, progress) {
  let remaining = progress * total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length ? remaining / segment.length : 0;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    remaining -= segment.length;
  }

  return points.at(-1);
}

export function initSignalCanvas({
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
} = {}) {
  const canvas = documentObject?.querySelector?.("[data-signal-canvas]");
  const host = canvas?.closest?.("[data-signal-scene]") || canvas?.parentElement;

  if (!canvas || !host || canvas.dataset.signalEffects === "ready") {
    return { active: false, refresh() {}, disconnect() {} };
  }

  let context;
  try { context = canvas.getContext?.("2d"); } catch { /* Canvas is optional. */ }
  if (!context) return { active: false, refresh() {}, disconnect() {} };

  canvas.dataset.signalEffects = "ready";
  const motionPreference = windowObject.matchMedia?.(REDUCED_MOTION_QUERY);
  const pointerPreference = windowObject.matchMedia?.(FINE_POINTER_QUERY);
  let reducedMotion = Boolean(motionPreference?.matches);
  let finePointer = Boolean(pointerPreference?.matches);
  let width = 0;
  let height = 0;
  let deviceScale = 1;
  let paths = [];
  let frame = 0;
  let isVisible = true;
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let colors;
  let elapsed = 0;
  let lastTick = 0;
  let lastDraw = -Infinity;
  let destroyed = false;

  const readColors = () => {
    const style = windowObject.getComputedStyle(documentObject.documentElement);
    return {
      line: style.getPropertyValue("--signal-line").trim() || "rgba(0, 128, 140, 0.2)",
      node: style.getPropertyValue("--signal-node").trim() || "#008b94",
      pulse: style.getPropertyValue("--signal-pulse").trim() || "#97d92f",
    };
  };

  const draw = (time = 0) => {
    if (!width || !height) return;
    colors ||= readColors();

    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(pointerX * 9, pointerY * 7);
    context.lineCap = "square";
    context.lineJoin = "miter";

    paths.forEach((route, index) => {
      const path = route.points;
      context.beginPath();
      context.moveTo(path[0].x, path[0].y);
      path.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.strokeStyle = colors.line;
      context.lineWidth = index % 3 === 0 ? 1.15 : 0.75;
      context.stroke();

      path.slice(1, -1).forEach((point, pointIndex) => {
        if ((pointIndex + index) % 2 !== 0) return;
        context.fillStyle = colors.node;
        context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
      });

      const progress = reducedMotion
        ? (index + 1) / (paths.length + 1)
        : (time * 0.000035 + index * 0.137) % 1;
      // Short packet trails make direction legible without filling the page
      // with particles. Route lengths are cached on resize, not per frame.
      if (!reducedMotion) {
        for (let step = 8; step > 0; step -= 1) {
          const trail = pointAlongPath(route, (progress - step * 0.004 + 1) % 1);
          context.globalAlpha = (1 - step / 9) * 0.42;
          context.fillStyle = colors.node;
          context.fillRect(trail.x - 1, trail.y - 1, 3, 3);
        }
      }
      const pulse = pointAlongPath(route, progress);
      context.globalAlpha = 0.1;
      context.fillStyle = colors.pulse;
      context.fillRect(pulse.x - 8, pulse.y - 8, 16, 16);
      context.globalAlpha = 1;
      context.fillStyle = colors.pulse;
      context.fillRect(pulse.x - 2, pulse.y - 2, 4, 4);
    });

    context.restore();
  };

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    width = Math.max(1, Math.round(bounds.width || host.clientWidth || 1200));
    height = Math.max(1, Math.round(bounds.height || host.clientHeight || 560));
    deviceScale = Math.min(1.5, Math.max(1, windowObject.devicePixelRatio || 1));
    canvas.width = Math.round(width * deviceScale);
    canvas.height = Math.round(height * deviceScale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    paths = createSignalPaths(width, height);
    draw(elapsed);
  };

  const syncAnimation = () => {
    const visible = String(!destroyed && !reducedMotion && isVisible && !documentObject.hidden);
    if (host.dataset.sceneActive !== visible) host.dataset.sceneActive = visible;
    if (destroyed || reducedMotion || frame || !isVisible || documentObject.hidden) return;
    frame = windowObject.requestAnimationFrame((time) => {
      frame = 0;
      if (lastTick) elapsed += Math.min(time - lastTick, 64);
      lastTick = time;
      if (time - lastDraw >= 1000 / 30) {
        lastDraw = time;
        pointerX += (targetPointerX - pointerX) * 0.12;
        pointerY += (targetPointerY - pointerY) * 0.12;
        draw(elapsed);
      }
      syncAnimation();
    });
  };

  const stopAnimation = () => {
    if (frame) windowObject.cancelAnimationFrame(frame);
    frame = 0;
    lastTick = 0;
    lastDraw = -Infinity;
    host.dataset.sceneActive = "false";
  };

  const handleVisibility = () => {
    if (documentObject.hidden) stopAnimation();
    else syncAnimation();
  };

  const handlePointerMove = (event) => {
    if (reducedMotion || !finePointer) return;
    const bounds = host.getBoundingClientRect();
    targetPointerX = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
    targetPointerY = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2;
  };

  const handlePointerLeave = () => {
    targetPointerX = 0;
    targetPointerY = 0;
  };
  const handlePreference = () => {
    reducedMotion = Boolean(motionPreference?.matches);
    finePointer = Boolean(pointerPreference?.matches);
    handlePointerLeave();
    pointerX = 0;
    pointerY = 0;
    stopAnimation();
    draw(elapsed);
    syncAnimation();
  };

  const resizeObserver = typeof windowObject.ResizeObserver === "function"
    ? new windowObject.ResizeObserver(resize)
    : null;
  const visibilityObserver = typeof windowObject.IntersectionObserver === "function"
    ? new windowObject.IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible) syncAnimation();
        else stopAnimation();
      }, { threshold: 0.01 })
    : null;

  resizeObserver?.observe(host);
  visibilityObserver?.observe(host);
  windowObject.addEventListener("resize", resize, { passive: true });
  documentObject.addEventListener("visibilitychange", handleVisibility);
  host.addEventListener("pointermove", handlePointerMove, { passive: true });
  host.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  motionPreference?.addEventListener?.("change", handlePreference);
  pointerPreference?.addEventListener?.("change", handlePreference);

  resize();
  syncAnimation();

  return {
    get active() { return !destroyed && !reducedMotion; },
    refresh() {
      colors = undefined;
      resize();
    },
    disconnect() {
      destroyed = true;
      stopAnimation();
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      windowObject.removeEventListener("resize", resize);
      documentObject.removeEventListener("visibilitychange", handleVisibility);
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      motionPreference?.removeEventListener?.("change", handlePreference);
      pointerPreference?.removeEventListener?.("change", handlePreference);
      delete canvas.dataset.signalEffects;
    },
  };
}

export function initPointerDepth({
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
} = {}) {
  const targets = [...(documentObject?.querySelectorAll?.("[data-pointer-depth], [data-pointer-surface]") ?? [])];
  if (!targets.length) return { active: false, disconnect() {} };
  const motionPreference = windowObject.matchMedia?.(REDUCED_MOTION_QUERY);
  const pointerPreference = windowObject.matchMedia?.(FINE_POINTER_QUERY);
  let enabled = !motionPreference?.matches && Boolean(pointerPreference?.matches);
  const cleanups = [];
  const resets = [];
  targets.forEach((target) => {
    if (target.dataset.pointerDepthEffects === "ready") return;
    target.dataset.pointerDepthEffects = "ready";
    let frame = 0;
    let nextX = 0;
    let nextY = 0;
    let spotX = 50;
    let spotY = 50;

    const render = () => {
      frame = 0;
      if (target.hasAttribute("data-pointer-depth")) {
        target.style.setProperty("--depth-x", `${nextX.toFixed(3)}deg`);
        target.style.setProperty("--depth-y", `${nextY.toFixed(3)}deg`);
      }
      target.style.setProperty("--spot-x", `${spotX.toFixed(2)}%`);
      target.style.setProperty("--spot-y", `${spotY.toFixed(2)}%`);
    };

    const handleMove = (event) => {
      if (!enabled || event.pointerType === "touch") return;
      const bounds = target.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)));
      nextX = (y - 0.5) * -3;
      nextY = (x - 0.5) * 3;
      spotX = x * 100;
      spotY = y * 100;
      target.dataset.pointerActive = "true";
      if (!frame) frame = windowObject.requestAnimationFrame(render);
    };

    const reset = () => {
      if (frame) windowObject.cancelAnimationFrame(frame);
      nextX = 0;
      nextY = 0;
      spotX = 50;
      spotY = 50;
      delete target.dataset.pointerActive;
      render();
    };
    resets.push(reset);
    target.addEventListener("pointerenter", handleMove, { passive: true });
    target.addEventListener("pointermove", handleMove, { passive: true });
    target.addEventListener("pointerleave", reset, { passive: true });
    target.addEventListener("pointercancel", reset, { passive: true });
    cleanups.push(() => {
      reset();
      target.removeEventListener("pointerenter", handleMove);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerleave", reset);
      target.removeEventListener("pointercancel", reset);
      delete target.dataset.pointerDepthEffects;
    });
  });
  const syncPreference = () => {
    enabled = !motionPreference?.matches && Boolean(pointerPreference?.matches);
    resets.forEach((reset) => reset());
  };
  const handleVisibility = () => { if (documentObject.hidden) resets.forEach((reset) => reset()); };
  motionPreference?.addEventListener?.("change", syncPreference);
  pointerPreference?.addEventListener?.("change", syncPreference);
  windowObject.addEventListener("blur", syncPreference);
  documentObject.addEventListener("visibilitychange", handleVisibility);
  return {
    get active() { return enabled && cleanups.length > 0; },
    disconnect() {
      enabled = false;
      cleanups.forEach((cleanup) => cleanup());
      motionPreference?.removeEventListener?.("change", syncPreference);
      pointerPreference?.removeEventListener?.("change", syncPreference);
      windowObject.removeEventListener("blur", syncPreference);
      documentObject.removeEventListener("visibilitychange", handleVisibility);
    },
  };
}

export function initMotionVisibility({ document: documentObject = globalThis.document } = {}) {
  const sync = () => { documentObject.documentElement.dataset.motionPaused = String(documentObject.hidden); };
  documentObject.addEventListener("visibilitychange", sync);
  sync();
  return { disconnect() { documentObject.removeEventListener("visibilitychange", sync); } };
}
