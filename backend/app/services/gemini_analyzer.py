import json
import os
import tempfile
import re
import time
from io import BytesIO
from typing import List, Literal, Optional

from PIL import Image
from pydantic import BaseModel, Field


class GeminiCharacteristic(BaseModel):
    text: str = Field(description='Exact visible engineering characteristic text, e.g. Ø10, R5, 100 ±0.2, M8 THRU')
    type: Literal['DIM', 'DIA', 'RAD', 'ANG', 'TOL', 'HOLE', 'THREAD', 'GD&T', 'SURFACE', 'DATUM', 'OTHER']
    center_x: float = Field(description='Horizontal center normalized from 0 to 1000')
    center_y: float = Field(description='Vertical center normalized from 0 to 1000')
    confidence: float = Field(description='Confidence from 0.0 to 1.0')
    description: Optional[str] = Field(default=None, description='Concise feature description from visible drawing context, e.g. Overall length, Hole diameter, Thread callout. Do not guess.')


class GeminiDrawingAnalysis(BaseModel):
    drawing_number: Optional[str] = None
    part_name: Optional[str] = None
    customer: Optional[str] = None
    company_name: Optional[str] = None
    material: Optional[str] = None
    scale: Optional[str] = None
    sheet_number: Optional[str] = None
    project_name: Optional[str] = None
    po_number: Optional[str] = None
    drawn_by: Optional[str] = None
    checked_by: Optional[str] = None
    approved_by: Optional[str] = None
    revision: Optional[str] = None
    drawing_date: Optional[str] = None
    quantity: Optional[str] = None
    characteristics: List[GeminiCharacteristic]


class BatchDrawingAnalysis(BaseModel):
    drawing_index: int = Field(description='1-based drawing index matching the supplied DRAWING label')
    drawing_number: Optional[str] = None
    part_name: Optional[str] = None
    customer: Optional[str] = None
    company_name: Optional[str] = None
    material: Optional[str] = None
    scale: Optional[str] = None
    sheet_number: Optional[str] = None
    project_name: Optional[str] = None
    po_number: Optional[str] = None
    drawn_by: Optional[str] = None
    checked_by: Optional[str] = None
    approved_by: Optional[str] = None
    revision: Optional[str] = None
    drawing_date: Optional[str] = None
    quantity: Optional[str] = None
    characteristics: List[GeminiCharacteristic]


class GeminiBatchAnalysis(BaseModel):
    drawings: List[BatchDrawingAnalysis]


