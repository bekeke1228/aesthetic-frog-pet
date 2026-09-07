#!/usr/bin/env python3
"""审美吉蛙桌宠 - 素材抠图管线

从 assets/raw 读取原始吉蛙图，自动去底（白底/灰块/阴影），输出：
- assets/sprites/<state>/frame-N.png  透明 PNG 精灵帧（320x320 画布）
- assets/manifest.json                帧表 + 播放速率
- assets/tray.png                     托盘图标（32x32）
- assets/contact_sheet.png            拼接检查图（棋盘格底，供目检）
"""

import json
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "assets", "raw")
SPRITE_DIR = os.path.join(ROOT, "assets", "sprites")
MANIFEST_PATH = os.path.join(ROOT, "assets", "manifest.json")
TRAY_PATH = os.path.join(ROOT, "assets", "tray.png")
SHEET_PATH = os.path.join(ROOT, "assets", "contact_sheet.png")
ICON_DIR = os.path.join(ROOT, "assets", "icons")

STATES = ["idle", "sleep", "click", "drag", "celebrate", "talk"]
STATE_FPS = {"idle": 2, "sleep": 1, "click": 6, "drag": 6, "celebrate": 6, "talk": 4}
# 所有状态都是静态帧：不自动轮换，只在互动/事件触发时换姿势
STATE_STATIC = {"idle": True, "sleep": True, "click": True, "drag": True, "celebrate": True, "talk": True}
OUT_SIZE = 320
CONTENT_MAX = 300
PROCESS_MAX = 512
K_CLUSTERS = 4
BG_TOL = 70


def load_raw_frames(state):
    """返回按序号排序的原始图路径列表。"""
    pattern = re.compile(r"^" + re.escape(state) + r"_(\d+)\.png$", re.IGNORECASE)
    found = []
    if os.path.isdir(RAW_DIR):
        for name in os.listdir(RAW_DIR):
            m = pattern.match(name)
            if m:
                found.append((int(m.group(1)), os.path.join(RAW_DIR, name)))
    found.sort(key=lambda t: t[0])
    return [p for _, p in found]


def kmeans_init(samples, k):
    """k-means++ 初始化。samples: (n,3) float32。"""
    n = samples.shape[0]
    rng = np.random.default_rng()
    centers = [samples[rng.integers(n)]]
    for _ in range(k - 1):
        dists = np.min(
            np.linalg.norm(samples[:, None, :] - np.asarray(centers)[None, :, :], axis=2),
            axis=1,
        )
        probs = dists ** 2
        total = probs.sum()
        if total <= 0:
            probs = np.full(n, 1.0 / n)
        else:
            probs = probs / total
        centers.append(samples[rng.choice(n, p=probs)])
    return np.asarray(centers, dtype=np.float32)


def background_centers(rgb):
    """从边缘采样并聚类，返回背景色中心。rgb: (H,W,3) uint8。"""
    h, w, _ = rgb.shape
    ring = 4
    ys, xs = np.mgrid[0:h, 0:w]
    border = (
        (xs < ring) | (ys < ring) | (xs >= w - ring) | (ys >= h - ring)
    )
    samples = rgb[border].astype(np.float32)
    if samples.shape[0] > 8000:
        idx = np.random.choice(samples.shape[0], 8000, replace=False)
        samples = samples[idx]
    centers = kmeans_init(samples, K_CLUSTERS)
    for _ in range(15):
        dists = np.linalg.norm(
            samples[:, None, :] - centers[None, :, :], axis=2
        )
        labels = dists.argmin(axis=1)
        new_centers = []
        for c in range(K_CLUSTERS):
            members = samples[labels == c]
            if members.shape[0]:
                new_centers.append(members.mean(axis=0))
        if not new_centers:
            break
        centers = np.asarray(new_centers, dtype=np.float32)
        # 去掉过近的重复中心
        dedup = []
        for c in centers:
            if all(np.linalg.norm(c - d) > 24 for d in dedup):
                dedup.append(c)
        centers = np.asarray(dedup, dtype=np.float32) if dedup else centers
    return centers


