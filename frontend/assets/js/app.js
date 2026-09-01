const API=(location.hostname==='127.0.0.1'||location.hostname==='localhost')?'http://127.0.0.1:8000':'/api';
const $=id=>document.getElementById(id);
let selectedFiles=[], projectId=null, drawings=[], currentIndex=0, loadedDrawingIndex=null;
let balloons=[], originalBalloons=[], selected=null, drag=null, zoom=1, mode='select', undoStack=[];
let naturalWidth=1,naturalHeight=1;
let reports=[], reportIndex=0;

function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function switchView(name){['uploadView','processingView','editorView','reportView'].forEach(v=>$(v).classList.add('hidden'));$(name).classList.remove('hidden')}
function showError(msg){$('uploadError').textContent=msg;$('uploadError').classList.remove('hidden')}
function snapshot(){undoStack.push(JSON.stringify(balloons));if(undoStack.length>40)undoStack.shift()}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function normalizeBalloon(b){return{number:Number(b.number)||1,text:b.text||'',description:b.description||'',x:Number(b.x)||80,y:Number(b.y)||80,target_x:Number(b.target_x??b.x)||80,target_y:Number(b.target_y??b.y)||80,type:b.type||guessType(b.text),confidence:Number(b.confidence)||null,source:b.source||''}}
function resequenceBalloons(list=balloons){list.forEach((b,i)=>b.number=i+1);return list}
function normalizedExportBalloons(list){return resequenceBalloons(JSON.parse(JSON.stringify(list||[])))}
function guessType(t=''){if(/[Ø⌀]/.test(t))return'DIA';if(/^R/i.test(t))return'RAD';if(/°/.test(t))return'ANG';if(/[±+\-]/.test(t))return'TOL';return'DIM'}

async function health(){try{const r=await fetch(API+'/health');if(!r.ok)throw 0;const j=await r.json();$('healthDot').classList.add('ok');$('healthText').textContent=j.analysis_configured?`Analysis ready · ${j.learning_examples||0} learned reviews`:'Analysis engine needs configuration'}catch{$('healthDot').classList.remove('ok');$('healthText').textContent='Analysis engine offline'}}
health();

const drop=$('dropZone');
$('browseBtn').onclick=()=>{ $('fileInput').value=''; $('fileInput').click(); };
$('fileInput').onchange=e=>setFiles([...e.target.files],true);
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragging')}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragging')}));
drop.addEventListener('drop',async e=>{
  const files=await collectDroppedFiles(e.dataTransfer);
  setFiles(files,true);
});
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')$('fileInput').click()});
async function collectDroppedFiles(dataTransfer){
  const items=[...(dataTransfer.items||[])];
  if(!items.length)return [...(dataTransfer.files||[])];
  const out=[];
  async function walk(entry){
    if(!entry)return;
    if(entry.isFile){
      await new Promise(resolve=>entry.file(file=>{out.push(file);resolve()},resolve));
      return;
    }
    if(entry.isDirectory){
      const reader=entry.createReader();
      while(true){
        const entries=await new Promise(resolve=>reader.readEntries(resolve,()=>resolve([])));
        if(!entries.length)break;
        for(const child of entries)await walk(child);
      }
    }
  }
  for(const item of items){
    const entry=item.webkitGetAsEntry?.();
    if(entry)await walk(entry);
    else {const f=item.getAsFile?.();if(f)out.push(f)}
  }
  return out.length?out:[...(dataTransfer.files||[])];
}
function fileKey(f){return `${f.name}|${f.size}|${f.lastModified||0}`}
function renderSelectedFiles(){
  const box=$('fileSummary');
  if(!selectedFiles.length){box.classList.add('hidden');box.innerHTML='';$('analyzeBtn').disabled=true;return}
  const total=selectedFiles.reduce((n,f)=>n+f.size,0)/1024/1024;
  box.classList.remove('hidden');
  box.innerHTML=`<div class="selected-files-head"><b>${selectedFiles.length} source file${selectedFiles.length!==1?'s':''}</b><span>${total.toFixed(2)} MB</span></div><div class="selected-file-list">${selectedFiles.map((f,i)=>`<div class="selected-file-row"><span class="selected-file-type">${/\.pdf$/i.test(f.name)?'PDF':'IMG'}</span><span class="selected-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span><button class="selected-file-remove" type="button" data-file-index="${i}" title="Remove ${escapeHtml(f.name)}" aria-label="Remove ${escapeHtml(f.name)}">×</button></div>`).join('')}</div>`;
  box.querySelectorAll('.selected-file-remove').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();const i=Number(btn.dataset.fileIndex);selectedFiles.splice(i,1);renderSelectedFiles();});
}
function setFiles(files,append=true){
  const valid=files.filter(f=>['application/pdf','image/png','image/jpeg'].includes(f.type)||/\.(pdf|png|jpe?g)$/i.test(f.name));
  if(!valid.length){showError('Select PDF, PNG, JPG or JPEG engineering drawings.');return}
  const base=append?selectedFiles:[];
  const merged=[...base,...valid];
  const seen=new Set();
  selectedFiles=merged.filter(f=>{const k=fileKey(f);if(seen.has(k))return false;seen.add(k);return true});
  $('uploadError').classList.add('hidden');
  $('analyzeBtn').disabled=!selectedFiles.length;
  renderSelectedFiles();
}
async function countExpandedDrawings(){
  if(!selectedFiles.some(f=>/\.pdf$/i.test(f.name)))return selectedFiles.length;
  const fd=new FormData();selectedFiles.forEach(f=>fd.append('files',f));
  try{
    const r=await fetch(API+'/drawing-count',{method:'POST',body:fd,cache:'no-store'});
    if(!r.ok)throw 0;
    const j=await r.json();
    return Math.max(selectedFiles.length,Number(j.drawing_count)||selectedFiles.length);
  }catch(_){return selectedFiles.length}
}
function setProgress(step,text=''){const widths=[25,70,100];$('progressBar').style.width=widths[step]+'%';document.querySelectorAll('.process-row').forEach((r,i)=>{r.classList.toggle('done',i<step);r.classList.toggle('active',i===step);r.querySelector('em').textContent=i<step?'Done':i===step?'•••':'Waiting'});$('processingText').textContent=text||['Splitting PDFs and preparing drawing previews…','Analyzing drawings and detecting inspection characteristics…','Building the interactive review queue…'][step]}