BASE_PROMPT = '''
You are an expert mechanical drawing inspection assistant.
Analyze each supplied engineering drawing independently and identify ALL characteristics that an inspector would normally balloon for dimensional inspection.

For every drawing, also read as many clearly visible title-block fields as possible: drawing_number, part_name/title, customer, company_name (manufacturer/supplier/company printed in the title block), revision, drawing_date, quantity, material, scale, sheet_number, project_name, po_number/order number, drawn_by, checked_by, and approved_by. Customer should be the customer/client/company for whom the part is made when that is explicitly labelled; if only one relevant company name is visible and no separate customer is labelled, return it in company_name and customer may be null. Return drawing_date as YYYY-MM-DD when the date is clearly readable. Preserve quantity text such as '2 NOS'. Do not confuse revision, sheet number, date, or BOM item number with drawing_number. If a field is not clearly visible, return null rather than guessing.

Include when visibly present:
- linear dimensions, INCLUDING plain numeric dimensions such as 10, 25, 64, 100, 1363.4 when the number is visibly attached to a dimension line / extension lines / dimension arrowheads
- diameter dimensions (Ø / ⌀)
- radius dimensions (R), including R2, R5, R10, R15 and similar radius callouts
- angular dimensions
- explicit tolerances and limit dimensions
- hole callouts, counterbore/countersink/depth callouts
- thread callouts
- GD&T feature-control-frame characteristics
- datum feature identifiers when inspection-relevant
- surface-finish requirements

Do NOT create characteristics from drawing number, revision, sheet number, scale, dates, quantities, material names, company/title-block administrative text, BOM item numbers, random standalone digits, or duplicate text belonging to the same characteristic. IMPORTANT: a plain number by itself IS a valid characteristic when it is visibly the value of a dimension and is connected to or centered on a dimension line, extension lines, or dimension arrowheads. Examples: 10, 16, 24, 50, 64, 100. Do not confuse those dimensional values with item numbers, zone numbers, view labels, sheet numbers, or title-block values.

For each characteristic also return a short description based only on visible nearby feature context (for example Overall length, Hole diameter, Radius, Thread callout). If the feature name is not visible or inferable without guessing, use a generic type-based description. Return its exact visible text and a balloon target in normalized coordinates where x=0 is left, x=1000 is right, y=0 is top, y=1000 is bottom. For balloon placement, use CIRCLE-ONLY ballooning: there must be NO leader line and NO arrow. Return a target point that is the CENTER of the numbered balloon circle. The circle must sit only in EMPTY WHITE SPACE beside the reading, above the reading, or below the reading. STRICTLY NEVER place the circle over or touching any digit, decimal point, tolerance, diameter/radius symbol, GD&T text, note, word, dimension line, extension line, feature outline, centerline, or other drawing stroke. Keep a visible white safety gap around the entire circle edge. For a normal 18 px radius preview balloon, leave at least about 7-10 px of additional white clearance, so the nearest drawing/text pixel is roughly 25-28 px or more from the circle center. Prefer a clear position directly above the reading; if the top is occupied, try the nearest clear right/left side; if those are occupied, use a clear position below. Never squeeze a circle between characters or between a reading and a line. Keep each circle visually associated with its own measurement and avoid collisions with other balloon circles. Return each real characteristic once.
- Exclude general notes, welding/process instructions, BOM rows, part labels, view labels, section labels, zone coordinates, page borders, title blocks and revision tables unless the text itself is an inspection characteristic.
- Plain numeric readings ARE characteristics when they clearly represent a dimension on the drawing (for example 10, 16, 24, 50, 64, 100 beside/between dimension arrows or extension lines).
- Radius callouts beginning with R are always inspection characteristics when visibly attached to a radius/arc leader (for example R2, R5, R10, R15).
- Standalone numbers that do NOT represent a dimension/callout are NOT characteristics.
- For every plain numeric candidate, inspect the nearby linework before including it: include only when the number clearly belongs to a dimension line / extension line / arrowhead pair.
- When uncertain whether a plain number is a dimension or a label/item number, omit it. Precision is more important than recall.

Prefer precision over guessing.
'''


def _learning_path() -> str:
    # Keep reviewer-learning writes on writable runtime storage in serverless deployments.
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    default_data = os.path.join(backend_dir, 'data')
    if os.getenv('VERCEL') or os.path.abspath(os.getcwd()).startswith('/var/task'):
        default_data = os.path.join(tempfile.gettempdir(), 'ballooning_data')
    data_dir = os.path.abspath(os.getenv('BALLOONING_DATA_DIR', default_data))
    learning_dir = os.path.join(data_dir, 'learning')
    os.makedirs(learning_dir, exist_ok=True)
    return os.path.join(learning_dir, 'corrections.jsonl')


def _learning_context(limit: int = 8) -> str:
    path = _learning_path()
    if not os.path.exists(path):
        return ''
    records = []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))
    except Exception:
        return ''
    lines = ['\nReviewer correction memory. Use only as guidance; never invent content not visible in the current drawing:']
    for r in records[-limit:]:
        if r.get('removed_texts'):
            lines.append('- Avoid false positives similar to: ' + ', '.join(r['removed_texts'][:8]))
        if r.get('added_texts'):
            lines.append('- Previously missed characteristics included: ' + ', '.join(r['added_texts'][:8]))
        if r.get('edited_texts'):
            lines.append('- Text corrections included: ' + '; '.join(r['edited_texts'][:8]))
    return '\n'.join(lines) if len(lines) > 1 else ''


