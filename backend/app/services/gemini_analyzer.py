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
- linear dimensions
- diameter dimensions (Ø / ⌀)
- radius dimensions (R)
- angular dimensions
- explicit tolerances and limit dimensions
- hole callouts, counterbore/countersink/depth callouts
- thread callouts
- GD&T feature-control-frame characteristics
- datum feature identifiers when inspection-relevant
- surface-finish requirements

Do NOT create characteristics from drawing number, revision, sheet number, scale, dates, quantities, material names, company/title-block administrative text, BOM item numbers, random standalone digits, or duplicate text belonging to the same characteristic.

For each characteristic also return a short description based only on visible nearby feature context (for example Overall length, Hole diameter, Radius, Thread callout). If the feature name is not visible or inferable without guessing, use a generic type-based description. Return its exact visible text and the CENTER of the characteristic/callout in normalized coordinates where x=0 is left, x=1000 is right, y=0 is top, y=1000 is bottom. Use the location of the dimension/callout text itself, not the part geometry. Return each real characteristic once. Prefer precision over guessing.
'''


def _learning_path() -> str:
    # Keep reviewer-learning writes on writable runtime storage in serverless deployments.
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    default_data = os.path.join(backend_dir, 'data')
    if os.getenv('VERCEL'):
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


def _balloon_offset(tx: float, ty: float, width: int, height: int, occupied: list[tuple[float, float]]) -> tuple[float, float]:
    candidates = [(tx+55,ty-45),(tx-55,ty-45),(tx+60,ty+45),(tx-60,ty+45),(tx+75,ty),(tx-75,ty)]
    for x, y in candidates:
        x = min(max(24, x), max(24, width - 24)); y = min(max(24, y), max(24, height - 24))
        if all((x-ox)**2 + (y-oy)**2 > 48**2 for ox,oy in occupied):
            return x,y
    x,y=candidates[0]
    return min(max(24,x),width-24), min(max(24,y),height-24)


def _prepare_image(path: str):
    with Image.open(path) as source:
        source.load(); width,height=source.size
        max_dim=max(1200,min(int(os.getenv('GEMINI_ANALYSIS_MAX_DIM','2000')),3000))
        img=source.convert('RGB')
        if max(img.size)>max_dim:
            img.thumbnail((max_dim,max_dim),Image.Resampling.LANCZOS)
        buf=BytesIO(); img.save(buf,format='JPEG',quality=86,optimize=True)
        return buf.getvalue(), width, height


def _retry_after_seconds(exc: Exception) -> int:
    text=str(exc)
    patterns=[r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+)s", r'retry in\s+([0-9.]+)s', r'retry after\s+([0-9.]+)']
    for p in patterns:
        m=re.search(p,text,re.I)
        if m:
            return max(1,min(120,int(float(m.group(1)))+1))
    return 0


def _call_model(client, models, contents, schema):
    from google.genai import types
    last_error=None
    max_retries=max(0,min(int(os.getenv('ANALYSIS_TRANSIENT_RETRIES','1')),2))
    for model in models:
        for attempt in range(max_retries+1):
            try:
                response=client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(response_mime_type='application/json',response_schema=schema,temperature=0.1),
                )
                if response.text:
                    return response.text, model
                last_error=RuntimeError('Analysis service returned an empty response')
            except Exception as exc:
                last_error=exc
                text=str(exc)
                retry=_retry_after_seconds(exc)
                daily_quota=('GenerateRequestsPerDay' in text or 'free_tier_requests' in text or 'PerDayPerProject' in text)
                is_transient=('503' in text or 'UNAVAILABLE' in text or ('429' in text and retry>0 and not daily_quota))
                if is_transient and attempt<max_retries:
                    time.sleep(min(retry or (2 if attempt==0 else 5),60))
                    continue
                break
    raise RuntimeError(str(last_error) if last_error else 'Analysis service failed')


def _to_output(parsed, width:int, height:int):
    detected=[c for c in parsed.characteristics if c.confidence>=0.55 and c.text.strip()]
    detected.sort(key=lambda c:(c.center_y,c.center_x))
    output=[]; occupied=[]; seen=set()
    for c in detected:
        nx=min(1000,max(0,float(c.center_x))); ny=min(1000,max(0,float(c.center_y)))
        tx=nx/1000*width; ty=ny/1000*height
        dedupe=(c.text.strip().upper(),round(tx/18),round(ty/18))
        if dedupe in seen: continue
        seen.add(dedupe)
        x,y=_balloon_offset(tx,ty,width,height,occupied); occupied.append((x,y))
        output.append({'number':len(output)+1,'text':c.text.strip(),'type':c.type,'x':x,'y':y,'target_x':tx,'target_y':ty,'confidence':c.confidence,'description':(c.description or '').strip(),'source':'analysis'})
    return output


def _client_and_models():
    api_key=os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
    if not api_key: raise RuntimeError('Analysis API key is not configured')
    from google import genai
    primary=os.getenv('GEMINI_MODEL','').strip()
    if not primary: raise RuntimeError('Analysis model is not configured')
    fallbacks=[m.strip() for m in os.getenv('GEMINI_FALLBACK_MODELS','').split(',') if m.strip()]
    return genai.Client(api_key=api_key), [primary]+[m for m in fallbacks if m!=primary]


def analyze_with_gemini(image_path: str) -> dict:
    from google.genai import types
    client,models=_client_and_models(); data,width,height=_prepare_image(image_path)
    contents=[types.Part.from_bytes(data=data,mime_type='image/jpeg'), BASE_PROMPT+_learning_context()]
    text,used_model=_call_model(client,models,contents,GeminiDrawingAnalysis)
    parsed=GeminiDrawingAnalysis.model_validate_json(text)
    return {'drawing_number':(parsed.drawing_number or '').strip() or None,'part_name':(parsed.part_name or '').strip() or None,'customer':(parsed.customer or '').strip() or None,'company_name':(parsed.company_name or '').strip() or None,'material':(parsed.material or '').strip() or None,'scale':(parsed.scale or '').strip() or None,'sheet_number':(parsed.sheet_number or '').strip() or None,'project_name':(parsed.project_name or '').strip() or None,'po_number':(parsed.po_number or '').strip() or None,'drawn_by':(parsed.drawn_by or '').strip() or None,'checked_by':(parsed.checked_by or '').strip() or None,'approved_by':(parsed.approved_by or '').strip() or None,'revision':(parsed.revision or '').strip() or None,'drawing_date':(parsed.drawing_date or '').strip() or None,'quantity':(parsed.quantity or '').strip() or None,'characteristics':_to_output(parsed,width,height),'model':used_model}


def analyze_batch_with_gemini(image_paths: List[str]) -> List[dict]:
    if not image_paths: return []
    if len(image_paths)==1: return [analyze_with_gemini(image_paths[0])]
    from google.genai import types
    client,models=_client_and_models(); prepared=[]; contents=[]
    prompt=BASE_PROMPT+_learning_context()+f"\nThere are {len(image_paths)} drawings in this request. Return exactly one drawings[] entry for each, using drawing_index 1..{len(image_paths)} matching the labels."
    contents.append(prompt)
    for i,path in enumerate(image_paths,1):
        data,w,h=_prepare_image(path); prepared.append((w,h))
        contents.append(f'DRAWING {i}')
        contents.append(types.Part.from_bytes(data=data,mime_type='image/jpeg'))
    text,used_model=_call_model(client,models,contents,GeminiBatchAnalysis)
    parsed=GeminiBatchAnalysis.model_validate_json(text)
    by_index={d.drawing_index:d for d in parsed.drawings}
    results=[]
    for i,(w,h) in enumerate(prepared,1):
        d=by_index.get(i)
        if d is None:
            results.append({'drawing_number':None,'part_name':None,'customer':None,'company_name':None,'material':None,'scale':None,'sheet_number':None,'project_name':None,'po_number':None,'drawn_by':None,'checked_by':None,'approved_by':None,'revision':None,'drawing_date':None,'quantity':None,'characteristics':[],'model':used_model,'error':'No analysis returned for this drawing'})
        else:
            results.append({'drawing_number':(d.drawing_number or '').strip() or None,'part_name':(d.part_name or '').strip() or None,'customer':(d.customer or '').strip() or None,'company_name':(d.company_name or '').strip() or None,'material':(d.material or '').strip() or None,'scale':(d.scale or '').strip() or None,'sheet_number':(d.sheet_number or '').strip() or None,'project_name':(d.project_name or '').strip() or None,'po_number':(d.po_number or '').strip() or None,'drawn_by':(d.drawn_by or '').strip() or None,'checked_by':(d.checked_by or '').strip() or None,'approved_by':(d.approved_by or '').strip() or None,'revision':(d.revision or '').strip() or None,'drawing_date':(d.drawing_date or '').strip() or None,'quantity':(d.quantity or '').strip() or None,'characteristics':_to_output(d,w,h),'model':used_model})
    return results
