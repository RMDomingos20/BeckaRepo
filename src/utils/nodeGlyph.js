// Geometry encodes connectivity even when file types have similar colors.
export function paintNode(ctx, mark, degree, fill, outline, active) {
  const { x, y, node, radius } = mark;
  ctx.beginPath();
  if (node?.isFolder) {
    ctx.rect(x - 6, y - 6, 12, 12);
  } else if (node && degree >= 8) {
    const size = radius + 2;
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
  }
  const hollow = node && !node.isFolder && !degree && !active && !node.isMatch;
  ctx.fillStyle = fill;
  if (!hollow) ctx.fill();
  ctx.strokeStyle = hollow ? fill : outline;
  ctx.lineWidth = active ? 2.5 : 1;
  ctx.stroke();
  if (active && !node.isFolder) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