def _ink_count_in_circle(gray: Image.Image, cx: float, cy: float, radius: int = 27, threshold: int = 236) -> int:
    """Count non-white drawing pixels inside the balloon + safety-clearance disk."""
    w, h = gray.size
    left = max(0, int(round(cx - radius)))
    top = max(0, int(round(cy - radius)))
    right = min(w, int(round(cx + radius + 1)))
    bottom = min(h, int(round(cy + radius + 1)))
    if right <= left or bottom <= top:
        return 10**9
    crop = gray.crop((left, top, right, bottom))
    pixels = crop.load()
    r2 = radius * radius
    count = 0
    for yy in range(crop.height):
        py = top + yy
        dy = py - cy
        for xx in range(crop.width):
            px = left + xx
            dx = px - cx
            if dx * dx + dy * dy <= r2 and pixels[xx, yy] < threshold:
                count += 1
    return count


def _balloon_offset(tx: float, ty: float, width: int, height: int,
                    occupied: list[tuple[float, float]], gray: Image.Image | None = None) -> tuple[float, float]:
    """Place a circle-only balloon in verified blank space near its measurement.

    Preference order is above -> side -> below.  The full circle plus a safety
    halo is checked against actual dark pixels from the drawing so the circle
    cannot sit on top of readings or CAD linework.
    """
    circle_radius = 18.0
    white_gap = 9.0
    safe_radius = int(round(circle_radius + white_gap))
    margin = safe_radius + 3.0
    base_x = min(max(margin, tx), max(margin, width - margin))
    base_y = min(max(margin, ty), max(margin, height - margin))

    # Search close to the model proposal but keep a real blank-space halo.
    # Top is preferred, then right/left, then bottom. Larger offsets are only
    # used if the closer position contains text or drawing strokes.
    dists = (0, 28, 34, 40, 46, 54, 62)
    offsets = [(0, 0)]
    offsets += [(0, -d) for d in dists[1:]]
    offsets += [(d, 0) for d in dists[1:]] + [(-d, 0) for d in dists[1:]]
    offsets += [(0, d) for d in dists[1:]]
    offsets += [(d, -d) for d in (30, 38, 46)] + [(-d, -d) for d in (30, 38, 46)]
    offsets += [(d, d) for d in (30, 38, 46)] + [(-d, d) for d in (30, 38, 46)]

    candidates = []
    for order, (ox, oy) in enumerate(offsets):
        x = min(max(margin, base_x + ox), max(margin, width - margin))
        y = min(max(margin, base_y + oy), max(margin, height - margin))
        collision = sum(1 for px, py in occupied if (x-px)**2 + (y-py)**2 < (2*circle_radius + 10)**2)
        ink = _ink_count_in_circle(gray, x, y, safe_radius) if gray is not None else 0
        # Any dark pixel inside the safety disk is heavily penalized. Among
        # equally clean locations, preserve the preferred top/side/bottom order.
        score = ink * 100000 + collision * 10000000 + order * 10 + abs(ox) + abs(oy)
        candidates.append((score, ink, collision, x, y))

    candidates.sort(key=lambda item: item[0])
    return candidates[0][3], candidates[0][4]


def _prepare_image(path: str):
    with Image.open(path) as source:
        source.load(); width,height=source.size
        max_dim=max(1200,min(int(os.getenv('GEMINI_ANALYSIS_MAX_DIM','1600')),3000))
        img=source.convert('RGB')
        if max(img.size)>max_dim:
            img.thumbnail((max_dim,max_dim),Image.Resampling.LANCZOS)
        buf=BytesIO(); img.save(buf,format='JPEG',quality=80,optimize=True)
        return buf.getvalue(), width, height


def _retry_after_seconds(exc: Exception) -> int:
    text=str(exc)
    patterns=[r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+)s", r'retry in\s+([0-9.]+)s', r'retry after\s+([0-9.]+)']
    for p in patterns:
        m=re.search(p,text,re.I)
        if m:
            return max(1,min(120,int(float(m.group(1)))+1))
    return 0


