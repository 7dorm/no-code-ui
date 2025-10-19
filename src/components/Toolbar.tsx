import { h } from 'preact';
import { ProjectHandler } from '../project/ProjectHandler';

export function Toolbar(){
  return (
    <div>
      <h3>Toolbar</h3>
      <div className="toolbar">
        <button className="btn" onClick={()=>ProjectHandler.addElementData({kind:'div', x:40,y:40,w:120,h:80, props:{}})}>Add div</button>
        <button className="btn" onClick={()=>ProjectHandler.addElementData({kind:'button', x:60,y:60,w:120,h:36, props:{label:'Click'}})}>Add button</button>
        <button className="btn" onClick={()=>ProjectHandler.addElementData({kind:'img', x:80,y:80,w:160,h:100, props:{src:'https://via.placeholder.com/160'}})}>Add image</button>
      </div>
    </div>
  )
}
