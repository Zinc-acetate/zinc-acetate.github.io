const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(pointer: fine)";

function matchesMedia(windowObject, query) {
  return Boolean(windowObject?.matchMedia?.(query).matches);
}

export function initRevealEffects({
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
} = {}) {
  const root = documentObject?.documentElement;
  const targets = [...(documentObject?.querySelectorAll?.("[data-reveal]") ?? [])];

  if (!root || !targets.length || root.dataset.revealEffects === "ready") {
    return { active: false, disconnect() {} };
  }

  root.dataset.revealEffects = "ready";
  targets.forEach((target, index) => {
    target.style.setProperty(
      "--reveal-order",
      target.dataset.revealDelay || String(Math.min(index % 5, 4)),
    );
  });

  const revealAll = () => {
    root.classList.remove("reveal-ready");
    targets.forEach((target) => target.classList.add("is-revealed"));
  };

  if (
    matchesMedia(windowObject, REDUCED_MOTION_QUERY) ||
    typeof windowObject?.IntersectionObserver !== "function"
  ) {
    revealAll();
    return { active: false, disconnect() {} };
  }

  root.classList.add("reveal-ready");
  const observer = new windowObject.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -7% 0px", threshold: 0.01 },
  );

  targets.forEach((target) => observer.observe(target));

  return {
    active: true,
    disconnect() {
      observer.disconnect();
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
  schedule();

  return {
    active: true,
    update,
    disconnect() {
      if (frame) windowObject.cancelAnimationFrame(frame);
      windowObject.removeEventListener("scroll", schedule);
      windowObject.removeEventListener("resize", schedule);
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

  return paths;
}

function pointAlongPath(points, progress) {
  const segments = [];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    total += length;
  }

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

  const context = canvas.getContext?.("2d");
  if (!context) return { active: false, refresh() {}, disconnect() {} };

  canvas.dataset.signalEffects = "ready";
  const reducedMotion = matchesMedia(windowObject, REDUCED_MOTION_QUERY);
  const finePointer = matchesMedia(windowObject, FINE_POINTER_QUERY);
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

  const readColors = () => {
    const style = windowObject.getComputedStyle(documentObject.documentElement);
    return {
      line: style.getPropertyValue("--signal-line").trim() || "rgba(0, 128, 140, 0.2)",
      node: style.getPropertyValue("--signal-node").trim() || "#008b94",
      pulse: style.getPropertyValue("--signal-pulse").trim() || "#97d92f",
      label: style.getPropertyValue("--signal-label").trim() || "rgba(0, 80, 84, 0.52)",
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

    paths.forEach((path, index) => {
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
      const pulse = pointAlongPath(path, progress);
      context.fillStyle = colors.pulse;
      context.fillRect(pulse.x - 3, pulse.y - 3, 6, 6);
    });

    context.fillStyle = colors.label;
    context.font = '10px "Cascadia Code", Consolas, monospace';
    context.fillText("GRAPH / FLOW", Math.max(18, width * 0.055), Math.max(22, height * 0.13));
    context.fillText("O(log n)", Math.max(18, width * 0.78), Math.max(42, height * 0.84));
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
    draw(windowObject.performance?.now?.() || 0);
  };

  const syncAnimation = () => {
    if (reducedMotion || frame || !isVisible || documentObject.hidden) return;
    frame = windowObject.requestAnimationFrame((time) => {
      frame = 0;
      pointerX += (targetPointerX - pointerX) * 0.07;
      pointerY += (targetPointerY - pointerY) * 0.07;
      draw(time);
      syncAnimation();
    });
  };

  const stopAnimation = () => {
    if (!frame) return;
    windowObject.cancelAnimationFrame(frame);
    frame = 0;
  };

  const handleVisibility = () => {
    if (documentObject.hidden) stopAnimation();
    else syncAnimation();
  };

  const handlePointerMove = (event) => {
    const bounds = host.getBoundingClientRect();
    targetPointerX = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
    targetPointerY = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2;
  };

  const handlePointerLeave = () => {
    targetPointerX = 0;
    targetPointerY = 0;
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
  if (finePointer && !reducedMotion) {
    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  }

  resize();
  syncAnimation();

  return {
    active: !reducedMotion,
    refresh() {
      colors = undefined;
      resize();
    },
    disconnect() {
      stopAnimation();
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      windowObject.removeEventListener("resize", resize);
      documentObject.removeEventListener("visibilitychange", handleVisibility);
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
    },
  };
}

export function initPointerDepth({
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
} = {}) {
  const targets = [...(documentObject?.querySelectorAll?.("[data-pointer-depth]") ?? [])];
  if (
    !targets.length ||
    matchesMedia(windowObject, REDUCED_MOTION_QUERY) ||
    !matchesMedia(windowObject, FINE_POINTER_QUERY)
  ) {
    return { active: false, disconnect() {} };
  }

  const cleanups = [];
  targets.forEach((target) => {
    if (target.dataset.pointerDepthEffects === "ready") return;
    target.dataset.pointerDepthEffects = "ready";
    target.classList.add("pointer-depth-ready");
    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const render = () => {
      frame = 0;
      target.style.setProperty("--depth-x", `${nextX.toFixed(3)}deg`);
      target.style.setProperty("--depth-y", `${nextY.toFixed(3)}deg`);
    };

    const handleMove = (event) => {
      const bounds = target.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
      const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2;
      nextX = y * -1.35;
      nextY = x * 1.35;
      if (!frame) frame = windowObject.requestAnimationFrame(render);
    };

    const reset = () => {
      nextX = 0;
      nextY = 0;
      if (!frame) frame = windowObject.requestAnimationFrame(render);
    };

    target.addEventListener("pointermove", handleMove, { passive: true });
    target.addEventListener("pointerleave", reset, { passive: true });
    target.addEventListener("pointercancel", reset, { passive: true });
    cleanups.push(() => {
      if (frame) windowObject.cancelAnimationFrame(frame);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerleave", reset);
      target.removeEventListener("pointercancel", reset);
    });
  });

  return {
    active: cleanups.length > 0,
    disconnect() {
      cleanups.forEach((cleanup) => cleanup());
    },
  };
}
