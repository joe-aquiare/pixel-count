export function setupGridTransform({
  topOutBtn,
  topInBtn,
  bottomOutBtn,
  bottomInBtn,
  leftOutBtn,
  leftInBtn,
  rightOutBtn,
  rightInBtn,
  nudgeDecBtn,
  nudgeIncBtn,
  nudgeInput,
  viewport,
}) {
  const buttons = {
    topOut: topOutBtn,
    topIn: topInBtn,
    bottomOut: bottomOutBtn,
    bottomIn: bottomInBtn,
    leftOut: leftOutBtn,
    leftIn: leftInBtn,
    rightOut: rightOutBtn,
    rightIn: rightInBtn,
  };

  const clampNudge = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x < 0.01) return 0.01;
    return Math.round(x * 100) / 100;
  };
  const getNudge = () => clampNudge(nudgeInput.value);
  const applyNudge = (n) => {
    nudgeInput.value = String(clampNudge(n));
  };

  nudgeInput.addEventListener('change', () => applyNudge(nudgeInput.value));
  nudgeInput.addEventListener('blur', () => applyNudge(nudgeInput.value));
  nudgeDecBtn.addEventListener('click', () => applyNudge(Number(nudgeInput.value) - 0.1));
  nudgeIncBtn.addEventListener('click', () => applyNudge(Number(nudgeInput.value) + 0.1));
  applyNudge(nudgeInput.value);

  for (const [edge, btn] of Object.entries(buttons)) {
    btn.addEventListener('click', () => viewport.nudgeGridEdge(edge, getNudge()));
  }

  const setAvailable = (available) => {
    for (const btn of Object.values(buttons)) {
      btn.disabled = !available;
    }
  };
  setAvailable(false);

  return { setAvailable };
}
