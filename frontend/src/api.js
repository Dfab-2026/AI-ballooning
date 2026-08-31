export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

async function parseError(response) {
  let message = `${response.status} ${response.statusText}`;
  try {
    const data = await response.json();
    message = data.detail || data.message || message;
  } catch {}
  return message;
}

export async function health() {
  const r = await fetch(`${API}/health`);
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}

export async function uploadBatch(files, projectName) {
  const body = new FormData();
  files.forEach((file) => body.append('files', file, file.name));
  body.append('project_name', projectName || 'Drawing Ballooning Project');
  const r = await fetch(`${API}/upload-batch`, { method: 'POST', body });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}

export async function analyzeDrawing(id) {
  const r = await fetch(`${API}/analyze-ai/${id}`, { method: 'POST' });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}

export async function exportOne(id, payload) {
  const r = await fetch(`${API}/export-one/${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await parseError(r));
  return r.blob();
}

export async function exportProject(projectId, payload) {
  const r = await fetch(`${API}/export-project/${projectId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await parseError(r));
  return r.blob();
}

export async function learn(id, payload) {
  const r = await fetch(`${API}/learn/${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
