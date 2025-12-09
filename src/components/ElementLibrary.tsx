import { h } from 'preact';
import { ELEMENT_REGISTRY } from '../elements/registry';
import { ProjectHandler } from '../project/ProjectHandler';

export function ElementLibrary(){
  const items = Object.keys(ELEMENT_REGISTRY);
  return (
    <div>
      <h4>Element Library</h4>
      {items.map(kind=>(
        <div className="library-item" key={kind} onClick={()=>add(kind)}>
          <div style={{width:40,height:28,background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',justifyContent:'center'}}>{kind}</div>
          <div style={{flex:1}}>{kind}</div>
        </div>
      ))}
    </div>
  );

  function add(kind:string){
    ProjectHandler.addElementData({kind: kind as any, x:40, y:40, w:120, h:80, props: {}});
  }
}