def _call_model(client_configs, contents, schema):
    """Try model fallbacks on each configured API key, then move to the next key.

    API-key fallback is useful only when the keys belong to projects with independent
    quotas. Real key values are never included in returned errors or logs here.
    """
    from google.genai import types
    last_error = None
    max_retries = max(0, min(int(os.getenv('ANALYSIS_TRANSIENT_RETRIES', '1')), 2))
    for key_label, client, models in client_configs:
        for model in models:
            for attempt in range(max_retries + 1):
                try:
                    response = client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            response_mime_type='application/json',
                            response_schema=schema,
                        ),
                    )
                    if response.text:
                        return response.text, model, key_label
                    last_error = RuntimeError('Analysis service returned an empty response')
                except Exception as exc:
                    last_error = exc
                    text = str(exc)
                    retry = _retry_after_seconds(exc)
                    daily_quota = ('GenerateRequestsPerDay' in text or 'free_tier_requests' in text or 'PerDayPerProject' in text)
                    is_transient = ('503' in text or 'UNAVAILABLE' in text or ('429' in text and retry > 0 and not daily_quota))
                    if is_transient and attempt < max_retries:
                        time.sleep(min(retry or (2 if attempt == 0 else 5), 60))
                        continue
                    # For quota, auth, model availability, or final transient failure,
                    # move on to the next model/key instead of stopping the whole set.
                    break
    raise RuntimeError(str(last_error) if last_error else 'Analysis service failed')

def _looks_like_inspection_characteristic(c) -> bool:
    text=(c.text or '').strip()
    if not text:
        return False
    upper=text.upper()
    admin_terms=('DRAWING NO','DRAWING NUMBER','DWG NO','REV','REVISION','SHEET','SCALE','DATE','QTY','QUANTITY','MATERIAL','DRAWN BY','CHECKED BY','APPROVED BY','CUSTOMER','PROJECT','PO NO','PART NAME','TITLE')
    if any(term in upper for term in admin_terms):
        return False
    ctype=str(getattr(c,'type','OTHER')).upper()
    # Plain numeric readings (e.g. 10, 24, 64, 100) are legitimate drawing
    # dimensions when the vision model explicitly classifies them as dimensional.
    # Still reject bare numeric text for non-dimensional types to avoid ballooning
    # item numbers, zones, sheet numbers, and other administrative labels.
    if re.fullmatch(r'[A-Z]?\s*\d+(?:\.\d+)?[A-Z]?', upper):
        if ctype not in {'DIM','TOL','DIA','RAD','ANG'}:
            return False
    if ctype in {'GD&T','SURFACE','DATUM','THREAD','HOLE'}:
        return True
    # Dimension-like text must visibly carry numeric/symbolic dimensional content.
    has_number=bool(re.search(r'\d', text))
    has_dim_symbol=bool(re.search(r'[Ø⌀±°]|\bR\s*\d|\bM\s*\d|\bTHRU\b|\bDEPTH\b|\bTYP\b|\bMAX\b|\bMIN\b', upper))
    has_tolerance=bool(re.search(r'[+\-]\s*\d|\d\s*[-–]\s*\d', text))
    return has_number and (ctype in {'DIM','DIA','RAD','ANG','TOL'} or has_dim_symbol or has_tolerance)

