import os
import re
from PIL import Image, ImageDraw

DIMENSION_PATTERN = re.compile(r'^(?:[Ø⌀RrMm]?\s*)?\d+(?:\.\d+)?(?:°|\s*[±+\-]\s*\d+(?:\.\d+)?)?$')


def page_count(src: str) -> int:
    ext = os.path.splitext(src)[1].lower()
    if ext == '.pdf':
        import fitz
        with fitz.open(src) as doc:
            return doc.page_count
    return 1


def render_page(src: str, out: str, page_index: int = 0) -> None:
    ext = os.path.splitext(src)[1].lower()
    if ext == '.pdf':
        import fitz
        with fitz.open(src) as doc:
            if not doc.page_count:
                raise RuntimeError('The PDF has no pages.')
            if page_index < 0 or page_index >= doc.page_count:
                raise RuntimeError('PDF page index is out of range.')
            page = doc[page_index]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            pix.save(out)
        return
    Image.open(src).convert('RGB').save(out)


def render_first_page(src: str, out: str) -> None:
    render_page(src, out, 0)


def _type_for(text: str) -> str:
    if 'Ø' in text or '⌀' in text:
        return 'DIA'
    if text.upper().startswith('R'):
        return 'RAD'
    if '°' in text:
        return 'ANG'
    if any(x in text for x in ('±', '+', '-')):
        return 'TOL'
    return 'DIM'


def detect_characteristics(image_path: str):
    try:
        import pytesseract
        from pytesseract import Output
        im = Image.open(image_path)
        data = pytesseract.image_to_data(im, output_type=Output.DICT, config='--psm 11')
        candidates = []
        for i, raw in enumerate(data['text']):
            text = raw.strip()
            try:
                confidence = float(data['conf'][i])
            except Exception:
                confidence = -1
            if not text or confidence < 30 or not DIMENSION_PATTERN.match(text):
                continue
            x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
            candidates.append((y, x, {
                'text': text,
                'target_x': x + w / 2,
                'target_y': y + h / 2,
                'type': _type_for(text),
            }))
        candidates.sort(key=lambda item: (item[0], item[1]))
        output = []
        for n, (_, __, c) in enumerate(candidates, 1):
            tx, ty = c['target_x'], c['target_y']
            output.append({
                'number': n,
                'text': c['text'],
                'type': c['type'],
                'x': tx + 36,
                'y': max(24, ty - 34),
                'target_x': tx,
                'target_y': ty,
            })
        return output
    except Exception:
        return []


def export_ballooned_pdf(src: str, out: str, balloons, page_index: int = 0) -> None:
    ext = os.path.splitext(src)[1].lower()
    if ext == '.pdf':
        import fitz
        source = fitz.open(src)
        if page_index < 0 or page_index >= source.page_count:
            source.close()
            raise RuntimeError('PDF page index is out of range.')
        output = fitz.open()
        output.insert_pdf(source, from_page=page_index, to_page=page_index)
        page = output[0]
        for b in balloons:
            # Preview is rendered at 2x PDF coordinates.
            x, y = float(b['x']) / 2, float(b['y']) / 2
            tx = float(b.get('target_x') if b.get('target_x') is not None else b['x']) / 2
            ty = float(b.get('target_y') if b.get('target_y') is not None else b['y']) / 2
            r = 10
            # Preserve each balloon's own adaptive leader length. The analyzer already
            # increases height only when needed, by no more than ~0.5 cm.
            import math
            page_rect = page.rect
            x = min(max(r + 2, x), page_rect.width - r - 2)
            y = min(max(r + 2, y), page_rect.height - r - 2)
            # Leave white clearance before the actual dimension/callout so neither
            # the leader nor arrowhead touches measurement text or dimension lines.
            dx, dy = tx-x, ty-y
            dist = math.hypot(dx, dy) or 1.0
            ux, uy = dx/dist, dy/dist
            start_gap = min(r + 1.5, max(0.0, dist / 3.0))
            target_gap = min(17.0, max(9.0, dist * 0.075))
            sx, sy = x + ux*start_gap, y + uy*start_gap
            ex, ey = tx - ux*target_gap, ty - uy*target_gap
            page.draw_line((sx, sy), (ex, ey), color=(0.04, 0.36, 0.23), width=1.05)
            # Arrowhead stops at the clearance endpoint, not on the measurement.
            ang = math.atan2(ey-sy, ex-sx)
            ah = 5.0
            p1 = (ex-ah*math.cos(ang-0.55), ey-ah*math.sin(ang-0.55))
            p2 = (ex-ah*math.cos(ang+0.55), ey-ah*math.sin(ang+0.55))
            page.draw_line((ex, ey), p1, color=(0.04,0.36,0.23), width=1.05)
            page.draw_line((ex, ey), p2, color=(0.04,0.36,0.23), width=1.05)
            page.draw_circle((x, y), r, color=(0.04, 0.36, 0.23), fill=(1, 1, 1), width=1.2)
            label = str(b['number'])
            width = fitz.get_text_length(label, fontsize=8)
            page.insert_text((x - width / 2, y + 2.8), label, fontsize=8, color=(0.04, 0.36, 0.23))
        output.save(out)
        output.close()
        source.close()
        return

    im = Image.open(src).convert('RGB')
    dr = ImageDraw.Draw(im)
    for b in balloons:
        x, y = float(b['x']), float(b['y'])
        tx = float(b.get('target_x') if b.get('target_x') is not None else x)
        ty = float(b.get('target_y') if b.get('target_y') is not None else y)
        r = 18
        import math
        dx,dy=tx-x,ty-y; dist=math.hypot(dx,dy) or 1.0; ux,uy=dx/dist,dy/dist
        start_gap=min(r+1,max(0.0,dist/3.0)); target_gap=min(34,max(18,dist*0.075))
        sx,sy=x+ux*start_gap,y+uy*start_gap; ex,ey=tx-ux*target_gap,ty-uy*target_gap
        dr.line((sx, sy, ex, ey), fill=(11,93,59), width=2)
        ang = math.atan2(ey-sy, ex-sx); ah = 9
        p1=(ex-ah*math.cos(ang-0.55),ey-ah*math.sin(ang-0.55)); p2=(ex-ah*math.cos(ang+0.55),ey-ah*math.sin(ang+0.55))
        dr.line((ex,ey,p1[0],p1[1]), fill=(11,93,59), width=2); dr.line((ex,ey,p2[0],p2[1]), fill=(11,93,59), width=2)
        dr.ellipse((x-r, y-r, x+r, y+r), fill='white', outline=(11,93,59), width=3)
        dr.text((x-5, y-7), str(b['number']), fill=(11,93,59))
    im.save(out, 'PDF', resolution=150)
