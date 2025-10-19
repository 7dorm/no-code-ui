import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ProjectHandler } from './project/ProjectHandler';
import { Toolbar } from './components/Toolbar';
import { Workspace } from './components/Workspace';
import { ElementLibrary } from './components/ElementLibrary';

export function App(){
  const [project,setProject] = useState(ProjectHandler.load() || ProjectHandler.createEmpty());
  useEffect(()=>{ return ProjectHandler.subscribe(setProject); },[]);

  return (
    <div className="app">
      <div className="left">
        <div className="panel"><Toolbar /></div>
        <div className="panel"><ElementLibrary /></div>
        <div className="panel">
          <h4>Files</h4>
          <textarea style={{width:'100%',height:140}} value={project.files['main.txt']||''} onInput={(e:any)=>ProjectHandler.updateFile('main.txt', e.target.value)} />
          <div style={{marginTop:8,display:'flex',gap:8}}>
            <button className="btn" onClick={()=>ProjectHandler.exportHTML()}>Export HTML</button>
            <button className="btn" onClick={()=>ProjectHandler.exportZip()}>Export ZIP</button>
          </div>
        </div>
      </div>
      <div className="workspace panel" style={{flex:1}}>
        <Workspace />
      </div>
    </div>
  )
}