def candidate_bg_mask(rgb, centers, tol=BG_TOL):
    """像素与任一背景中心的欧氏距离 <= tol 则为候选背景。"""
    img = rgb.astype(np.float32)
    dists = np.linalg.norm(img[:, :, None, :] - centers[None, None, :, :], axis=3)
    near_bg = dists.min(axis=2) <= tol
    # 饱和度约束：只有低饱和（灰白/阴影）像素才可能是背景，
    # 防止荧光绿蛙身贴边时被误判为背景色。
    r, g, b = rgb[..., 0].astype(np.int16), rgb[..., 1].astype(np.int16), rgb[..., 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat_ok = (mx - mn) < 42
    return near_bg & sat_ok


def border_connected(mask):
    """只保留 4 连通到图像边缘的背景像素。mask: (H,W) bool。"""
    h, w = mask.shape
    seen = bytearray(h * w)
    out = bytearray(h * w)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mask[y, x]:
                q.append((x, y))
                seen[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if mask[y, x]:
                q.append((x, y))
                seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        out[y * w + x] = 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and mask[ny, nx]:
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return np.frombuffer(out, dtype=np.uint8).reshape(h, w).astype(bool)


def cutout(path):
    """返回 RGBA 图像（透明背景）。

    若原图自带 alpha（用户已手工抠图），直接保留原透明度；
    否则走自动去底管线。
    """
    src = Image.open(path)
    src.load()
    has_alpha = src.mode in ("RGBA", "LA") or (
        src.mode == "P" and "transparency" in src.info
    )
    if has_alpha:
        rgba = src.convert("RGBA")
        rgba.thumbnail((PROCESS_MAX, PROCESS_MAX), Image.LANCZOS)
        return rgba

    im = src.convert("RGB")
    im.thumbnail((PROCESS_MAX, PROCESS_MAX), Image.LANCZOS)
    rgb = np.asarray(im)
    centers = background_centers(rgb)
    cand = candidate_bg_mask(rgb, centers)
    bg = border_connected(cand)
    fg = ~bg
    alpha = (fg * 255).astype(np.uint8)
    alpha_im = Image.fromarray(alpha, "L")
    # 向内收 1px，去掉残留白边
    alpha_im = alpha_im.filter(ImageFilter.MinFilter(3))
    # 1px 羽化
    alpha_im = alpha_im.filter(ImageFilter.GaussianBlur(1.0))
    alpha = np.asarray(alpha_im).astype(np.float32) / 255.0
    rgba = np.dstack([rgb.astype(np.float32), alpha * 255.0])
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def compose_frame(rgba):
    """裁剪内容 -> 缩放 -> 居中(水平)/贴底，输出 320x320 画布。"""
    alpha = np.asarray(rgba)[:, :, 3]
    ys, xs = np.nonzero(alpha > 4)
    if ys.size == 0:
        return Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    crop = rgba.crop((x0, y0, x1, y1))
    w, h = crop.size
    scale = min(CONTENT_MAX / w, CONTENT_MAX / h, 1.0)
    if scale < 1.0:
        crop = crop.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    cw, ch = crop.size
    canvas.paste(crop, ((OUT_SIZE - cw) // 2, OUT_SIZE - ch), crop)
    return canvas


def build_contact_sheet(frames_by_state):
    """生成棋盘格检查图。frames_by_state: {state: [PIL RGBA]}"""
    cell = 180
    cols = len(STATES)
    rows = max((len(frames_by_state[s]) for s in STATES), default=1)
    sheet = Image.new("RGB", (cols * cell, rows * cell + 28), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for c, state in enumerate(STATES):
        draw.text((c * cell + 8, 6), state, fill=(60, 60, 60))
        for r in range(rows):
            x0, y0 = c * cell, r * cell + 28
            checker = Image.new("RGB", (cell, cell), (220, 220, 220))
            d2 = ImageDraw.Draw(checker)
            sq = cell // 8
            for i in range(8):
                for j in range(8):
                    if (i + j) % 2 == 0:
                        d2.rectangle([i * sq, j * sq, i * sq + sq, j * sq + sq], fill=(245, 245, 245))
            frames = frames_by_state[state]
            if r < len(frames):
                thumb = Image.open(frames[r]).convert("RGBA")
                thumb.load()
                thumb.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
                checker.paste(thumb, ((cell - thumb.width) // 2, (cell - thumb.height) // 2), thumb)
            sheet.paste(checker, (x0, y0))
    return sheet


def build_icons(frames_by_state):
    """从每个形态第一帧裁出完整吉蛙（缩放居中，96x96），供面板头像/图标使用。"""
    os.makedirs(ICON_DIR, exist_ok=True)
    SIZE = 96
    for state, frames in frames_by_state.items():
        if not frames:
            continue
        im = Image.open(frames[0]).convert("RGBA")
        alpha = np.asarray(im)[:, :, 3]
        ys, xs = np.nonzero(alpha > 4)
        if ys.size == 0:
            continue
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        crop = im.crop((x0, y0, x1, y1))
        cw, ch = crop.size
        scale = min((SIZE - 10) / cw, (SIZE - 10) / ch)
        crop = crop.resize(
            (max(1, round(cw * scale)), max(1, round(ch * scale))), Image.LANCZOS
        )
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(crop, ((SIZE - crop.width) // 2, (SIZE - crop.height) // 2), crop)
        out = os.path.join(ICON_DIR, f"{state}.png")
        canvas.save(out)
        print("icon ->", os.path.relpath(out, ROOT))


def main():
    os.makedirs(SPRITE_DIR, exist_ok=True)
    manifest = {"frameSize": OUT_SIZE, "states": {}}
    frames_by_state = {}
    warnings = []
    for state in STATES:
        paths = load_raw_frames(state)
        if not paths:
            warnings.append(f"缺少状态素材: {state}")
            manifest["states"][state] = {
                "frames": [],
                "fps": STATE_FPS[state],
                "static": STATE_STATIC[state],
            }
            frames_by_state[state] = []
            continue
        state_dir = os.path.join(SPRITE_DIR, state)
        os.makedirs(state_dir, exist_ok=True)
        frames = []
        for i, path in enumerate(paths, start=1):
            rgba = cutout(path)
            frame = compose_frame(rgba)
            out = os.path.join(state_dir, f"frame-{i}.png")
            frame.save(out)
            frames.append(out)
            alpha = np.asarray(frame)[:, :, 3]
            cov = (alpha > 4).mean()
            ys, xs = np.nonzero(alpha > 4)
            bbox = (xs.min(), ys.min(), xs.max(), ys.max()) if ys.size else None
            rel = os.path.relpath(out, ROOT).replace("\\", "/")
            print(f"{state} frame-{i}: {rel} coverage={cov:.1%} bbox={bbox}")
            if cov < 0.05 or cov > 0.985:
                warnings.append(f"{state} frame-{i} 覆盖率异常: {cov:.1%}")
        frames_by_state[state] = frames
        manifest["states"][state] = {
            "frames": [os.path.relpath(f, ROOT).replace("\\", "/") for f in frames],
            "fps": STATE_FPS[state],
            "static": STATE_STATIC[state],
        }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    # 托盘图标：取 idle 第一帧内容
    tray_src = None
    if frames_by_state.get("idle"):
        tray_src = Image.open(frames_by_state["idle"][0])
        alpha = tray_src.split()[3]
        tray_src = tray_src.crop(alpha.getbbox())
        tray_src.thumbnail((32, 32), Image.LANCZOS)
    else:
        tray_src = Image.new("RGBA", (32, 32), (123, 255, 60, 255))
    tray_src.save(TRAY_PATH)

    sheet = build_contact_sheet(frames_by_state)
    sheet.save(SHEET_PATH)
    build_icons(frames_by_state)

    print("manifest ->", os.path.relpath(MANIFEST_PATH, ROOT))
    print("tray    ->", os.path.relpath(TRAY_PATH, ROOT))
    print("sheet   ->", os.path.relpath(SHEET_PATH, ROOT))
    if warnings:
        print("警告:")
        for w in warnings:
            print("  -", w)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