async function startAnalysis(){
  const btn=$('analyzeBtn');
  const label=btn.querySelector('.analyze-label');
  if(btn.dataset.busy==='1')return;
  if(!selectedFiles.length){showError('Choose at least one engineering drawing before analysis.');return}

  btn.dataset.busy='1';
  btn.disabled=true;
  if(label)label.textContent='Starting analysis…';
  $('uploadError').classList.add('hidden');

  try{
    const hr=await fetch(API+'/health',{cache:'no-store'}).catch(()=>null);
    if(!hr||!hr.ok)throw new Error('Analysis API is unavailable.');

    const uploadedCount=await countExpandedDrawings();
    switchView('processingView');
    setProgress(0,`Preparing ${uploadedCount} uploaded drawing${uploadedCount!==1?'s':''}…`);
    $('analysisProgressText').textContent=`0 / ${uploadedCount}`;
    $('analysisCount').textContent=`0 / ${uploadedCount}`;
    $('analysisProgressDetail').textContent=`Detected ${uploadedCount} drawing${uploadedCount!==1?'s':''} in the uploaded files · preparing all pages…`;
    $('batchProgress').textContent=`${uploadedCount} drawing${uploadedCount!==1?'s':''} total · all will be analyzed in this run…`;

    const fd=new FormData();
    selectedFiles.forEach(f=>fd.append('files',f));
    fd.append('project_name',$('projectName').value.trim()||'Drawing Ballooning Project');

    // IMPORTANT: upload + all analyses are deliberately one API request. Vercel /tmp
    // is instance-local; separate /analyze-ai calls can land on different instances.
    // One request keeps all six drawings in the same runtime and matches localhost.
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),240000);
    let r;
    try{
      r=await fetch(API+'/upload-analyze-batch',{method:'POST',body:fd,signal:controller.signal,cache:'no-store'});
    }finally{clearTimeout(timer)}
    const payload=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(cleanAnalysisError(payload.detail||`Upload/analysis failed (${r.status})`));
    if(!payload.project_id||!Array.isArray(payload.drawings)||!payload.drawings.length)throw new Error('No reviewable drawings were returned.');

    projectId=payload.project_id;
    drawings=payload.drawings.map((d,i)=>{
      const a=d.analysis||{};
      const result=a.ok?a:{};
      const mapped={...d,index:i,reviewed:false,balloons:[],originalBalloons:[],error:a.ok?null:(d.error||a.detail||null)};
      if(a.ok){
        mapped.drawing_number=result.drawing_number||mapped.drawing_number;
        mapped.part_name=result.part_name||mapped.part_name||'';
        mapped.customer=result.customer||result.company_name||mapped.customer||'';
        mapped.company_name=result.company_name||mapped.company_name||'';
        mapped.material=result.material||mapped.material||'';
        mapped.scale=result.scale||mapped.scale||'';
        mapped.sheet_number=result.sheet_number||mapped.sheet_number||'';
        mapped.project_name=result.project_name||mapped.project_name||'';
        mapped.po_number=result.po_number||mapped.po_number||'';
        mapped.drawn_by=result.drawn_by||mapped.drawn_by||'';
        mapped.checked_by=result.checked_by||mapped.checked_by||'';
        mapped.approved_by=result.approved_by||mapped.approved_by||'';
        mapped.revision=result.revision||mapped.revision||'';
        mapped.drawing_date=result.drawing_date||mapped.drawing_date||'';
        mapped.quantity=result.quantity||mapped.quantity||'';
        mapped.balloons=(result.characteristics||[]).map(normalizeBalloon);
        mapped.originalBalloons=JSON.parse(JSON.stringify(mapped.balloons));
        mapped.status='analyzed';
      }
      return mapped;
    });

    const total=drawings.length;
    const successful=drawings.filter(d=>d.status==='analyzed').length;
    const failed=total-successful;
    $('analysisProgressText').textContent=`${total} / ${total}`;
    $('analysisCount').textContent=`${total} / ${total}`;
    $('analysisProgressFill').style.width='100%';
    $('analysisProgressDetail').textContent=`${successful} ready · ${failed} unavailable · 0 remaining`;
    setProgress(2,`Analysis finished for ${total} drawing${total!==1?'s':''}.`);
    $('batchProgress').textContent=`${successful} of ${total} drawings ready${failed?` · ${failed} need retry`:''}.`;

    const first=drawings.findIndex(d=>d.balloons.length);
    if(first<0)throw new Error(drawings.find(d=>d.error)?.error||'No balloonable inspection characteristics were returned.');

    currentIndex=first;loadedDrawingIndex=null;
    $('projectTitle').textContent=$('projectName').value.trim()||'Drawing Ballooning Project';
    $('fileTitle').textContent=`${drawings.length} drawing review set`;
    $('drawingSetCount').textContent=`${drawings.length} items`;
    switchView('editorView');
    renderDrawingNav();
    await loadDrawing(currentIndex);
    updateReviewProgress();
    toast(`${successful} drawing${successful!==1?'s':''} ready for review`);
  }catch(e){
    switchView('uploadView');
    showError(cleanAnalysisError(e?.name==='AbortError'?'Production analysis timed out. Try fewer drawings or reduce parallel workers.':(e.message||'Analysis could not start.')));
  }finally{
    btn.dataset.busy='0';
    btn.disabled=!selectedFiles.length;
    if(label)label.textContent='Analyze & Auto-Balloon';
  }
}
$('analyzeBtn').addEventListener('click',startAnalysis);

function cleanAnalysisError(message='Analysis failed'){
  const text=String(message).replace(/generativelanguage/gi,'analysis-service').replace(/Google/gi,'AI service');
  if(/429|RESOURCE_EXHAUSTED|quota exceeded/i.test(text))return 'Analysis quota is temporarily exhausted. Completed and cached drawings are preserved. Increase the API quota/billing or continue after the quota resets.';
  return text;
}

