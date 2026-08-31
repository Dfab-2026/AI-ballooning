import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  CheckCircle2,
  Download,
  FileImage,
  FileStack,
  FolderOpen,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import DrawingViewer from './components/DrawingViewer';
import { analyzeDrawing, downloadBlob, exportOne, exportProject, health, learn, uploadBatch } from './api';

const SUPPORTED = ['pdf', 'png', 'jpg', 'jpeg'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function filename(file) {
  return file.webkitRelativePath || file.name;
}

function supported(file) {
  return SUPPORTED.includes((file.name.split('.').pop() || '').toLowerCase());
}

function statusLabel(status) {
  if (status === 'ready') return 'Ready';
  if (status === 'analyzing') return 'Analyzing';
  if (status === 'error') return 'Needs retry';
  return 'Queued';
}

export default function App() {
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const [server, setServer] = useState(null);
  const [queue, setQueue] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [project, setProject] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [balloonsById, setBalloonsById] = useState({});
  const [originalById, setOriginalById] = useState({});
  const [selectedBalloon, setSelectedBalloon] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [learnOnExport, setLearnOnExport] = useState(true);
  const [dark, setDark] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    health().then(setServer).catch(() => setServer({ ok: false }));
  }, []);

  const active = drawings.find((d) => d.drawing_id === activeId) || drawings[0];
  const balloons = active ? balloonsById[active.drawing_id] || [] : [];
  const analyzed = drawings.filter((d) => d.status === 'ready').length;
  const errors = drawings.filter((d) => d.status === 'error').length;
  const processing = drawings.filter((d) => d.status === 'analyzing').length;
  const pending = Math.max(0, drawings.length - analyzed - errors - processing);
  const activeIndex = active ? drawings.findIndex((d) => d.drawing_id === active.drawing_id) + 1 : 0;

  function resetProject() {
    setProject(null);
    setDrawings([]);
    setBalloonsById({});
    setOriginalById({});
    setSelectedBalloon(null);
    setActiveId(null);
    setSearch('');
    setMessage('');
  }

  function addFiles(list) {
    const incoming = Array.from(list || []).filter(supported);
    setQueue((prev) => {
      const seen = new Set(prev.map((file) => `${filename(file)}:${file.size}`));
      return [...prev, ...incoming.filter((file) => !seen.has(`${filename(file)}:${file.size}`))];
    });
  }

  async function doUpload() {
    if (!queue.length) {
      setMessage('Choose drawing files or a folder first.');
      return;
    }
    setUploading(true);
    setMessage('Uploading files and preparing previews...');
    try {
      const result = await uploadBatch(queue, projectName);
      const prepared = result.drawings.map((drawing) => ({
        ...drawing,
        status: 'queued',
        progress: 'Waiting to analyze',
      }));
      setProject(result);
      setDrawings(prepared);
      setActiveId(prepared[0]?.drawing_id || null);
      setQueue([]);
      setMessage(`${prepared.length} drawing sheet${prepared.length === 1 ? '' : 's'} prepared. Analysis is starting now.`);
      await sleep(150);
      analyzeAll(prepared);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function analyzeAll(source = drawings) {
    if (!source.length || batchRunning) return;
    setBatchRunning(true);
    const todo = source.filter((drawing) => drawing.status !== 'ready');
    const concurrency = Math.min(3, todo.length);
    let cursor = 0;

    async function worker() {
      while (cursor < todo.length) {
        const index = cursor++;
        const item = todo[index];
        setDrawings((current) =>
          current.map((drawing) =>
            drawing.drawing_id === item.drawing_id
              ? { ...drawing, status: 'analyzing', progress: `Analyzing ${index + 1}/${todo.length}` }
              : drawing,
          ),
        );
        try {
          const result = await analyzeDrawing(item.drawing_id);
          const chars = result.characteristics || [];
          setBalloonsById((current) => ({ ...current, [item.drawing_id]: chars }));
          setOriginalById((current) => ({ ...current, [item.drawing_id]: structuredClone(chars) }));
          setDrawings((current) =>
            current.map((drawing) =>
              drawing.drawing_id === item.drawing_id
                ? {
                    ...drawing,
                    status: 'ready',
                    drawing_number: result.drawing_number || drawing.drawing_number,
                    count: chars.length,
                    progress: `${chars.length} balloons detected`,
                  }
                : drawing,
            ),
          );
        } catch (error) {
          setDrawings((current) =>
            current.map((drawing) =>
              drawing.drawing_id === item.drawing_id
                ? { ...drawing, status: 'error', error: error.message, progress: 'Retry needed' }
                : drawing,
            ),
          );
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    setBatchRunning(false);
    setMessage('Analysis finished. Review the ready drawings and retry any failed sheet.');
  }

  async function retryOne(id) {
    const target = drawings.find((drawing) => drawing.drawing_id === id);
    const order = drawings.filter((drawing) => drawing.status !== 'ready').findIndex((drawing) => drawing.drawing_id === id) + 1;
    const totalPending = drawings.filter((drawing) => drawing.status !== 'ready').length || 1;
    setDrawings((current) =>
      current.map((drawing) =>
        drawing.drawing_id === id
          ? { ...drawing, status: 'analyzing', error: '', progress: `Analyzing ${order || 1}/${totalPending}` }
          : drawing,
      ),
    );
    try {
      const result = await analyzeDrawing(id);
      const chars = result.characteristics || [];
      setBalloonsById((current) => ({ ...current, [id]: chars }));
      setOriginalById((current) => ({ ...current, [id]: structuredClone(chars) }));
      setDrawings((current) =>
        current.map((drawing) =>
          drawing.drawing_id === id
            ? {
                ...drawing,
                status: 'ready',
                drawing_number: result.drawing_number || drawing.drawing_number,
                count: chars.length,
                progress: `${chars.length} balloons detected`,
              }
            : drawing,
        ),
      );
      if (target?.drawing_id === active?.drawing_id) {
        setMessage('This drawing has been analyzed again and is ready for review.');
      }
    } catch (error) {
      setDrawings((current) =>
        current.map((drawing) =>
          drawing.drawing_id === id ? { ...drawing, status: 'error', error: error.message, progress: 'Retry needed' } : drawing,
        ),
      );
    }
  }

  function setActiveBalloons(next) {
    if (!active) return;
    setBalloonsById((current) => ({
      ...current,
      [active.drawing_id]: typeof next === 'function' ? next(current[active.drawing_id] || []) : next,
    }));
  }

  function addBalloon() {
    if (!active) return;
    setActiveBalloons((items) => [
      ...items,
      {
        number: Math.max(0, ...items.map((balloon) => balloon.number)) + 1,
        text: 'Manual characteristic',
        type: 'OTHER',
        x: 120,
        y: 120,
        target_x: 170,
        target_y: 170,
        source: 'manual',
      },
    ]);
  }

  function deleteSelected() {
    if (selectedBalloon == null) return;
    setActiveBalloons((items) =>
      items
        .filter((balloon) => balloon.number !== selectedBalloon)
        .map((balloon, index) => ({ ...balloon, number: index + 1 })),
    );
    setSelectedBalloon(null);
  }

  function updateSelected(field, value) {
    setActiveBalloons((items) =>
      items.map((balloon) => (balloon.number === selectedBalloon ? { ...balloon, [field]: value } : balloon)),
    );
  }

  const selectedData = balloons.find((balloon) => balloon.number === selectedBalloon);
  const filteredBalloons = balloons.filter((balloon) =>
    `${balloon.number} ${balloon.text || ''} ${balloon.type || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function saveLearningForCurrent() {
    if (!active) return;
    await learn(active.drawing_id, {
      original_balloons: originalById[active.drawing_id] || [],
      final_balloons: balloons,
      project_name: projectName,
      drawing_number: active.drawing_number || '',
    });
    setMessage('Corrections saved as reviewer learning memory.');
  }

  async function downloadCurrent() {
    if (!active) return;
    const blob = await exportOne(active.drawing_id, {
      balloons,
      original_balloons: originalById[active.drawing_id] || [],
      learn: learnOnExport,
      project_name: projectName,
      drawing_number: active.drawing_number || '',
    });
    downloadBlob(blob, `${active.drawing_number || 'drawing'}_ballooned.pdf`);
    setExportOpen(false);
  }

  async function downloadAll() {
    if (!project) return;
    const payload = {
      project_name: projectName || project.project_name,
      learn: learnOnExport,
      drawings: drawings
        .filter((drawing) => balloonsById[drawing.drawing_id]?.length)
        .map((drawing) => ({
          drawing_id: drawing.drawing_id,
          balloons: balloonsById[drawing.drawing_id],
          original_balloons: originalById[drawing.drawing_id] || [],
          drawing_number: drawing.drawing_number || '',
        })),
    };
    const blob = await exportProject(project.project_id, payload);
    downloadBlob(blob, `${projectName || 'ballooned_drawings'}.zip`);
    setExportOpen(false);
  }

  const readyPercent = drawings.length ? (analyzed / drawings.length) * 100 : 0;

  return (
    <div className={`app ${dark ? 'dark' : ''}`}>
      <header className="topbar premium-topbar">
        <div className="brand">
          <div className="brand-mark">IB</div>
          <div>
            <strong>InspectBalloon</strong>
            <span>Engineering Drawing Workspace</span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className={`server-pill ${server?.ok ? 'ok' : ''}`}>
            {server?.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {server?.ok ? `Analysis service ready${server.analysis_configured ? ' · configured' : ' · add API key'}` : 'Backend offline'}
          </div>
          <button className="theme-btn" onClick={() => setDark((value) => !value)} title="Toggle appearance">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {!project ? (
        <main className="upload-page premium-upload-page">
          <section className="upload-shell">
            <div className="hero premium-hero">
              <span className="eyebrow">
                <BrainCircuit size={15} />
                DRAWING INSPECTION AUTOMATION
              </span>
              <h1>
                Keep every drawing review <span>clean, aligned, and ready to export.</span>
              </h1>
              <p>
                Upload single drawings, multi-page PDFs, or a full folder. The workspace prepares previews, detects
                characteristics, places numbered balloons, and gives you a simple review flow for every sheet.
              </p>
              <div className="workflow-strip">
                <div className="workflow-step active">
                  <b>01</b>
                  <span>Upload</span>
                </div>
                <i></i>
                <div className="workflow-step">
                  <b>02</b>
                  <span>Analyze</span>
                </div>
                <i></i>
                <div className="workflow-step">
                  <b>03</b>
                  <span>Review</span>
                </div>
                <i></i>
                <div className="workflow-step">
                  <b>04</b>
                  <span>Export</span>
                </div>
              </div>
              <div className="hero-proof">
                <span>
                  <Check size={14} />
                  Multi-drawing batches
                </span>
                <span>
                  <Check size={14} />
                  Auto-ballooning review
                </span>
                <span>
                  <Check size={14} />
                  Saved corrections
                </span>
              </div>
            </div>

            <section className="upload-panel premium-upload-card">
              <div className="card-head">
                <div>
                  <span className="section-label">NEW BALLOONING PROJECT</span>
                  <h2>Build a neat review queue</h2>
                </div>
                <span className="secure-tag">Local workspace</span>
              </div>

              <div className="upload-grid">
                <div className="upload-main-card">
                  <label className="field-label">Project name</label>
                  <input
                    className="premium-input"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="e.g. DFAB Batch 24 - Rev B"
                  />

                  <div className="upload-actions premium-sources">
                    <button className="source-card" onClick={() => fileInput.current?.click()}>
                      <div className="source-icon">
                        <FileStack />
                      </div>
                      <strong>Upload Files</strong>
                      <span>Select one or many PDF, PNG, or JPG drawing files</span>
                    </button>

                    <button className="source-card" onClick={() => folderInput.current?.click()}>
                      <div className="source-icon">
                        <FolderOpen />
                      </div>
                      <strong>Upload Folder</strong>
                      <span>Bring in a complete drawing folder in one step</span>
                    </button>
                  </div>

                  <input
                    ref={fileInput}
                    hidden
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(event) => addFiles(event.target.files)}
                  />
                  <input
                    ref={folderInput}
                    hidden
                    type="file"
                    multiple
                    webkitdirectory=""
                    directory=""
                    onChange={(event) => addFiles(event.target.files)}
                  />

                  <button className="primary big premium-primary" disabled={!queue.length || uploading} onClick={doUpload}>
                    {uploading ? (
                      <>
                        <Loader2 className="spin" />
                        Preparing drawings...
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        Upload and Analyze
                      </>
                    )}
                  </button>
                </div>

                <div className="upload-side-card">
                  <div className="queue-head">
                    <span>Selected drawings</span>
                    <b>
                      {queue.length} file{queue.length === 1 ? '' : 's'}
                    </b>
                  </div>

                  <div className="file-queue">
                    {queue.length ? (
                      queue.map((file, index) => (
                        <div className="queued-file" key={`${filename(file)}-${index}`}>
                          <FileImage size={16} />
                          <span title={filename(file)}>{filename(file)}</span>
                          <button onClick={() => setQueue((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                            <X size={15} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="queue-empty">
                        <Upload size={20} />
                        <span>No drawings selected yet</span>
                        <small>Choose files or a folder to start building the review batch.</small>
                      </div>
                    )}
                  </div>

                  <div className="upload-side-stats">
                    <div>
                      <strong>{queue.length || 0}</strong>
                      <span>Queued now</span>
                    </div>
                    <div>
                      <strong>PDF PNG JPG</strong>
                      <span>Supported types</span>
                    </div>
                  </div>
                </div>
              </div>

              {message && <div className="message premium-message">{message}</div>}
            </section>
          </section>
        </main>
      ) : (
        <main className="workspace premium-workspace">
          <div className="workspace-header">
            <div className="workspace-project">
              <button className="back-project" onClick={resetProject}>
                ←
              </button>
              <div>
                <strong>{projectName || project.project_name}</strong>
                <span>
                  {drawings.length} drawing sheet{drawings.length === 1 ? '' : 's'} · {analyzed}/{drawings.length} analyzed
                </span>
              </div>
            </div>

            <div className="stepper">
              <span className="done">Upload</span>
              <i></i>
              <span className="done">Analyze</span>
              <i></i>
              <span className="current">Review</span>
              <i></i>
              <span>Export</span>
            </div>

            <div className="header-actions">
              <button className="secondary" onClick={saveLearningForCurrent} disabled={!balloons.length}>
                <BrainCircuit />
                Save corrections
              </button>
              <button className="primary" onClick={() => setExportOpen(true)} disabled={!balloons.length}>
                <Download />
                Export
              </button>
            </div>
          </div>

          <div className="workspace-body">
            <aside className="drawing-list premium-drawing-list">
              <div className="panel-head">
                <div>
                  <span>Drawing navigator</span>
                  <strong>Review sheets</strong>
                </div>
                <button className="icon-btn" onClick={resetProject} title="New project">
                  <Plus size={17} />
                </button>
              </div>

              <div className="progress-card premium-progress">
                <div>
                  <strong>{analyzed}/{drawings.length}</strong>
                  <span>Analyzed</span>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${readyPercent}%` }} />
                </div>
                <div className="progress-meta">
                  <span>{processing > 0 ? `${processing} running` : `${pending} waiting`}</span>
                  {errors > 0 && <small>{errors} need retry</small>}
                </div>
              </div>

              <div className="drawing-buttons">
                {drawings.map((drawing, index) => (
                  <button
                    key={drawing.drawing_id}
                    className={`drawing-button ${active?.drawing_id === drawing.drawing_id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveId(drawing.drawing_id);
                      setSelectedBalloon(null);
                      setSearch('');
                    }}
                  >
                    <span className={`status-dot ${drawing.status}`}>
                      {drawing.status === 'ready' ? (
                        <Check size={12} />
                      ) : drawing.status === 'analyzing' ? (
                        <Loader2 size={12} className="spin" />
                      ) : drawing.status === 'error' ? (
                        '!'
                      ) : (
                        String(index + 1).padStart(2, '0')
                      )}
                    </span>
                    <span className="drawing-label">
                      <strong>{drawing.drawing_number || `Drawing ${String(index + 1).padStart(2, '0')}`}</strong>
                      <small>{drawing.status === 'error' ? 'Analysis failed · click retry' : drawing.progress || statusLabel(drawing.status)}</small>
                    </span>
                    {drawing.status === 'error' && (
                      <RefreshCw
                        size={15}
                        onClick={(event) => {
                          event.stopPropagation();
                          retryOne(drawing.drawing_id);
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <button className="secondary full analyze-pending" disabled={batchRunning} onClick={() => analyzeAll(drawings)}>
                {batchRunning ? (
                  <>
                    <Loader2 className="spin" />
                    Analyzing batch
                  </>
                ) : (
                  <>
                    <BrainCircuit />
                    Analyze pending
                  </>
                )}
              </button>
            </aside>

            <section className="center-column premium-center">
              <div className="canvas-meta">
                <div className="doc-info">
                  <span className={`mini-status ${active?.status || ''}`}></span>
                  <b>{active?.drawing_number || 'Select drawing'}</b>
                  <span>•</span>
                  <span>{active?.status === 'ready' ? `${balloons.length} balloons detected` : active?.progress || 'Waiting'}</span>
                  {activeIndex > 0 && (
                    <>
                      <span>•</span>
                      <span>{activeIndex}/{drawings.length}</span>
                    </>
                  )}
                </div>
                <div className="hint">Mouse wheel = zoom · drag blank area = pan · drag balloon = reposition</div>
              </div>

              <DrawingViewer
                drawing={active}
                balloons={balloons}
                setBalloons={setActiveBalloons}
                selected={selectedBalloon}
                setSelected={setSelectedBalloon}
              />

              {message && <div className="workspace-message">{message}</div>}

              <div className="editor-footer">
                <div>
                  <span className="legend balloon-legend"></span> Balloon
                  <span className="legend target-legend"></span> Leader target
                </div>
                <div>{active?.status === 'ready' ? 'Ready for review' : statusLabel(active?.status)}</div>
              </div>
            </section>

            <aside className="properties premium-properties">
              <div className="panel-tabs">
                <button className="active">Characteristics</button>
                <button className={selectedData ? 'has-selection' : ''}>Properties</button>
              </div>

              <div className="panel-summary">
                <div>
                  <span>Detected</span>
                  <b>{balloons.length}</b>
                </div>
                <div>
                  <span>Selected</span>
                  <b>{selectedBalloon ?? '-'}</b>
                </div>
              </div>

              <div className="search-box">
                <Search size={14} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number / value" />
              </div>

              <div className="tool-row premium-tool-row">
                <button onClick={addBalloon}>
                  <Plus size={16} />
                  Add balloon
                </button>
                <button onClick={deleteSelected} disabled={selectedBalloon == null}>
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>

              {active?.status === 'analyzing' && (
                <div className="analysis-state">
                  <div className="scan-mini">
                    <Loader2 className="spin" />
                  </div>
                  <strong>{active.progress || 'Analyzing'}</strong>
                  <span>Open another ready drawing while this sheet finishes in the background.</span>
                </div>
              )}

              {active?.status === 'error' && (
                <div className="error-state">
                  <AlertTriangle />
                  <strong>Analysis failed</strong>
                  <span>{active.error}</span>
                  <button onClick={() => retryOne(active.drawing_id)}>Retry drawing</button>
                </div>
              )}

              <div className="character-list">
                {filteredBalloons.length ? (
                  filteredBalloons.map((balloon) => (
                    <button
                      className={selectedBalloon === balloon.number ? 'selected' : ''}
                      key={balloon.number}
                      onClick={() => setSelectedBalloon(balloon.number)}
                    >
                      <i>{balloon.number}</i>
                      <span>
                        <strong>{balloon.text || 'Untitled characteristic'}</strong>
                        <small>
                          {balloon.type} · {balloon.source || 'AI'}
                        </small>
                      </span>
                      <em>{balloon.type || 'OTHER'}</em>
                    </button>
                  ))
                ) : (
                  <div className="empty-characteristics">
                    {balloons.length ? 'No matching characteristics.' : 'Detected characteristics will appear here.'}
                  </div>
                )}
              </div>

              {selectedData && (
                <div className="editor-card">
                  <span className="section-label">SELECTED BALLOON #{selectedData.number}</span>
                  <label>
                    Detected value
                    <input value={selectedData.text || ''} onChange={(event) => updateSelected('text', event.target.value)} />
                  </label>
                  <label>
                    Characteristic type
                    <select value={selectedData.type || 'OTHER'} onChange={(event) => updateSelected('type', event.target.value)}>
                      {['DIM', 'DIA', 'RAD', 'ANG', 'TOL', 'HOLE', 'THREAD', 'GD&T', 'SURFACE', 'DATUM', 'OTHER'].map(
                        (item) => (
                          <option key={item}>{item}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <small>Move the balloon directly on the drawing, then export or save your corrections for future reviews.</small>
                </div>
              )}
            </aside>
          </div>
        </main>
      )}

      {exportOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setExportOpen(false)}>
          <div className="modal premium-modal">
            <button className="modal-close" onClick={() => setExportOpen(false)}>
              <X />
            </button>
            <div className="modal-icon">
              <Download />
            </div>
            <span className="section-label">EXPORT REVIEWED DRAWINGS</span>
            <h3>Download ballooned drawings</h3>
            <p>Export this drawing separately or package every analyzed drawing into one ZIP.</p>
            <label className="training-toggle">
              <input type="checkbox" checked={learnOnExport} onChange={(event) => setLearnOnExport(event.target.checked)} />
              <span>
                <strong>Use my corrections for future analysis</strong>
                <small>Stores reviewed differences between detected and final balloons as local examples for upcoming drawings.</small>
              </span>
            </label>
            <div className="modal-actions">
              <button className="secondary" onClick={downloadCurrent}>
                Current drawing PDF
              </button>
              <button className="primary" onClick={downloadAll}>
                All drawings ZIP
              </button>
            </div>
            <button className="link-btn" onClick={() => setExportOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
