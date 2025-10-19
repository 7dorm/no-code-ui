import { ElementData } from '../types';
import { v4 } from '../utils/uuid';

export type ProjectData = {
  elements: ElementData[];
  files: Record<string,string>;
  mode: 'visual'|'text';
}

const STORAGE_KEY = 'pvw_redo_v1';

let state: ProjectData = {
  elements: [],
  files: {'main.txt':'// start'},
  mode: 'visual'
};

type Listener = (p:ProjectData)=>void;
const listeners: Listener[] = [];

export const ProjectHandler = {
  load(): ProjectData | null {
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      state = JSON.parse(raw);
      return state;
    }catch(e){ return null; }
  },
  createEmpty(): ProjectData {
    state = {elements:[], files:{'main.txt':'// start'}, mode:'visual'};
    return state;
  },
  subscribe(cb: Listener){
    listeners.push(cb);
    cb(state);
    return ()=>{ const i = listeners.indexOf(cb); if(i>=0) listeners.splice(i,1); };
  },
  notify(){
    listeners.forEach(cb=>cb(state));
  },
  save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
    this.notify();
  },
  updateFile(name:string, content:string){
    state.files[name]=content;
    this.save();
  },
  addElementData(data: Omit<ElementData,'id'>){
    const el: ElementData = {...data, id: v4()};
    state.elements.push(el);
    this.save();
    return el;
  },
  updateElement(id:string, patch:Partial<ElementData>){
    const el = state.elements.find(e=>e.id===id); if(!el) return;
    Object.assign(el, patch);
    this.save();
  },
  deleteElement(id:string){
    state.elements = state.elements.filter(e=>e.id!==id);
    this.save();
  },
  setElements(arr:ElementData[]){
    state.elements = arr;
    this.save();
  },
  exportHTML(proj?:ProjectData){
    proj = proj || state;
    const payload = JSON.stringify(proj);
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><pre>${payload.replace(/</g,'&lt;')}</pre></body></html>`;
    const blob = new Blob([html],{type:'text/html'});
    if(blob.size <= 1024*1024){
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='project_preview.html'; a.click();
      URL.revokeObjectURL(url);
    }else{
      // fallback - create zip via JSZip if available
      (this as any)._zipAndDownload('project_preview.html', html);
    }
  },
  exportZip(proj?:ProjectData){
    proj = proj || state;
    const payload = JSON.stringify(proj, null, 2);
    (this as any)._zipAndDownloadMultiple({'project.json': payload, 'README.txt':'Exported project'});
  }
};

// helpers for zip using CDN-loaded JSZip
async function _loadJSZip(){
  if((window as any).JSZip) return (window as any).JSZip;
  await new Promise((resolve,reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.0/dist/jszip.min.js';
    s.onload = ()=>resolve(null);
    s.onerror = ()=>reject(new Error('failed to load jszip'));
    document.head.appendChild(s);
  });
  return (window as any).JSZip;
}

(ProjectHandler as any)._zipAndDownload = async function(filename:string, content:string){
  try{
    const JSZip = await _loadJSZip();
    const zip = new JSZip();
    zip.file(filename, content);
    const blob = await zip.generateAsync({type:'blob'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='project.zip'; a.click();
    URL.revokeObjectURL(a.href);
  }catch(e){
    const blob = new Blob([content],{type:'text/html'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download=filename; a.click();
    URL.revokeObjectURL(a.href);
  }
};

(ProjectHandler as any)._zipAndDownloadMultiple = async function(filesMap:{[k:string]:string}){
  try{
    const JSZip = await _loadJSZip();
    const zip = new JSZip();
    Object.keys(filesMap).forEach(k=>zip.file(k, filesMap[k]));
    const blob = await zip.generateAsync({type:'blob'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='project.zip'; a.click();
    URL.revokeObjectURL(a.href);
  }catch(e){
    const blob = new Blob([filesMap['project.json']||'{}'],{type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='project.json'; a.click();
    URL.revokeObjectURL(a.href);
  }
};

export default ProjectHandler;