function saveCurrentState(){
  if(loadedDrawingIndex===null||!drawings.length||!drawings[loadedDrawingIndex])return;
  drawings[loadedDrawingIndex].balloons=JSON.parse(JSON.stringify(balloons));
  drawings[loadedDrawingIndex].originalBalloons=JSON.parse(JSON.stringify(originalBalloons));
}
async function loadDrawing(index){
  if(loadedDrawingIndex!==null) saveCurrentState();
  currentIndex=index;const d=drawings[index];balloons=JSON.parse(JSON.stringify(d.balloons||[]));originalBalloons=JSON.parse(JSON.stringify(d.originalBalloons||[]));selected=null;undoStack=[];zoom=1;
  $('currentDrawingNumber').textContent=d.drawing_number||`Drawing ${index+1}`;$('pageLabel').textContent=`Page ${d.page_number||1}`;$('analysisEngine').textContent=d.error?'Analysis issue':'Auto analysis';updateCurrentReviewButton();
  $('drawing').src=API+d.preview_url;
  await new Promise((resolve,reject)=>{$('drawing').onload=resolve;$('drawing').onerror=reject});
  naturalWidth=$('drawing').naturalWidth||1;naturalHeight=$('drawing').naturalHeight||1;$('overlay').setAttribute('viewBox',`0 0 ${naturalWidth} ${naturalHeight}`);$('overlay').setAttribute('preserveAspectRatio','none');loadedDrawingIndex=index;render();renderDrawingNav();requestAnimationFrame(fitView)
}
function updateCurrentReviewButton(){
  const btn=$('markReviewedBtn'),d=drawings[currentIndex];if(!btn||!d)return;
  btn.textContent=d.reviewed?'✓ Reviewed':'Mark reviewed';
  btn.classList.toggle('reviewed',!!d.reviewed);
}
async function autoTrainReviewedDrawing(index){
  const d=drawings[index];
  if(!d||!d.reviewed||d.training||d.trained)return;
  d.training=true;
  try{
    const finalBalloons=normalizedExportBalloons(d.balloons||[]);
    const res=await fetch(`${API}/learn/${d.drawing_id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({original_balloons:d.originalBalloons||[],final_balloons:finalBalloons,project_name:$('projectTitle').textContent||'',drawing_number:d.drawing_number||''})});
    if(res.ok){d.trained=true;health();}
  }catch(_){/* review must still work even if learning storage is unavailable */}
  finally{d.training=false;}
}
function toggleDrawingReviewed(index){
  saveCurrentState();const d=drawings[index];if(!d)return;d.reviewed=!d.reviewed;
  renderDrawingNav();updateReviewProgress();if(index===currentIndex)updateCurrentReviewButton();
  if(d.reviewed)autoTrainReviewedDrawing(index);
  toast(d.reviewed?'Drawing reviewed · corrections learned':'Review mark removed');
}
async function retryDrawingAnalysis(index){
  saveCurrentState();
  const d=drawings[index];
  if(!d)return;
  const file=selectedFiles.find(f=>f.name===d.source_filename) || selectedFiles[0];
  if(!file){toast('Original drawing file is not available for retry. Upload the drawing set again.');return}
  d.retrying=true;renderDrawingNav();
  try{
    const fd=new FormData();
    fd.append('file',file);
    fd.append('page_index',String(Number(d.page_index)||0));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),180000);
    let r;
    try{r=await fetch(API+'/reanalyze-upload',{method:'POST',body:fd,signal:controller.signal,cache:'no-store'})}
    finally{clearTimeout(timer)}
    const a=await r.json().catch(()=>({}));
    if(!r.ok||!a.ok)throw new Error(cleanAnalysisError(a.detail||`Analysis failed (${r.status})`));
    d.drawing_number=a.drawing_number||d.drawing_number;
    d.part_name=a.part_name||d.part_name||'';
    d.customer=a.customer||a.company_name||d.customer||'';
    d.company_name=a.company_name||d.company_name||'';
    d.material=a.material||d.material||'';d.scale=a.scale||d.scale||'';d.sheet_number=a.sheet_number||d.sheet_number||'';
    d.project_name=a.project_name||d.project_name||'';d.po_number=a.po_number||d.po_number||'';
    d.drawn_by=a.drawn_by||d.drawn_by||'';d.checked_by=a.checked_by||d.checked_by||'';d.approved_by=a.approved_by||d.approved_by||'';
    d.revision=a.revision||d.revision||'';d.drawing_date=a.drawing_date||d.drawing_date||'';d.quantity=a.quantity||d.quantity||'';
    d.balloons=(a.characteristics||[]).map(normalizeBalloon);
    d.originalBalloons=JSON.parse(JSON.stringify(d.balloons));
    d.status='analyzed';d.error=null;d.retrying=false;
    if(index===currentIndex){loadedDrawingIndex=null;await loadDrawing(index)}else renderDrawingNav();
    toast(`Drawing ${index+1} analyzed${a.api_key_slot?` via ${a.api_key_slot}`:''}`);
  }catch(e){
    d.retrying=false;d.status='error';d.error=e?.name==='AbortError'?'Single-drawing analysis timed out. Try again.':(e.message||'Analysis failed');
    renderDrawingNav();toast(d.error);
  }
}

function renderDrawingNav(){
  const nav=$('drawingNav');nav.innerHTML='';
  drawings.forEach((d,i)=>{
    const card=document.createElement('div');
    card.className='drawing-tab'+(i===currentIndex?' active':'')+(d.reviewed?' reviewed':'')+(d.error?' error':'');
    const label=d.drawing_number||`Drawing ${String(i+1).padStart(2,'0')}`;
    const drawingName=(d.part_name||d.drawing_name||d.source_filename||label).replace(/\.[^.]+$/,'');
    const needsAnalyze=d.status!=='analyzed' || !!d.error;
    card.innerHTML=`<button class="drawing-tab-main" type="button" title="Open ${escapeHtml(drawingName)}"><span class="drawing-index">${String(i+1).padStart(2,'0')}</span><span class="drawing-tab-info"><span class="drawing-name">${escapeHtml(drawingName)}</span></span><em title="${d.balloons.length} balloons">${d.error?'!':d.balloons.length}</em></button>${needsAnalyze?`<button class="retry-analysis-btn" type="button" title="Analyze only this drawing" ${d.retrying?'disabled':''}>${d.retrying?'…':'Analyze'}</button>`:''}<button class="review-dot ${d.reviewed?'is-reviewed':'is-pending'}" type="button" title="${d.reviewed?'Reviewed — click to mark pending':'Pending review — click to mark reviewed'}" aria-label="${d.reviewed?'Mark drawing pending':'Mark drawing reviewed'}"><span>${d.reviewed?'✓':''}</span></button>`;
    card.querySelector('.drawing-tab-main').onclick=()=>loadDrawing(i);
    const retryBtn=card.querySelector('.retry-analysis-btn');if(retryBtn)retryBtn.onclick=e=>{e.stopPropagation();retryDrawingAnalysis(i)};
    card.querySelector('.review-dot').onclick=e=>{e.stopPropagation();toggleDrawingReviewed(i)};
    nav.appendChild(card);
  });
}
function updateReviewProgress(){const reviewed=drawings.filter(d=>d.reviewed).length,total=drawings.length;$('reviewedText').textContent=`${reviewed} / ${total} reviewed`;$('reviewBar').style.width=(total?reviewed/total*100:0)+'%';const ready=total>0&&reviewed===total;$('nextBtn').disabled=!ready;$('nextBtn').title=ready?'Continue to the final inspection report templates':`Review all ${total} drawings to continue`;const allBtn=$('markAllReviewedBtn');if(allBtn){allBtn.textContent=ready?'↺ Clear':'✓ All';allBtn.classList.toggle('all-reviewed',ready);allBtn.title=ready?'Clear all reviewed marks':'Mark every drawing reviewed'}}

const workspaceGrid=document.querySelector('.workspace-grid');
function setWorkspacePanel(panel,visible){
  if(!workspaceGrid)return;
  const classMap={tools:'hide-tools',drawings:'hide-drawings',inspect:'hide-inspect'};
  const buttonMap={tools:'toggleToolsBtn',drawings:'toggleDrawingsBtn',inspect:'panelToggle'};
  const cls=classMap[panel];
  if(!cls)return;
  workspaceGrid.classList.toggle(cls,!visible);
  const btn=$(buttonMap[panel]);
  if(btn){btn.classList.toggle('panel-hidden',!visible);btn.setAttribute('aria-pressed',String(visible));}
  requestAnimationFrame(()=>{if(typeof fitView==='function')fitView()});
}
function toggleWorkspacePanel(panel){
  const classMap={tools:'hide-tools',drawings:'hide-drawings',inspect:'hide-inspect'};
  const cls=classMap[panel];
  setWorkspacePanel(panel,workspaceGrid?.classList.contains(cls));
}
if($('toggleToolsBtn'))$('toggleToolsBtn').onclick=()=>toggleWorkspacePanel('tools');
if($('toggleDrawingsBtn'))$('toggleDrawingsBtn').onclick=()=>toggleWorkspacePanel('drawings');
if($('panelToggle'))$('panelToggle').onclick=()=>toggleWorkspacePanel('inspect');
$('markReviewedBtn').onclick=()=>toggleDrawingReviewed(currentIndex);
function setAllReviewed(value=true){
  saveCurrentState();
  drawings.forEach(d=>{d.reviewed=!!value});
  renderDrawingNav();updateReviewProgress();updateCurrentReviewButton();
  toast(value?'All drawings marked reviewed':'All review marks cleared');
}
if($('markAllReviewedBtn'))$('markAllReviewedBtn').onclick=()=>{
  const allReviewed=drawings.length>0&&drawings.every(d=>d.reviewed);
  setAllReviewed(!allReviewed);
};

function clampDrawingPoint(p){return{x:Math.max(0,Math.min(naturalWidth,p.x)),y:Math.max(0,Math.min(naturalHeight,p.y))}}
function leaderEndpoints(b){
  const safeMargin=22;
  const bx=Math.max(safeMargin,Math.min(naturalWidth-safeMargin,b.x));
  const by=Math.max(safeMargin,Math.min(naturalHeight-safeMargin,b.y));
  const dx=b.target_x-bx,dy=b.target_y-by,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  // Keep the normal balloon size. Only the visible leader is shortened: ~1 cm.
  const balloonRadius=18,bodyGap=balloonRadius+1;
  // The circle is positioned about 1 cm of visible leader away from the target.
  // target_x/target_y is already a protected white-space point above the
  // measurement text. End exactly there so the arrow indicates the measurement
  // while remaining visibly clear of letters, numbers and CAD lines.
  const endGap=0;
  const x1=bx+ux*bodyGap,y1=by+uy*bodyGap;
  const x2=b.target_x-ux*endGap,y2=b.target_y-uy*endGap;
  return{x1,y1,x2,y2};
}

function render(){
  const svg=$('overlay');svg.innerHTML=`<defs><marker id="balloonArrowGreen" markerWidth="7" markerHeight="7" refX="6.5" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 z" fill="#0b5d3b"/></marker><marker id="balloonArrowRed" markerWidth="7" markerHeight="7" refX="6.5" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 z" fill="#ef4444"/></marker></defs>`;
  balloons.forEach((b,i)=>{
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','balloon'+(selected===i?' selected':''));g.dataset.index=i;
    const ep=leaderEndpoints(b);g.innerHTML=`<line class="leader" x1="${ep.x1}" y1="${ep.y1}" x2="${ep.x2}" y2="${ep.y2}" marker-end="url(#${selected===i?'balloonArrowRed':'balloonArrowGreen'})"/><circle class="target-handle" cx="${b.target_x}" cy="${b.target_y}" r="5"/><circle class="balloon-body" cx="${b.x}" cy="${b.y}" r="18"/><text x="${b.x}" y="${b.y}">${b.number}</text>`;
    const body=g.querySelector('.balloon-body'),target=g.querySelector('.target-handle'),leader=g.querySelector('.leader');
    const startDrag=(kind,e)=>{if(mode!=='select')return;e.preventDefault();e.stopPropagation();selected=i;snapshot();const p=svgPoint(e);drag={kind,index:i,pointerId:e.pointerId,start:p,dx:p.x-b.x,dy:p.y-b.y,startX:b.x,startY:b.y,startTargetX:b.target_x,startTargetY:b.target_y};g.setPointerCapture?.(e.pointerId);svg.querySelectorAll('.balloon').forEach(x=>{x.classList.remove('selected');const ln=x.querySelector('.leader');if(ln)ln.setAttribute('marker-end','url(#balloonArrowGreen)')});g.classList.add('selected');leader.setAttribute('marker-end','url(#balloonArrowRed)');updatePanels()};
    body.addEventListener('pointerdown',e=>startDrag('body',e));
    target.addEventListener('pointerdown',e=>startDrag('target',e));
    leader.addEventListener('pointerdown',e=>startDrag('leader',e));
    g.addEventListener('pointermove',e=>{if(!drag||drag.index!==i||drag.pointerId!==e.pointerId)return;const p=svgPoint(e);if(drag.kind==='target'){const q=clampDrawingPoint(p);b.target_x=q.x;b.target_y=q.y}else if(drag.kind==='leader'){const dx=p.x-drag.start.x,dy=p.y-drag.start.y;const bodyP=clampDrawingPoint({x:drag.startX+dx,y:drag.startY+dy}),targetP=clampDrawingPoint({x:drag.startTargetX+dx,y:drag.startTargetY+dy});const adjX=bodyP.x-(drag.startX+dx),adjY=bodyP.y-(drag.startY+dy);b.x=bodyP.x;b.y=bodyP.y;b.target_x=Math.max(0,Math.min(naturalWidth,targetP.x+adjX));b.target_y=Math.max(0,Math.min(naturalHeight,targetP.y+adjY))}else{const q=clampDrawingPoint({x:p.x-drag.dx,y:p.y-drag.dy});b.x=q.x;b.y=q.y}updateOverlayOnly(i)});
    const endDrag=e=>{if(!drag||drag.index!==i)return;drag=null;try{g.releasePointerCapture?.(e.pointerId)}catch{}render()};
    g.addEventListener('pointerup',endDrag);g.addEventListener('pointercancel',endDrag);svg.appendChild(g)
  });updatePanels();saveCurrentState()
}
function updateOverlayOnly(i){const g=$('overlay').querySelector(`g[data-index="${i}"]`),b=balloons[i];if(!g)return;const line=g.querySelector('.leader'),ep=leaderEndpoints(b);line.setAttribute('x1',ep.x1);line.setAttribute('y1',ep.y1);line.setAttribute('x2',ep.x2);line.setAttribute('y2',ep.y2);const body=g.querySelector('.balloon-body'),target=g.querySelector('.target-handle');body.setAttribute('cx',b.x);body.setAttribute('cy',b.y);target.setAttribute('cx',b.target_x);target.setAttribute('cy',b.target_y);const t=g.querySelector('text');t.setAttribute('x',b.x);t.setAttribute('y',b.y)}
function svgPoint(e){const rect=$('overlay').getBoundingClientRect(),sx=$('overlay').viewBox.baseVal.width/rect.width,sy=$('overlay').viewBox.baseVal.height/rect.height;return{x:(e.clientX-rect.left)*sx,y:(e.clientY-rect.top)*sy}}
function manualBalloonPosition(p){
  // Conventional default balloon: normal circle with ~1 cm leader.
  const margin=24,centreDistance=57;
  const dirs=[[.75,-.66],[-.75,-.66],[.75,.66],[-.75,.66]];
  const candidates=dirs.map(([dx,dy])=>{
    const c={x:Math.max(margin,Math.min(naturalWidth-margin,p.x+dx*centreDistance)),y:Math.max(margin,Math.min(naturalHeight-margin,p.y+dy*centreDistance))};
    const collision=balloons.filter(b=>Math.hypot(c.x-b.x,c.y-b.y)<64).length;
    return {c,score:collision*1000+Math.abs(Math.hypot(c.x-p.x,c.y-p.y)-centreDistance)};
  });
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0]?.c||{x:Math.max(margin,Math.min(naturalWidth-margin,p.x+50)),y:Math.max(margin,Math.min(naturalHeight-margin,p.y-45))};
}

let stagePan=null;
$('overlay').addEventListener('pointerdown',e=>{if(e.target!==$('overlay'))return;if(mode==='add'){snapshot();const p=clampDrawingPoint(svgPoint(e)),n=nextNumber(),pos=manualBalloonPosition(p);balloons.push({number:n,text:'Manual characteristic',x:pos.x,y:pos.y,target_x:p.x,target_y:p.y,type:'MAN',source:'manual'});selected=balloons.length-1;setMode('select');render();toast(`Balloon ${n} added`);return}const sc=$('stageScroll');stagePan={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,left:sc.scrollLeft,top:sc.scrollTop,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId)});
$('overlay').addEventListener('pointermove',e=>{if(!stagePan||stagePan.pointerId!==e.pointerId)return;const dx=e.clientX-stagePan.startX,dy=e.clientY-stagePan.startY;if(Math.abs(dx)+Math.abs(dy)>4)stagePan.moved=true;const sc=$('stageScroll');sc.scrollLeft=stagePan.left-dx;sc.scrollTop=stagePan.top-dy});
function endStagePan(e){if(!stagePan||stagePan.pointerId!==e.pointerId)return;const moved=stagePan.moved;stagePan=null;try{$('overlay').releasePointerCapture?.(e.pointerId)}catch{}if(!moved){selected=null;render()}}
$('overlay').addEventListener('pointerup',endStagePan);$('overlay').addEventListener('pointercancel',endStagePan);
function nextNumber(){return balloons.length?Math.max(...balloons.map(b=>Number(b.number)||0))+1:1}
function updatePanels(){$('detectedCount').textContent=originalBalloons.length;$('balloonCount').textContent=balloons.length;const q=$('searchInput').value.trim().toLowerCase(),list=$('characteristicList');list.innerHTML='';const indexes=balloons.map((b,i)=>({b,i})).filter(({b})=>!q||String(b.number).includes(q)||(b.text||'').toLowerCase().includes(q));if(!indexes.length)list.innerHTML='<div class="empty-state">No characteristics found.<br>Use <b>Add</b> to place a manual balloon.</div>';indexes.forEach(({b,i})=>{const row=document.createElement('div');row.className='char-row'+(selected===i?' selected':'');const confidence=b.confidence?` · ${Math.round(b.confidence*100)}% confidence`:b.source==='manual'?' · Manual':'';row.innerHTML=`<div class="char-num">${b.number}</div><div class="char-info"><b>${escapeHtml(b.text||'Manual characteristic')}</b><small>${escapeHtml(drawings[currentIndex]?.drawing_number||'Drawing')}${confidence}</small></div><span class="char-type">${escapeHtml(b.type||'DIM')}</span>`;row.onclick=()=>{selected=i;render();centerSelected()};list.appendChild(row)});if(selected!==null&&balloons[selected]){const b=balloons[selected];$('propertiesCard').classList.remove('hidden');$('propNumber').value=b.number;$('propText').value=b.text;$('propX').value=Math.round(b.x);$('propY').value=Math.round(b.y)}else $('propertiesCard').classList.add('hidden')}
$('searchInput').oninput=updatePanels;
function centerSelected(){if(selected===null)return;const b=balloons[selected],sc=$('stageScroll');sc.scrollTo({left:Math.max(0,b.x*zoom-sc.clientWidth/2),top:Math.max(0,b.y*zoom-sc.clientHeight/2),behavior:'smooth'})}
function setMode(m){mode=m;document.body.classList.toggle('add-balloon-mode',m==='add');document.querySelectorAll('.rail-btn[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===m));$('addBtn').classList.toggle('active',m==='add')}
$('addBtn').onclick=()=>{setMode('add');toast('Click directly on the missed characteristic')};
$('deleteBtn').onclick=removeSelected;
function removeSelected(){if(selected===null)return toast('Select a balloon first');snapshot();const n=balloons[selected].number;balloons.splice(selected,1);resequenceBalloons();selected=null;render();saveCurrentState();toast(`Balloon ${n} removed · sequence updated`)}
document.addEventListener('keydown',e=>{if(e.key==='Delete'&&!$('editorView').classList.contains('hidden'))removeSelected()});
$('renumberBtn').onclick=()=>{snapshot();balloons.sort((a,b)=>a.target_y-b.target_y||a.target_x-b.target_x);resequenceBalloons();selected=null;render();saveCurrentState();toast('Balloons renumbered')};
$('undoBtn').onclick=()=>{if(!undoStack.length)return toast('Nothing to undo');balloons=JSON.parse(undoStack.pop());selected=null;render();toast('Last change undone')};
$('applyPropsBtn').onclick=()=>{if(selected===null)return;snapshot();const b=balloons[selected];b.number=Math.max(1,parseInt($('propNumber').value)||b.number);b.text=$('propText').value;b.x=Number($('propX').value)||b.x;b.y=Number($('propY').value)||b.y;b.type=guessType(b.text);render();toast('Correction applied')};

const DRAWING_ZOOM_LEVELS=[.25,.33,.5,.67,.75,.8,.9,1,1.1,1.25,1.5,1.75,2,2.5,3,4,5];
function nearestZoomIndex(value){let best=0,d=Infinity;DRAWING_ZOOM_LEVELS.forEach((z,i)=>{const nd=Math.abs(z-value);if(nd<d){d=nd;best=i}});return best}
function applyZoom(anchorCenter=true,anchor=null){const sc=$('stageScroll'),oldZoom=Number(sc.dataset.zoom)||zoom||1;let cx,cy,clientX=sc.clientWidth/2,clientY=sc.clientHeight/2;if(anchor){clientX=anchor.clientX;clientY=anchor.clientY;cx=(sc.scrollLeft+clientX)/oldZoom;cy=(sc.scrollTop+clientY)/oldZoom}else{cx=(sc.scrollLeft+sc.clientWidth/2)/oldZoom;cy=(sc.scrollTop+sc.clientHeight/2)/oldZoom}zoom=Math.max(.12,Math.min(5,zoom));$('stage').style.width=Math.round(naturalWidth*zoom)+'px';$('stage').style.height=Math.round(naturalHeight*zoom)+'px';const zoomText=Math.round(zoom*100)+'%';$('zoomLabel').textContent=zoomText;if($('viewerZoomPercent'))$('viewerZoomPercent').textContent=zoomText;sc.dataset.zoom=zoom;if(anchorCenter)requestAnimationFrame(()=>{sc.scrollLeft=Math.max(0,cx*zoom-clientX);sc.scrollTop=Math.max(0,cy*zoom-clientY)})}
function fitView(){const sc=$('stageScroll');const pad=28;const aw=Math.max(80,sc.clientWidth-pad),ah=Math.max(80,sc.clientHeight-pad);zoom=Math.min(aw/naturalWidth,ah/naturalHeight);zoom=Math.max(.12,Math.min(2,zoom));applyZoom(false);requestAnimationFrame(()=>{sc.scrollLeft=Math.max(0,(sc.scrollWidth-sc.clientWidth)/2);sc.scrollTop=Math.max(0,(sc.scrollHeight-sc.clientHeight)/2)})}
function zoomStep(direction,anchor=null){let next;if(direction>0){next=DRAWING_ZOOM_LEVELS.findIndex(z=>z>zoom+0.005);if(next<0)next=DRAWING_ZOOM_LEVELS.length-1}else{next=0;for(let i=DRAWING_ZOOM_LEVELS.length-1;i>=0;i--){if(DRAWING_ZOOM_LEVELS[i]<zoom-0.005){next=i;break}}}zoom=DRAWING_ZOOM_LEVELS[next];applyZoom(true,anchor)}
$('zoomInBtn').onclick=()=>zoomStep(1);$('zoomOutBtn').onclick=()=>zoomStep(-1);$('resetBtn').onclick=fitView;
$('viewerZoomInBtn').onclick=()=>zoomStep(1);$('viewerZoomOutBtn').onclick=()=>zoomStep(-1);$('viewerFitBtn').onclick=fitView;
$('viewerZoomPercent').onclick=()=>{zoom=1;applyZoom()};
// One controlled zoom step per wheel gesture; no high-sensitivity continuous scaling.
let drawingWheelLock=false;
$('stageScroll').addEventListener('wheel',e=>{e.preventDefault();if(drawingWheelLock)return;drawingWheelLock=true;setTimeout(()=>drawingWheelLock=false,110);const rect=$('stageScroll').getBoundingClientRect();const anchor={clientX:e.clientX-rect.left,clientY:e.clientY-rect.top};zoomStep(e.deltaY<0?1:-1,anchor)}, {passive:false});
$('stageScroll').addEventListener('dblclick',e=>{if(e.target.closest('.balloon'))return;fitView()});
let lastFitWidth=0;
if('ResizeObserver' in window){new ResizeObserver(()=>{const sc=$('stageScroll');if(!naturalWidth||!sc.clientWidth)return;if(Math.abs(sc.clientWidth-lastFitWidth)>80&&zoom<=1.05){lastFitWidth=sc.clientWidth;fitView()}}).observe($('stageScroll'))}

let excelZoom=1;
const EXCEL_ZOOM_LEVELS=[.5,.6,.7,.8,.9,1,1.1,1.2,1.3,1.4,1.5,1.75,2,2.25,2.5];
function nearestExcelZoomIndex(value){let best=0,d=Infinity;EXCEL_ZOOM_LEVELS.forEach((z,i)=>{const nd=Math.abs(z-value);if(nd<d){d=nd;best=i}});return best}
function applyExcelZoom(anchorCenter=true,anchor=null){const sc=$('excelSheet'),inner=$('excelSheetInner');if(!sc||!inner)return;const old=Number(sc.dataset.zoom)||excelZoom||1;let cx,cy,clientX=sc.clientWidth/2,clientY=sc.clientHeight/2;if(anchor){clientX=anchor.clientX;clientY=anchor.clientY;cx=(sc.scrollLeft+clientX)/old;cy=(sc.scrollTop+clientY)/old}else{cx=(sc.scrollLeft+sc.clientWidth/2)/old;cy=(sc.scrollTop+sc.clientHeight/2)/old}excelZoom=Math.max(.5,Math.min(2.5,excelZoom));inner.style.zoom=excelZoom;sc.dataset.zoom=excelZoom;const txt=Math.round(excelZoom*100)+'%';if($('excelZoomPercent'))$('excelZoomPercent').textContent=txt;if(anchorCenter)requestAnimationFrame(()=>{sc.scrollLeft=Math.max(0,cx*excelZoom-clientX);sc.scrollTop=Math.max(0,cy*excelZoom-clientY)})}
function fitExcelView(){const sc=$('excelSheet'),inner=$('excelSheetInner');if(!sc||!inner)return;inner.style.zoom=1;const baseW=Math.max(1,inner.scrollWidth),baseH=Math.max(1,inner.scrollHeight);const pad=18;excelZoom=Math.min((sc.clientWidth-pad)/baseW,(sc.clientHeight-pad)/baseH,1.25);excelZoom=Math.max(.5,excelZoom);applyExcelZoom(false);requestAnimationFrame(()=>{sc.scrollLeft=Math.max(0,(sc.scrollWidth-sc.clientWidth)/2);sc.scrollTop=0})}
function excelZoomStep(direction,anchor=null){let next;if(direction>0){next=EXCEL_ZOOM_LEVELS.findIndex(z=>z>excelZoom+0.005);if(next<0)next=EXCEL_ZOOM_LEVELS.length-1}else{next=0;for(let i=EXCEL_ZOOM_LEVELS.length-1;i>=0;i--){if(EXCEL_ZOOM_LEVELS[i]<excelZoom-0.005){next=i;break}}}excelZoom=EXCEL_ZOOM_LEVELS[next];applyExcelZoom(true,anchor)}
if($('excelZoomInBtn'))$('excelZoomInBtn').onclick=()=>excelZoomStep(1);if($('excelZoomOutBtn'))$('excelZoomOutBtn').onclick=()=>excelZoomStep(-1);if($('excelFitBtn'))$('excelFitBtn').onclick=fitExcelView;if($('excelZoomPercent'))$('excelZoomPercent').onclick=()=>{excelZoom=1;applyExcelZoom()};
let excelWheelLock=false;
if($('excelSheet'))$('excelSheet').addEventListener('wheel',e=>{if(e.target.closest('input,textarea,select')&&e.shiftKey)return;e.preventDefault();if(excelWheelLock)return;excelWheelLock=true;setTimeout(()=>excelWheelLock=false,110);const rect=$('excelSheet').getBoundingClientRect();excelZoomStep(e.deltaY<0?1:-1,{clientX:e.clientX-rect.left,clientY:e.clientY-rect.top})},{passive:false});

function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}

function characteristicDescription(b){
  if((b.description||'').trim())return b.description.trim();
  const t=(b.type||guessType(b.text||'')).toUpperCase();
  const map={DIA:'Diameter',RAD:'Radius',ANG:'Angle',TOL:'Dimension / tolerance',HOLE:'Hole feature',THREAD:'Thread callout','GD&T':'GD&T requirement',SURFACE:'Surface finish',DATUM:'Datum requirement',DIM:'Linear dimension'};
  return map[t]||'Drawing characteristic';
}
function suggestedInstrument(b){
  const t=(b.type||guessType(b.text||'')).toUpperCase(),text=b.text||'';
  if(t==='ANG')return 'Bevel Protractor';
  if(t==='THREAD')return 'Thread Gauge';
  if(t==='SURFACE')return 'Surface Roughness Tester';
  if(t==='GD&T'||t==='DATUM')return 'CMM';
  if(t==='DIA'||t==='RAD'||t==='HOLE')return 'V/C';
  if(t==='TOL'){const tol=text.match(/[±]\s*([0-9.]+)/);if(tol&&Number(tol[1])<=0.05)return 'Micrometer';return 'V/C';}
  const m=text.match(/(?:^|\s)(\d+(?:\.\d+)?)/);if(m&&Number(m[1])>300)return 'M/T';
  return 'V/C';
}
function todayIso(){const d=new Date(),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function normalizeDrawingDate(v){
  const raw=(v||'').trim(); if(!raw)return todayIso();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const m=raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m){let y=m[3];if(y.length===2)y='20'+y;return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
  return todayIso();
}
function buildReports(){
  saveCurrentState();
  reports=drawings.map((d,i)=>({
    drawing_id:d.drawing_id,
    drawing_number:d.drawing_number||`Drawing ${String(i+1).padStart(2,'0')}`,
    part_name:d.part_name||'',customer:d.customer||d.company_name||'',revision:d.revision||'00',
    report_date:normalizeDrawingDate(d.drawing_date),inspected_qty:d.quantity||'',total_qty:d.quantity||'',
    remarks:[d.material?`Material: ${d.material}`:'',d.scale?`Scale: ${d.scale}`:'',d.project_name?`Project: ${d.project_name}`:'',d.po_number?`PO: ${d.po_number}`:''].filter(Boolean).join(' · ')||'Dimensions verified as per drawing',inspected_by:'',qc_incharge:'',approved_by:'',
    rows:normalizedExportBalloons(d.balloons||[]).map(b=>({number:Number(b.number)||1,description:characteristicDescription(b),dimension:b.text||'',instrument:suggestedInstrument(b),readings:[]}))
  }));
}
function inspectedQtyCount(r){
  const m=String(r?.inspected_qty||'').match(/\d+/);return m?Math.max(1,Math.min(Number(m[0]),50)):2;
}
function ensureReadings(row,qty){
  if(!Array.isArray(row.readings))row.readings=[row.reading1||'',row.reading2||''];
  while(row.readings.length<qty)row.readings.push('');
  if(row.readings.length>qty)row.readings=row.readings.slice(0,qty);
  return row.readings;
}
function saveReportForm(){
  const r=reports[reportIndex];if(!r)return;
  r.part_name=$('reportPartName').value.trim();r.drawing_number=$('reportDrawingNo').value.trim();r.customer=$('reportCustomer').value.trim();r.revision=$('reportRevision').value.trim();r.report_date=$('reportDate').value;r.inspected_qty=$('reportInspectedQty').value.trim();r.total_qty=$('reportTotalQty').value.trim();
  r.remarks=$('reportRemarks').value.trim();r.inspected_by=$('reportInspectedBy').value.trim();r.qc_incharge=$('reportQcIncharge').value.trim();r.approved_by=$('reportApprovedBy').value.trim();
  const qty=inspectedQtyCount(r);
  document.querySelectorAll('#reportRows tr[data-row-index]').forEach(tr=>{
    const i=Number(tr.dataset.rowIndex);if(!r.rows[i])return;const get=f=>tr.querySelector(`[data-field="${f}"]`)?.value??'';
    r.rows[i].description=get('description');r.rows[i].dimension=get('dimension');r.rows[i].instrument=get('instrument');
    ensureReadings(r.rows[i],qty);tr.querySelectorAll('[data-reading-index]').forEach(inp=>{r.rows[i].readings[Number(inp.dataset.readingIndex)]=inp.value??''});
  });
}

function selectReport(index){saveReportForm();reportIndex=Math.max(0,Math.min(reports.length-1,index));renderReportEditor();requestAnimationFrame(fitExcelView)}
function renderReportDrawingGallery(){
  const el=$('reportDrawingGallery');el.innerHTML='';$('reportDrawingCount').textContent=`${drawings.length} drawing${drawings.length!==1?'s':''}`;
  drawings.forEach((d,i)=>{const card=document.createElement('button');card.type='button';card.className='drawing-file-card'+(i===reportIndex?' active':'');const label=d.drawing_number||`Drawing ${i+1}`;card.innerHTML=`<div class="drawing-thumb"><img src="${API}/preview/${d.drawing_id}" alt="${escapeHtml(label)} preview" loading="lazy"></div><div class="drawing-file-meta"><span>DRAWING ${String(i+1).padStart(2,'0')}</span><b>${escapeHtml(label)}</b><small>${escapeHtml(d.part_name||d.source_filename||'Engineering drawing')}</small></div><em>PDF</em>`;card.onclick=()=>selectReport(i);el.appendChild(card)});
}
function renderReportExcelList(){
  const el=$('reportExcelList');el.innerHTML='';$('reportExcelCount').textContent=`${reports.length} report${reports.length!==1?'s':''}`;
  reports.forEach((r,i)=>{const card=document.createElement('button');card.type='button';card.className='excel-file-card'+(i===reportIndex?' active':'');card.innerHTML=`<div class="excel-file-icon">XLSX</div><div><b>${escapeHtml(r.drawing_number||`Drawing ${i+1}`)}</b><small>${escapeHtml(r.part_name||'Inspection report')} · ${r.rows.length} characteristics</small></div><em>›</em>`;card.onclick=()=>selectReport(i);el.appendChild(card)});
}
function renderReportEditor(){
  const r=reports[reportIndex];if(!r)return;
  renderReportDrawingGallery();renderReportExcelList();
  $('reportDrawingTitle').textContent=r.drawing_number||`Drawing ${reportIndex+1}`;$('reportPageNo').textContent='1';$('reportPartName').value=r.part_name||'';$('reportDrawingNo').value=r.drawing_number||'';$('reportCustomer').value=r.customer||'';$('reportRevision').value=r.revision||'00';$('reportDate').value=r.report_date||todayIso();$('reportInspectedQty').value=r.inspected_qty||'';$('reportTotalQty').value=r.total_qty||'';$('reportRemarks').value=r.remarks||'';$('reportInspectedBy').value=r.inspected_by||'';$('reportQcIncharge').value=r.qc_incharge||'';$('reportApprovedBy').value=r.approved_by||'';
  const qty=inspectedQtyCount(r),head=$('reportTableHead');
  head.innerHTML='<th>SL.NO<span class="col-resizer"></span></th><th>DISCRIPTION<span class="col-resizer"></span></th><th>DIMENSION<span class="col-resizer"></span></th><th>INSTRUMENT<span class="col-resizer"></span></th>'+Array.from({length:qty},(_,i)=>`<th class="reading-head">${i+1}<span class="col-resizer"></span></th>`).join('');
  const body=$('reportRows');body.innerHTML='';
  r.rows.forEach((row,rowIndex)=>{ensureReadings(row,qty);const tr=document.createElement('tr');tr.dataset.rowIndex=rowIndex;tr.innerHTML=`<td><span class="report-balloon">${row.number}</span><span class="row-resizer" title="Drag to resize row"></span></td><td><input data-field="description" value="${escapeHtml(row.description)}" /></td><td><input data-field="dimension" value="${escapeHtml(row.dimension)}" /></td><td><input data-field="instrument" value="${escapeHtml(row.instrument)}" /></td>`+row.readings.map((v,i)=>`<td><input class="reading-input" data-reading-index="${i}" value="${escapeHtml(v||'')}" /></td>`).join('');body.appendChild(tr)});
  for(let blank=0;blank<2;blank++){const tr=document.createElement('tr');tr.className='report-spare-row';tr.innerHTML='<td><span class="row-resizer" title="Drag to resize row"></span></td><td><input aria-label="Spare inspection description" /></td><td><input aria-label="Spare inspection dimension" /></td><td><input aria-label="Spare inspection instrument" /></td>'+Array.from({length:qty},(_,i)=>`<td><input aria-label="Spare inspection reading ${i+1}" /></td>`).join('');body.appendChild(tr)}
  if(!r.rows.length)body.insertAdjacentHTML('afterbegin',`<tr><td colspan="${4+qty}" class="report-empty">No balloons are available for this drawing.</td></tr>`);
  $('reportFooterStatus').textContent=`${r.drawing_number||`Drawing ${reportIndex+1}`} · ${qty} inspected result column${qty!==1?'s':''} · PDF + editable Excel`;
  enableExcelGridResize();
}
function enableExcelGridResize(){
  const table=document.querySelector('.excel-report-table');if(!table)return;
  table.querySelectorAll('th .col-resizer').forEach(handle=>{
    handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const th=handle.parentElement,startX=e.clientX,startW=th.getBoundingClientRect().width;handle.setPointerCapture?.(e.pointerId);const move=ev=>{const w=Math.max(46,startW+ev.clientX-startX);th.style.width=w+'px';th.style.minWidth=w+'px'};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)};
  });
  table.querySelectorAll('tr .row-resizer').forEach(handle=>{
    handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const tr=handle.closest('tr'),startY=e.clientY,startH=tr.getBoundingClientRect().height;handle.setPointerCapture?.(e.pointerId);const move=ev=>{const h=Math.max(25,startH+ev.clientY-startY);tr.style.height=h+'px';tr.querySelectorAll('input').forEach(inp=>inp.style.height=Math.max(24,h-1)+'px')};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)};
  });
}