def _snap_target_to_line(image_path: str, tx: float, ty: float) -> tuple[float, float]:
    """Snap an AI target away from glyphs and onto a nearby straight drawing line.

    Engineering dimension/extension/leader lines have long, straight dark runs. Text
    strokes are short and irregular. We search only a small neighborhood around the
    model-provided target and prefer pixels supported by a straight run, so the
    target coordinate identifies the correct engineering line, while the renderer leaves a small visual gap before that line and never covers a measurement character.
    """
    try:
        with Image.open(image_path) as src:
            gray = src.convert('L')
            w, h = gray.size
            px = gray.load()
            cx = int(round(max(0, min(w - 1, tx))))
            cy = int(round(max(0, min(h - 1, ty))))
            radius = max(24, min(52, int(round(min(w, h) * 0.025))))
            # Slightly generous threshold catches anti-aliased CAD lines.
            threshold = 205
            directions = ((1,0),(0,1),(1,1),(1,-1))

            def run_support(x, y, dx, dy, half=20):
                dark = 0
                longest = cur = 0
                for k in range(-half, half + 1):
                    xx, yy = x + dx*k, y + dy*k
                    if 0 <= xx < w and 0 <= yy < h and px[xx, yy] < threshold:
                        dark += 1; cur += 1; longest = max(longest, cur)
                    else:
                        cur = 0
                return dark, longest

            best = None
            step = 1 if radius <= 36 else 2
            for y in range(max(1, cy-radius), min(h-1, cy+radius+1), step):
                for x in range(max(1, cx-radius), min(w-1, cx+radius+1), step):
                    if px[x, y] >= threshold:
                        continue
                    d2 = (x-cx)*(x-cx) + (y-cy)*(y-cy)
                    if d2 > radius*radius:
                        continue
                    line_strength = 0
                    longest = 0
                    for dx,dy in directions:
                        dark, run = run_support(x,y,dx,dy)
                        line_strength = max(line_strength, dark)
                        longest = max(longest, run)
                    # Require a genuinely line-like run. This rejects most glyph strokes.
                    if longest < 10 and line_strength < 15:
                        continue
                    dist = d2 ** 0.5
                    score = longest * 3.2 + line_strength * 0.8 - dist * 0.55
                    if best is None or score > best[0]:
                        best = (score, float(x), float(y))
            return (best[1], best[2]) if best else (tx, ty)
    except Exception:
        return tx, ty


def _to_output(parsed, width:int, height:int, image_path: str | None = None):
    min_conf=max(0.55,min(float(os.getenv('GEMINI_MIN_CONFIDENCE','0.68')),0.95))
    detected=[c for c in parsed.characteristics if c.confidence>=min_conf and _looks_like_inspection_characteristic(c)]
    detected.sort(key=lambda c:(c.center_y,c.center_x))
    output=[]; occupied=[]; seen=set()
    gray = None
    if image_path and os.path.exists(image_path):
        try:
            with Image.open(image_path) as src:
                gray = src.convert('L').copy()
        except Exception:
            gray = None
    for c in detected:
        nx=min(1000,max(0,float(c.center_x))); ny=min(1000,max(0,float(c.center_y)))
        tx=nx/1000*width; ty=ny/1000*height
        # The model proposes a nearby clear circle center. A deterministic
        # pixel-level safety scan below chooses the nearest truly blank location
        # (top, side, or bottom) so the circle cannot touch the reading/linework.
        dedupe=(c.text.strip().upper(),round(tx/18),round(ty/18))
        if dedupe in seen: continue
        seen.add(dedupe)
        x,y=_balloon_offset(tx,ty,width,height,occupied,gray); occupied.append((x,y))
        output.append({'number':len(output)+1,'text':c.text.strip(),'type':c.type,'x':x,'y':y,'target_x':tx,'target_y':ty,'confidence':c.confidence,'description':(c.description or '').strip(),'source':'analysis'})
    return output


def _client_configs():
    from google import genai
    keys = []
    for env_name, label in (
        ('GEMINI_API_KEY', 'primary'),
        ('GEMINI_API_KEY_FALLBACK', 'fallback-1'),
        ('GEMINI_API_KEY_FALLBACK_2', 'fallback-2'),
        ('GOOGLE_API_KEY', 'google-key'),
    ):
        value = (os.getenv(env_name) or '').strip()
        if value and value not in [k for _, k in keys]:
            keys.append((label, value))
    if not keys:
        raise RuntimeError('Analysis API key is not configured')

    primary = (os.getenv('GEMINI_MODEL') or 'gemini-3.5-flash-lite').strip()
    fallbacks = [m.strip() for m in os.getenv('GEMINI_FALLBACK_MODELS', 'gemini-3.7-flash').split(',') if m.strip()]
    models = [primary] + [m for m in fallbacks if m != primary]
    return [(label, genai.Client(api_key=key), models) for label, key in keys]