function reportPayload(r){const qty=inspectedQtyCount(r);return {...r,rows:r.rows.map(x=>{const readings=ensureReadings(x,qty);return {...x,number:Number(x.number)||1,readings,reading1:readings[0]||'',reading2:readings[1]||''}})}}
function drawingExportPayload(d){const finalBalloons=normalizedExportBalloons(d.balloons);d.balloons=JSON.parse(JSON.stringify(finalBalloons));return{balloons:finalBalloons,original_balloons:d.originalBalloons||[],learn:true,project_name:$('projectTitle').textContent,drawing_number:d.drawing_number||''}}
function projectDrawingPayload(){saveCurrentState();return drawings.filter(d=>d.balloons?.length).map(d=>{const finalBalloons=normalizedExportBalloons(d.balloons);d.balloons=JSON.parse(JSON.stringify(finalBalloons));return{drawing_id:d.drawing_id,balloons:finalBalloons,original_balloons:d.originalBalloons||[],drawing_number:d.drawing_number||''}})}
async function downloadCurrentDrawing(){saveReportForm();const d=drawings[reportIndex];const res=await fetch(`${API}/export-one/${d.drawing_id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(drawingExportPayload(d))});if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.detail||'Drawing PDF export failed')}downloadBlob(await res.blob(),`${(d.drawing_number||'drawing').replace(/[^a-z0-9_-]+/gi,'_')}_ballooned.pdf`)}
async function downloadAllDrawings(){saveReportForm();const res=await fetch(`${API}/export-project/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_name:$('projectTitle').textContent,learn:true,drawings:projectDrawingPayload()})});if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.detail||'Drawing ZIP export failed')}downloadBlob(await res.blob(),`${($('projectTitle').textContent||'drawings').replace(/[^a-z0-9_-]+/gi,'_')}_ballooned_drawings.zip`)}
async function downloadCurrentExcel(){saveReportForm();const r=reports[reportIndex];const res=await fetch(`${API}/inspection-report/${r.drawing_id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reportPayload(r))});if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.detail||'Excel export failed')}downloadBlob(await res.blob(),`${(r.drawing_number||'drawing').replace(/[^a-z0-9_-]+/gi,'_')}_inspection_report.xlsx`)}
async function downloadAllExcels(){saveReportForm();const res=await fetch(`${API}/inspection-reports/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_name:$('projectTitle').textContent,reports:reports.map(reportPayload)})});if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.detail||'Excel ZIP export failed')}downloadBlob(await res.blob(),`${($('projectTitle').textContent||'reports').replace(/[^a-z0-9_-]+/gi,'_')}_inspection_reports.zip`)}
let downloadChoiceType='drawing';
function openDownloadChoice(type){
  saveReportForm();downloadChoiceType=type;const isDrawing=type==='drawing',r=reports[reportIndex];
  $('downloadChoiceTitle').textContent=isDrawing?'Download ballooned drawings':'Download Excel inspection reports';
  $('downloadChoiceText').textContent=isDrawing?'Choose the selected drawing PDF or all reviewed drawing PDFs as a ZIP.':'Choose the selected editable Excel report or all drawing reports as a ZIP.';
  $('downloadSeparateText').textContent=isDrawing?`Selected: ${r?.drawing_number||'current drawing'} PDF`:`Selected: ${r?.drawing_number||'current drawing'} Excel`;
  $('downloadBulkText').textContent=isDrawing?`All ${drawings.length} drawing PDFs in ZIP`:`All ${reports.length} Excel reports in ZIP`;
  $('downloadChoiceModal').classList.remove('hidden');
}
function closeDownloadChoice(){$('downloadChoiceModal').classList.add('hidden')}
$('nextBtn').onclick=()=>{const total=drawings.length,reviewed=drawings.filter(d=>d.reviewed).length;if(!total||reviewed!==total)return toast('Mark every drawing reviewed before continuing');buildReports();reportIndex=0;switchView('reportView');renderReportEditor();requestAnimationFrame(fitExcelView)};
$('reportBackBtn').onclick=()=>{saveReportForm();switchView('editorView');renderDrawingNav();updateReviewProgress();requestAnimationFrame(fitView)};
$('reportInspectedQty').addEventListener('change',()=>{saveReportForm();renderReportEditor();requestAnimationFrame(fitExcelView)});
$('downloadDrawingsBtn').onclick=()=>openDownloadChoice('drawing');
$('downloadExcelsBtn').onclick=()=>openDownloadChoice('excel');
$('downloadChoiceClose').onclick=closeDownloadChoice;
$('downloadChoiceModal').addEventListener('click',e=>{if(e.target===$('downloadChoiceModal'))closeDownloadChoice()});
$('downloadSeparateBtn').onclick=async()=>{const btn=$('downloadSeparateBtn');btn.disabled=true;try{if(downloadChoiceType==='drawing')await downloadCurrentDrawing();else await downloadCurrentExcel();closeDownloadChoice();toast(downloadChoiceType==='drawing'?'Selected drawing PDF downloaded':'Selected editable Excel downloaded')}catch(e){toast(e.message)}finally{btn.disabled=false}};
$('downloadBulkBtn').onclick=async()=>{const btn=$('downloadBulkBtn');btn.disabled=true;try{if(downloadChoiceType==='drawing')await downloadAllDrawings();else await downloadAllExcels();closeDownloadChoice();toast(downloadChoiceType==='drawing'?`Downloaded ${drawings.length} drawing PDFs as ZIP`:`Downloaded ${reports.length} Excel reports as ZIP`)}catch(e){toast(e.message)}finally{btn.disabled=false}};
$('backBtn').onclick=()=>{if(confirm('Return to upload screen? Current unsaved review changes will be cleared.'))location.reload()};
const themeMenu=$('themeMenu');
function setCursorStyle(name){
  const value='d-balloon';
  document.body.dataset.cursor=value;
  document.querySelectorAll('.cursor-swatch').forEach(b=>b.classList.toggle('active',b.dataset.cursor===value));
}
setCursorStyle('d-balloon');
document.querySelectorAll('.cursor-swatch').forEach(btn=>btn.onclick=e=>{e.stopPropagation();setCursorStyle(btn.dataset.cursor)});
function setAccentTheme(name){
  const allowed=['blue','teal','violet','orange','rose','cyan'];
  const value=allowed.includes(name)?name:'blue';
  document.body.dataset.accentTheme=value;
  document.querySelectorAll('.theme-swatch').forEach(b=>b.classList.toggle('active',b.dataset.theme===value));
  try{localStorage.setItem('inspectballoon-accent',value)}catch(_){}
}
function setAppearance(dark){
  document.body.classList.toggle('dark',!!dark);
  $('darkModeBtn').textContent=dark?'☀ Light appearance':'☾ Dark appearance';
  try{localStorage.setItem('inspectballoon-dark-v14',dark?'1':'0')}catch(_){}
}
function closeThemeMenu(){themeMenu.classList.add('hidden');$('themeBtn').setAttribute('aria-expanded','false')}
function openThemeMenu(){themeMenu.classList.remove('hidden');$('themeBtn').setAttribute('aria-expanded','true')}
$('themeBtn').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();themeMenu.classList.contains('hidden')?openThemeMenu():closeThemeMenu()});
themeMenu.addEventListener('click',e=>e.stopPropagation());
document.querySelectorAll('.theme-swatch').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setAccentTheme(btn.dataset.theme);closeThemeMenu()}));
$('darkModeBtn').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setAppearance(!document.body.classList.contains('dark'))});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.theme-control'))closeThemeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeThemeMenu()});
let savedAccent='blue',savedDark=true;
try{
  savedAccent=localStorage.getItem('inspectballoon-accent')||'blue';
  const storedAppearance=localStorage.getItem('inspectballoon-dark-v14');
  savedDark=storedAppearance===null?true:storedAppearance==='1';
}catch(_){}
setAccentTheme(savedAccent);
setAppearance(savedDark);

// Fixed-viewport safeguard: keep the current drawing contained after browser resize.
let __viewportRefitTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(__viewportRefitTimer);
  __viewportRefitTimer=setTimeout(()=>{
    const editor=document.getElementById('editorView');
    if(editor && !editor.classList.contains('hidden') && typeof fitView==='function') fitView();
  },120);
});

// Desktop workspace footer synchronization.
(function initWorkspaceChrome(){
  const byId=id=>document.getElementById(id);
  const footerDrawing=byId('footerDrawing'), footerPage=byId('footerPage'), footerBalloons=byId('footerBalloons'), footerReviewed=byId('footerReviewed'), footerZoom=byId('footerZoom');
  function syncFooter(){
    if(footerDrawing && byId('currentDrawingNumber')) footerDrawing.textContent=byId('currentDrawingNumber').textContent||'—';
    if(footerPage && byId('pageLabel')) footerPage.textContent=byId('pageLabel').textContent||'Page 1';
    if(footerBalloons && byId('balloonCount')) footerBalloons.textContent=byId('balloonCount').textContent||'0';
    if(footerReviewed && byId('reviewedText')) footerReviewed.textContent=byId('reviewedText').textContent||'0 / 0 reviewed';
    if(footerZoom && byId('zoomLabel')) footerZoom.textContent=byId('zoomLabel').textContent||'100%';
  }
  ['currentDrawingNumber','pageLabel','balloonCount','reviewedText','zoomLabel'].forEach(id=>{
    const el=byId(id); if(el && 'MutationObserver' in window) new MutationObserver(syncFooter).observe(el,{childList:true,subtree:true,characterData:true});
  });
  const footerFit=byId('footerFitBtn'); if(footerFit) footerFit.addEventListener('click',()=>{const btn=byId('resetBtn'); if(btn) btn.click();});
  const reportTitle=byId('reportDrawingTitle'), reportStatus=byId('reportFooterStatus');
  if(reportTitle && reportStatus && 'MutationObserver' in window){new MutationObserver(()=>{reportStatus.textContent=`Editing ${reportTitle.textContent||'inspection report'}`}).observe(reportTitle,{childList:true,subtree:true,characterData:true});}
  syncFooter();
})();