def analyze_with_gemini(image_path: str) -> dict:
    from google.genai import types
    client_configs=_client_configs(); data,width,height=_prepare_image(image_path)
    contents=[types.Part.from_bytes(data=data,mime_type='image/jpeg'), BASE_PROMPT]
    text,used_model,used_key=_call_model(client_configs,contents,GeminiDrawingAnalysis)
    parsed=GeminiDrawingAnalysis.model_validate_json(text)
    return {'drawing_number':(parsed.drawing_number or '').strip() or None,'part_name':(parsed.part_name or '').strip() or None,'customer':(parsed.customer or '').strip() or None,'company_name':(parsed.company_name or '').strip() or None,'material':(parsed.material or '').strip() or None,'scale':(parsed.scale or '').strip() or None,'sheet_number':(parsed.sheet_number or '').strip() or None,'project_name':(parsed.project_name or '').strip() or None,'po_number':(parsed.po_number or '').strip() or None,'drawn_by':(parsed.drawn_by or '').strip() or None,'checked_by':(parsed.checked_by or '').strip() or None,'approved_by':(parsed.approved_by or '').strip() or None,'revision':(parsed.revision or '').strip() or None,'drawing_date':(parsed.drawing_date or '').strip() or None,'quantity':(parsed.quantity or '').strip() or None,'characteristics':_to_output(parsed,width,height,image_path),'model':used_model,'api_key_slot':used_key}


def analyze_batch_with_gemini(image_paths: List[str]) -> List[dict]:
    if not image_paths: return []
    if len(image_paths)==1: return [analyze_with_gemini(image_paths[0])]
    from google.genai import types
    client_configs=_client_configs(); prepared=[]; contents=[]
    prompt=BASE_PROMPT+f"\nThere are {len(image_paths)} drawings in this request. Return exactly one drawings[] entry for each, using drawing_index 1..{len(image_paths)} matching the labels."
    contents.append(prompt)
    for i,path in enumerate(image_paths,1):
        data,w,h=_prepare_image(path); prepared.append((w,h))
        contents.append(f'DRAWING {i}')
        contents.append(types.Part.from_bytes(data=data,mime_type='image/jpeg'))
    text,used_model,used_key=_call_model(client_configs,contents,GeminiBatchAnalysis)
    parsed=GeminiBatchAnalysis.model_validate_json(text)
    by_index={d.drawing_index:d for d in parsed.drawings}
    results=[]
    for i,(w,h) in enumerate(prepared,1):
        d=by_index.get(i)
        if d is None:
            results.append({'drawing_number':None,'part_name':None,'customer':None,'company_name':None,'material':None,'scale':None,'sheet_number':None,'project_name':None,'po_number':None,'drawn_by':None,'checked_by':None,'approved_by':None,'revision':None,'drawing_date':None,'quantity':None,'characteristics':[],'model':used_model,'api_key_slot':used_key,'error':'No analysis returned for this drawing'})
        else:
            results.append({'drawing_number':(d.drawing_number or '').strip() or None,'part_name':(d.part_name or '').strip() or None,'customer':(d.customer or '').strip() or None,'company_name':(d.company_name or '').strip() or None,'material':(d.material or '').strip() or None,'scale':(d.scale or '').strip() or None,'sheet_number':(d.sheet_number or '').strip() or None,'project_name':(d.project_name or '').strip() or None,'po_number':(d.po_number or '').strip() or None,'drawn_by':(d.drawn_by or '').strip() or None,'checked_by':(d.checked_by or '').strip() or None,'approved_by':(d.approved_by or '').strip() or None,'revision':(d.revision or '').strip() or None,'drawing_date':(d.drawing_date or '').strip() or None,'quantity':(d.quantity or '').strip() or None,'characteristics':_to_output(d,w,h,image_paths[i-1]),'model':used_model,'api_key_slot':used_key})
    return results
